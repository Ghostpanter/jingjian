import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:http/http.dart' as http;

import '../../models/sync_config.dart';
import '../app_prefs.dart';
import 'ot.dart';

const collabProtocol = 2;

/// 协作只走项目自己的同步服务端（sync-server 的 /api/collab）。
class CollabServer {
  CollabServer(this.base, this.token);
  final String base; // http(s)://host:port
  final String token;

  /// Current config if the sync provider is the project server; else null.
  static CollabServer? configured([SyncConfig? cfg]) {
    final c = cfg ?? AppPrefs.instance.readSyncConfig();
    if (c.provider != SyncProvider.server) return null;
    final base = c.serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (base.isEmpty || c.serverToken.trim().isEmpty) return null;
    return CollabServer(base, c.serverToken.trim());
  }

  Uri get wsUri {
    final u = Uri.parse(base);
    final scheme = u.scheme == 'https' ? 'wss' : 'ws';
    final path = '${u.path.replaceAll(RegExp(r'/+$'), '')}/api/collab';
    return u.replace(scheme: scheme, path: path, queryParameters: {'token': token});
  }

  /// Throws a readable error unless the server is reachable, the token is
  /// valid and the server build supports collaboration.
  Future<void> check({http.Client? client}) async {
    final c = client ?? http.Client();
    try {
      final res = await c
          .get(Uri.parse('$base/health'), headers: {'Authorization': 'Bearer $token'})
          .timeout(const Duration(seconds: 6));
      if (res.statusCode == 401) throw Exception('同步服务器 Token 不对');
      if (res.statusCode != 200) throw Exception('同步服务器返回 ${res.statusCode}');
      final j = jsonDecode(utf8.decode(res.bodyBytes));
      final v = j is Map ? j['collab'] : null;
      if (v is! num || v < collabProtocol) throw Exception('同步服务器版本过旧，不支持协作，请更新 sync-server');
    } on TimeoutException {
      throw Exception('连不上同步服务器');
    } on FormatException {
      throw Exception('同步服务器响应异常');
    } finally {
      if (client == null) c.close();
    }
  }
}

class CollabPeer {
  CollabPeer(this.id, this.name);
  final String id;
  final String name;
}

enum CollabState { connecting, live, closed }

/// One live collaboration session (host or guest). Binds to the editor's
/// TextEditingController only while active; when not in a session nothing is
/// attached, so normal typing / Chinese IME are untouched.
class CollabSession extends ChangeNotifier {
  CollabSession._(this.server, this.code, this.name, {this.isHost = false, this.initialText = '', this.initialTitle = ''});

  final CollabServer server;
  String code;
  final String name;
  final bool isHost;
  final String initialText;
  final String initialTitle;

  WebSocketChannel? _ch;
  String? _ownerKey;
  bool _closing = false;
  int _retries = 0;
  Timer? _retryTimer;
  static const maxRetries = 6;
  StreamSubscription? _sub;
  OtClientState? _ot;
  TextEditingController? _ctl;
  void Function(String text)? _onRemoteText;
  bool _applying = false;
  final _queue = <Map<String, dynamic>>[];
  Completer<String> _welcome = Completer<String>();

  CollabState state = CollabState.connecting;
  String? myId;
  String title = '';
  String? error;
  List<CollabPeer> peers = [];

  int get revision => _ot?.rev ?? 0;
  String get text => _ot?.text ?? '';

  /// Create a room on the project server for [text]; we are its owner.
  static Future<CollabSession> hostRoom(CollabServer server,
      {required String text, required String title, required String name}) async {
    final s = CollabSession._(server, '', name, isHost: true, initialText: text, initialTitle: title);
    await s._connect();
    return s;
  }

  /// Join a room on the project server by its 6-digit code.
  static Future<CollabSession> join(CollabServer server, {required String code, required String name}) async {
    final c = code.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(c)) throw Exception('房间码是 6 位数字');
    final s = CollabSession._(server, c, name);
    await s._connect();
    return s;
  }

  /// The server caps one message at 4 MB; CJK text is 3 bytes per char.
  static const maxDocBytes = 3500000;

  Map<String, Object?> get _hello => isHost && code.isEmpty
      ? {'t': 'create', 'text': initialText, 'title': initialTitle, 'name': name, 'v': collabProtocol}
      : {'t': 'hello', 'code': code, 'name': name, 'v': collabProtocol, if (_ownerKey != null) 'ownerKey': _ownerKey};

  Future<void> _connect() async {
    if (isHost && code.isEmpty && utf8.encode(initialText).length > maxDocBytes) {
      state = CollabState.closed;
      throw Exception('这篇笔记太大（超过 3.5 MB），无法多人协作');
    }
    final WebSocketChannel ch;
    try {
      ch = WebSocketChannel.connect(server.wsUri);
      _ch = ch;
      await ch.ready.timeout(const Duration(seconds: 8));
    } catch (_) {
      state = CollabState.closed;
      throw Exception('连不上同步服务器的协作服务（检查服务器地址、Token，以及反向代理是否放行 WebSocket）');
    }
    _sub = ch.stream.listen(_onData, onDone: _onDone, onError: (_) => _onDone());
    _send(_hello);
    try {
      await _welcome.future.timeout(const Duration(seconds: 8));
    } on TimeoutException {
      await close();
      throw Exception('同步服务器没有响应');
    }
  }

  void _send(Map<String, Object?> m) {
    try {
      _ch?.sink.add(jsonEncode(m));
    } catch (_) {}
  }

  bool reconnecting = false;
  bool _everLive = false;
  /// Set when a reconnect could not keep edits made while offline.
  String? notice;

  void _onDone() {
    if (state == CollabState.closed) return;
    // Lost the connection after we were live: retry quietly (Wi-Fi switch,
    // phone sleeping…). A room that was closed on purpose sends an error first.
    if (!_closing && _everLive && error == null && _retries < maxRetries) {
      reconnecting = true;
      state = CollabState.connecting;
      notifyListeners();
      _retryTimer?.cancel();
      _retryTimer = Timer(Duration(milliseconds: 800 * (1 << _retries)), _reconnect);
      _retries++;
      return;
    }
    state = CollabState.closed;
    reconnecting = false;
    error ??= _closing ? null : '已与同步服务器断开';
    if (!_welcome.isCompleted) _welcome.completeError(Exception(error ?? '连接已断开'));
    notifyListeners();
  }

  Future<void> _reconnect() async {
    if (_closing) return;
    await _sub?.cancel();
    _queue.clear();
    _welcome = Completer<String>();
    _welcome.future.ignore();
    try {
      final ch = WebSocketChannel.connect(server.wsUri);
      _ch = ch;
      await ch.ready.timeout(const Duration(seconds: 8));
      _sub = ch.stream.listen(_onData, onDone: _onDone, onError: (_) => _onDone());
      _send(_hello);
      await _welcome.future.timeout(const Duration(seconds: 8));
      _retries = 0;
      reconnecting = false;
      notifyListeners();
    } catch (_) {
      if (_welcome.isCompleted && state == CollabState.live) return;
      _onDone();
    }
  }

  void _onData(dynamic raw) {
    Map<String, dynamic> m;
    try {
      m = (jsonDecode(raw as String) as Map).cast<String, dynamic>();
    } catch (_) {
      return;
    }
    switch (m['t']) {
      case 'error':
        error = m['msg'] as String? ?? '加入失败';
        if (!_welcome.isCompleted) _welcome.completeError(Exception(error));
        notifyListeners();
        return;
      case 'welcome':
        myId = m['id'] as String?;
        final c = m['code'];
        if (c is String && c.isNotEmpty) code = c;
        final key = m['ownerKey'];
        if (key is String) _ownerKey = key;
        title = m['title'] as String? ?? '';
        var text = m['text'] as String? ?? '';
        final rev = (m['rev'] as num).toInt();
        final old = _ot;
        final resync = old != null;
        _ot = OtClientState(rev, text);
        if (old != null) {
          // Reconnected. What the user sees now (incl. unacked + offline edits):
          final desired = _ctl?.text ?? old.text;
          if (rev == old.rev && desired != text) {
            // Nobody else edited meanwhile: replay our changes on top.
            final ops = diffOps(text, desired);
            text = desired;
            final send = _ot!.local(ops, desired);
            if (send != null) _send({'t': 'op', 'rev': _ot!.rev, 'ops': opsToJson(send)});
          } else if (rev != old.rev && (desired != old.text || old.outstanding != null)) {
            notice = '重连时别人也改了内容，已以服务器版本为准，断线期间的修改未保留';
          }
        }
        _everLive = true;
        state = CollabState.live;
        if (!_welcome.isCompleted) _welcome.complete(text);
        if (resync) _setControllerText(text, null);
        notifyListeners();
        return;
      case 'peers':
        peers = [
          for (final p in (m['peers'] as List? ?? const []))
            if (p is Map) CollabPeer('${p['id']}', '${p['name']}'),
        ];
        notifyListeners();
        return;
      case 'op':
      case 'ack':
        _queue.add(m);
        _drain();
        return;
    }
  }

  bool get _composing {
    final c = _ctl;
    return c != null && c.value.composing.isValid && !c.value.composing.isCollapsed;
  }

  void _drain() {
    final ot = _ot;
    if (ot == null || _composing) return;
    while (_queue.isNotEmpty) {
      final m = _queue.removeAt(0);
      if (m['t'] == 'ack') {
        final next = ot.ack();
        if (next != null) _send({'t': 'op', 'rev': ot.rev, 'ops': opsToJson(next)});
      } else {
        final Ops applied;
        try {
          applied = ot.remote(opsFromJson(m['ops']));
        } catch (_) {
          // Corrupt state; ask for a fresh copy by rejoining.
          _send({'t': 'hello', 'code': code, 'name': name, 'v': collabProtocol});
          return;
        }
        _setControllerText(ot.text, applied);
      }
    }
  }

  void _setControllerText(String text, Ops? applied) {
    final c = _ctl;
    if (c == null) return;
    final sel = c.selection;
    TextSelection next;
    if (applied != null && sel.isValid) {
      next = TextSelection(
        baseOffset: transformOffset(sel.baseOffset, applied).clamp(0, text.length),
        extentOffset: transformOffset(sel.extentOffset, applied).clamp(0, text.length),
      );
    } else {
      next = TextSelection.collapsed(offset: sel.isValid ? sel.baseOffset.clamp(0, text.length) : text.length);
    }
    _applying = true;
    c.value = TextEditingValue(text: text, selection: next);
    _applying = false;
    _onRemoteText?.call(text);
  }

  /// Attach to an editor controller. [onRemoteText] persists remote changes.
  void bind(TextEditingController controller, {required void Function(String text) onRemoteText}) {
    unbind();
    _ctl = controller;
    _onRemoteText = onRemoteText;
    final ot = _ot;
    if (ot != null && controller.text != ot.text) {
      _setControllerText(ot.text, null);
    }
    controller.addListener(_onLocal);
  }

  void unbind() {
    _ctl?.removeListener(_onLocal);
    _ctl = null;
    _onRemoteText = null;
  }

  void _onLocal() {
    if (_applying || state != CollabState.live) return;
    final c = _ctl, ot = _ot;
    if (c == null || ot == null) return;
    // Wait for IME composition (拼音/五笔 candidates) to commit.
    if (_composing) return;
    final now = c.text;
    if (now != ot.text) {
      final ops = diffOps(ot.text, now);
      final send = ot.local(ops, now);
      if (send != null) _send({'t': 'op', 'rev': ot.rev, 'ops': opsToJson(send)});
    }
    _drain();
  }

  Future<void> close() async {
    _closing = true;
    _retryTimer?.cancel();
    if (isHost && state == CollabState.live) _send({'t': 'end'});
    unbind();
    state = CollabState.closed;
    await _sub?.cancel();
    try {
      await _ch?.sink.close();
    } catch (_) {}
    notifyListeners();
  }
}

/// App-wide: at most one live session, tied to one note.
class CollabManager extends ChangeNotifier {
  CollabManager._();
  static final CollabManager instance = CollabManager._();

  CollabSession? session;
  String? noteId;

  void attach(CollabSession s, String id) {
    session = s;
    noteId = id;
    s.addListener(notifyListeners);
    notifyListeners();
  }

  Future<void> end() async {
    final s = session;
    session = null;
    noteId = null;
    s?.removeListener(notifyListeners);
    await s?.close();
    notifyListeners();
  }
}
