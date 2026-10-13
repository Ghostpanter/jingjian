import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/collab/collab_session.dart';
import '../theme/app_theme.dart';

const _kName = 'jingjian.collab.name.v1';

Future<String> _myName() async => (await SharedPreferences.getInstance()).getString(_kName) ?? '';

String _err(Object e) => e.toString().replaceFirst('Exception: ', '').replaceFirst('UnsupportedError: ', '');

/// 协作仅在同步方式为「静笺同步服务器」且连得上时可用。
bool collabAvailable() => CollabServer.configured() != null;

/// Returns the server when usable, otherwise shows why and returns null.
Future<CollabServer?> _requireServer(BuildContext context) async {
  final server = CollabServer.configured();
  if (server == null) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('多人协作需要连接静笺同步服务器：设置 → 同步，选择「静笺服务器」并填写地址和 Token')));
    return null;
  }
  try {
    await server.check();
    return server;
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('无法开始协作：${_err(e)}')));
    }
    return null;
  }
}

/// Start hosting the current note. Returns the live session or null.
Future<CollabSession?> showHostDialog(BuildContext context, {required String text, required String title}) async {
  final server = await _requireServer(context);
  if (server == null || !context.mounted) return null;
  final nameCtl = TextEditingController(text: await _myName());
  if (!context.mounted) return null;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('发起协作'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('通过你的静笺同步服务器开一个协作房间。连接同一服务器的设备输入房间码即可加入，实时一起编辑这篇笔记。'),
        const SizedBox(height: 12),
        TextField(
          controller: nameCtl,
          decoration: const InputDecoration(labelText: '你的名字', border: OutlineInputBorder()),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('发起')),
      ],
    ),
  );
  final name = nameCtl.text.trim().isEmpty ? '发起人' : nameCtl.text.trim();
  nameCtl.dispose();
  if (ok != true) return null;
  await (await SharedPreferences.getInstance()).setString(_kName, name);
  try {
    return await CollabSession.hostRoom(server, text: text, title: title, name: name);
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发起协作失败：${_err(e)}')));
    }
    return null;
  }
}

/// Join a room. Returns the live session or null.
Future<CollabSession?> showJoinDialog(BuildContext context) async {
  final server = await _requireServer(context);
  if (server == null || !context.mounted) return null;
  final prefs = await SharedPreferences.getInstance();
  final codeCtl = TextEditingController();
  final nameCtl = TextEditingController(text: prefs.getString(_kName) ?? '');
  if (!context.mounted) return null;
  CollabSession? result;
  await showDialog<void>(
    context: context,
    builder: (ctx) {
      var busy = false;
      String msg = '';
      return StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('加入协作'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('服务器：${server.base}', style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
              const SizedBox(height: 12),
              TextField(
                controller: codeCtl,
                decoration: const InputDecoration(labelText: '房间码（6 位）', border: OutlineInputBorder()),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtl,
                decoration: const InputDecoration(labelText: '你的名字', border: OutlineInputBorder()),
              ),
              if (msg.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(msg, style: TextStyle(color: JingjianColors.danger)),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: busy ? null : () => Navigator.pop(ctx), child: const Text('取消')),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      set(() {
                        busy = true;
                        msg = '';
                      });
                      try {
                        final name = nameCtl.text.trim().isEmpty ? '访客' : nameCtl.text.trim();
                        final s = await CollabSession.join(server, code: codeCtl.text, name: name);
                        await prefs.setString(_kName, name);
                        result = s;
                        if (ctx.mounted) Navigator.pop(ctx);
                      } catch (e) {
                        set(() {
                          busy = false;
                          msg = _err(e);
                        });
                      }
                    },
              child: Text(busy ? '连接中…' : '加入'),
            ),
          ],
        ),
      );
    },
  );
  codeCtl.dispose();
  nameCtl.dispose();
  return result;
}

/// Room info (address/code/peers). Returns true if user chose to leave.
Future<bool?> showCollabInfo(BuildContext context, CollabSession s) async {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => ListenableBuilder(
      listenable: s,
      builder: (ctx, _) => AlertDialog(
        title: Text(s.isHost ? '协作已发起' : '协作中'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('服务器：${s.server.base}', style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
            const SizedBox(height: 8),
            if (s.isHost) const Text('让连接同一同步服务器的设备在「菜单 → 加入协作」输入房间码：'),
            SelectableText('房间码：${s.code}',
                style: TextStyle(fontSize: 22, letterSpacing: 4, fontWeight: FontWeight.w700, color: JingjianColors.accent)),
            const SizedBox(height: 12),
            Text('在线（${s.peers.length}）：', style: TextStyle(color: JingjianColors.muted)),
            for (final p in s.peers) Text('• ${p.name}${p.id == s.myId ? '（我）' : ''}'),
            const SizedBox(height: 12),
            Text(
              s.isHost ? '关闭这篇笔记或点「结束协作」会关闭房间，其他人会被断开。' : '离开后，这篇笔记保留在你本机。',
              style: TextStyle(fontSize: 12, color: JingjianColors.muted),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.isHost ? '结束协作' : '离开')),
          FilledButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('继续')),
        ],
      ),
    ),
  );
}
