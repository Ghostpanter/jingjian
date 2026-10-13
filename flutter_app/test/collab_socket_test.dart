import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/collab/collab_session.dart';

Future<void> settle() => Future.delayed(const Duration(milliseconds: 300));

/// Runs the real project sync-server (../sync-server/server.mjs) for the test.
Future<(Process, int, Directory)> startSyncServer() async {
  final tmp = await Directory.systemTemp.createTemp('jj-sync');
  final probe = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final port = probe.port;
  await probe.close();
  final p = await Process.start('node', ['../sync-server/server.mjs'],
      environment: {'PORT': '$port', 'JINGJIAN_TOKEN': 'secret-t', 'NOTES_DIR': tmp.path});
  final ready = p.stdout.transform(const SystemEncoding().decoder).firstWhere((l) => l.contains('listening'));
  p.stderr.drain<void>();
  await ready.timeout(const Duration(seconds: 10));
  return (p, port, tmp);
}

void main() {
  late Process proc;
  late CollabServer server;
  late Directory dir;
  setUpAll(() async {
    final (p, port, d) = await startSyncServer();
    proc = p;
    dir = d;
    server = CollabServer('http://127.0.0.1:$port', 'secret-t');
  });
  tearDownAll(() async {
    proc.kill();
    await dir.delete(recursive: true);
  });

  test('server health advertises collab; bad token rejected', () async {
    await server.check();
    final bad = CollabServer(server.base, 'wrong');
    await expectLater(bad.check(), throwsException);
    await expectLater(CollabSession.hostRoom(bad, text: 'x', title: 'x', name: 'x'), throwsException);
  });

  test('wsUri maps http→ws / https→wss and keeps sub-path', () {
    expect(CollabServer('https://a.example/jj/', 't').wsUri.toString(), 'wss://a.example/jj/api/collab?token=t');
    expect(CollabServer('http://1.2.3.4:8787', 't').wsUri.toString(), 'ws://1.2.3.4:8787/api/collab?token=t');
  });

  test('owner + 2 guests via sync-server converge; IME composing deferred', () async {
    final hostCtl = TextEditingController(text: '# 协作\n\n');
    final host = await CollabSession.hostRoom(server, text: hostCtl.text, title: '协作', name: '主机');
    host.bind(hostCtl, onRemoteText: (_) {});
    expect(RegExp(r'^\d{6}$').hasMatch(host.code), true);

    await expectLater(CollabSession.join(server, code: host.code == '100000' ? '100001' : '100000', name: 'x'), throwsException);

    final g1 = await CollabSession.join(server, code: host.code, name: '甲');
    final g2 = await CollabSession.join(server, code: host.code, name: '乙');
    expect(g1.title, '协作');
    final c1 = TextEditingController(), c2 = TextEditingController();
    String? saved1;
    g1.bind(c1, onRemoteText: (t) => saved1 = t);
    g2.bind(c2, onRemoteText: (_) {});
    expect(c1.text, hostCtl.text);
    await settle();
    expect(host.peers.length, 3);

    // concurrent edits
    hostCtl.value = TextEditingValue(text: '${hostCtl.text}主机写的', selection: const TextSelection.collapsed(offset: 0));
    c1.value = TextEditingValue(text: '甲:${c1.text}', selection: const TextSelection.collapsed(offset: 2));
    c2.value = TextEditingValue(text: '${c2.text}乙乙');
    await settle();
    expect(c1.text, hostCtl.text);
    expect(c2.text, hostCtl.text);
    expect(hostCtl.text.contains('主机写的') && hostCtl.text.contains('甲:') && hostCtl.text.contains('乙乙'), true);
    expect(saved1, c1.text);

    // guest 2 is composing (pinyin): remote edits must wait, not clobber IME
    c2.value = TextEditingValue(
      text: '${c2.text}zhong',
      selection: TextSelection.collapsed(offset: c2.text.length + 5),
      composing: TextRange(start: c2.text.length, end: c2.text.length + 5),
    );
    c1.value = TextEditingValue(text: 'A${c1.text}');
    await settle();
    expect(c2.text.endsWith('zhong'), true);
    expect(c2.text.startsWith('A'), false);
    // commit composition → 中
    final committed = c2.text.replaceFirst(RegExp(r'zhong$'), '中');
    c2.value = TextEditingValue(text: committed, selection: TextSelection.collapsed(offset: committed.length));
    await settle();
    expect(c2.text, hostCtl.text);
    expect(c1.text, hostCtl.text);
    expect(hostCtl.text.startsWith('A') && hostCtl.text.endsWith('中'), true);

    await g1.close();
    await settle();
    expect(host.peers.length, 2);
    await host.close();
    await settle();
    expect(g2.state, CollabState.closed);
  });
}
