import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/collab/ot.dart';

/// Simulates N clients + host with random network delays and checks every
/// replica converges to the host document.
void main() {
  test('transform primitives converge', () {
    const doc = '你好世界abc';
    final pairs = <(Ops, Ops)>[
      ([const Ins(2, 'X')], [const Ins(2, 'Y')]),
      ([const Del(1, 3)], [const Ins(2, 'Z')]),
      ([const Ins(3, 'Q')], [const Del(0, 5)]),
      ([const Del(0, 4)], [const Del(2, 4)]),
      ([const Del(2, 2), const Ins(2, '新')], [const Del(1, 5)]),
    ];
    for (final (a, b) in pairs) {
      final (a1, b1) = transform(a, b);
      expect(applyOps(applyOps(doc, a), b1), applyOps(applyOps(doc, b), a1), reason: '$a vs $b');
    }
  });

  test('diffOps roundtrip incl. emoji', () {
    for (final (x, y) in [('abc', 'abXc'), ('😀😀', '😀🙂'), ('中文输入', '中文'), ('', 'x'), ('x', '')]) {
      expect(applyOps(x, diffOps(x, y)), y);
    }
  });

  test('random concurrent sessions converge', () {
    final rnd = Random(42);
    for (var round = 0; round < 60; round++) {
      final server = OtServerDoc('初始文本 hello');
      const n = 3;
      final clients = List.generate(n, (_) => OtClientState(0, server.text));
      // per-client inbound queues (from server) and outbound (to server)
      final inbox = List.generate(n, (_) => <Map<String, Object>>[]);
      final outbox = List.generate(n, (_) => <(int, Ops)>[]);

      void serverReceive(int i) {
        final (rev, ops) = outbox[i].removeAt(0);
        final applied = server.receive(rev, ops);
        inbox[i].add({'t': 'ack'});
        for (var j = 0; j < n; j++) {
          if (j != i) inbox[j].add({'t': 'op', 'ops': applied});
        }
      }

      void clientReceive(int i) {
        final m = inbox[i].removeAt(0);
        final c = clients[i];
        if (m['t'] == 'ack') {
          final next = c.ack();
          if (next != null) outbox[i].add((c.rev, next));
        } else {
          c.remote(m['ops'] as Ops);
        }
      }

      void localEdit(int i) {
        final c = clients[i];
        final t = c.text;
        String next;
        if (t.isNotEmpty && rnd.nextBool()) {
          final s = rnd.nextInt(t.length);
          final e = (s + 1 + rnd.nextInt(3)).clamp(0, t.length);
          next = t.replaceRange(s, e, rnd.nextBool() ? '' : '字${rnd.nextInt(9)}');
        } else {
          final p = t.isEmpty ? 0 : rnd.nextInt(t.length + 1);
          next = t.replaceRange(p, p, ['a', '中', 'xy', '\n'][rnd.nextInt(4)]);
        }
        final send = c.local(diffOps(t, next), next);
        if (send != null) outbox[i].add((c.rev, send));
      }

      for (var step = 0; step < 200; step++) {
        final i = rnd.nextInt(n);
        switch (rnd.nextInt(3)) {
          case 0:
            localEdit(i);
          case 1:
            if (outbox[i].isNotEmpty) serverReceive(i);
          case 2:
            if (inbox[i].isNotEmpty) clientReceive(i);
        }
      }
      // flush
      var progress = true;
      while (progress) {
        progress = false;
        for (var i = 0; i < n; i++) {
          while (outbox[i].isNotEmpty) {
            serverReceive(i);
            progress = true;
          }
          while (inbox[i].isNotEmpty) {
            clientReceive(i);
            progress = true;
          }
        }
      }
      for (final c in clients) {
        expect(c.text, server.text, reason: 'round $round');
      }
    }
  });
}
