/// Minimal operational transformation for plain text (UTF-16 offsets, the
/// same units TextEditingController uses). Central-server model (ot.js
/// style): the host orders operations; clients rebase pending edits.
library;

sealed class TextOp {
  const TextOp();
  List<Object> toJson();
  static TextOp fromJson(List<dynamic> j) =>
      j[0] == 0 ? Ins((j[1] as num).toInt(), j[2] as String) : Del((j[1] as num).toInt(), (j[2] as num).toInt());
}

class Ins extends TextOp {
  const Ins(this.pos, this.text);
  final int pos;
  final String text;
  @override
  List<Object> toJson() => [0, pos, text];
  @override
  String toString() => 'Ins($pos,"$text")';
  @override
  bool operator ==(Object o) => o is Ins && o.pos == pos && o.text == text;
  @override
  int get hashCode => Object.hash(pos, text);
}

class Del extends TextOp {
  const Del(this.pos, this.len);
  final int pos;
  final int len;
  @override
  List<Object> toJson() => [1, pos, len];
  @override
  String toString() => 'Del($pos,$len)';
  @override
  bool operator ==(Object o) => o is Del && o.pos == pos && o.len == len;
  @override
  int get hashCode => Object.hash(pos, len);
}

typedef Ops = List<TextOp>;

List<List<Object>> opsToJson(Ops ops) => [for (final o in ops) o.toJson()];
Ops opsFromJson(Object? j) => j is List ? [for (final o in j) TextOp.fromJson(o as List)] : const [];

String applyOps(String text, Ops ops) {
  var s = text;
  for (final o in ops) {
    switch (o) {
      case Ins(:final pos, text: final t):
        if (pos < 0 || pos > s.length) throw StateError('ins out of range');
        s = s.replaceRange(pos, pos, t);
      case Del(:final pos, :final len):
        if (pos < 0 || pos + len > s.length) throw StateError('del out of range');
        s = s.replaceRange(pos, pos + len, '');
    }
  }
  return s;
}

bool _hi(int c) => c >= 0xD800 && c <= 0xDBFF;

/// Ops turning [a] into [b] (single replace, surrogate-safe).
Ops diffOps(String a, String b) {
  if (a == b) return const [];
  var start = 0;
  final minLen = a.length < b.length ? a.length : b.length;
  while (start < minLen && a.codeUnitAt(start) == b.codeUnitAt(start)) {
    start++;
  }
  if (start > 0 && _hi(a.codeUnitAt(start - 1))) start--;
  var ea = a.length, eb = b.length;
  while (ea > start && eb > start && a.codeUnitAt(ea - 1) == b.codeUnitAt(eb - 1)) {
    ea--;
    eb--;
  }
  if (ea < a.length && ea > start && _hi(a.codeUnitAt(ea - 1))) {
    ea++;
    eb++;
  }
  return [
    if (ea > start) Del(start, ea - start),
    if (eb > start) Ins(start, b.substring(start, eb)),
  ];
}

int _shift(int x, int q, int l) => x <= q ? x : (x >= q + l ? x - l : q);

/// Transform primitive [a] (client) and [b] (server) applied to the same doc.
/// Returns (a', b'): a' applies after b, b' applies after a. Server wins ties.
(Ops, Ops) _prim(TextOp a, TextOp b) {
  switch ((a, b)) {
    case (Ins a, Ins b):
      if (a.pos < b.pos) return ([a], [Ins(b.pos + a.text.length, b.text)]);
      return ([Ins(a.pos + b.text.length, a.text)], [b]);
    case (Ins a, Del b):
      if (a.pos <= b.pos) return ([a], [Del(b.pos + a.text.length, b.len)]);
      if (a.pos >= b.pos + b.len) return ([Ins(a.pos - b.len, a.text)], [b]);
      final left = a.pos - b.pos;
      return (
        [Ins(b.pos, a.text)],
        [if (left > 0) Del(b.pos, left), if (b.len - left > 0) Del(b.pos + a.text.length, b.len - left)],
      );
    case (Del a, Ins b):
      if (b.pos <= a.pos) return ([Del(a.pos + b.text.length, a.len)], [b]);
      if (b.pos >= a.pos + a.len) return ([a], [Ins(b.pos - a.len, b.text)]);
      final left = b.pos - a.pos;
      return (
        [if (left > 0) Del(a.pos, left), if (a.len - left > 0) Del(a.pos + b.text.length, a.len - left)],
        [Ins(a.pos, b.text)],
      );
    case (Del a, Del b):
      final as = _shift(a.pos, b.pos, b.len), ae = _shift(a.pos + a.len, b.pos, b.len);
      final bs = _shift(b.pos, a.pos, a.len), be = _shift(b.pos + b.len, a.pos, a.len);
      return ([if (ae > as) Del(as, ae - as)], [if (be > bs) Del(bs, be - bs)]);
  }
}

/// Transform op lists. Returns (A', B') with apply(apply(d,A),B') == apply(apply(d,B),A').
(Ops, Ops) transform(Ops a, Ops b) {
  if (a.isEmpty || b.isEmpty) return (a, b);
  if (a.length == 1 && b.length == 1) return _prim(a.first, b.first);
  if (a.length > 1) {
    final (a0, b1) = transform([a.first], b);
    final (rest, b2) = transform(a.sublist(1), b1);
    return ([...a0, ...rest], b2);
  }
  final (a1, b0) = transform(a, [b.first]);
  final (a2, rest) = transform(a1, b.sublist(1));
  return (a2, [...b0, ...rest]);
}

/// Move a caret/selection offset through ops applied by someone else.
int transformOffset(int off, Ops ops) {
  var o = off;
  for (final op in ops) {
    switch (op) {
      case Ins(:final pos, :final text):
        if (pos < o) o += text.length;
      case Del(:final pos, :final len):
        if (o > pos) o -= (o - pos) < len ? (o - pos) : len;
    }
  }
  return o;
}

/// Host-side authoritative document.
class OtServerDoc {
  OtServerDoc(this.text);
  String text;
  final List<Ops> history = [];
  int get rev => history.length;

  /// Rebase client [ops] made at [baseRev], apply, return the applied ops.
  Ops receive(int baseRev, Ops ops) {
    if (baseRev < 0 || baseRev > rev) throw StateError('bad revision');
    var o = ops;
    for (var i = baseRev; i < history.length; i++) {
      o = transform(o, history[i]).$1;
    }
    text = applyOps(text, o);
    history.add(o);
    return o;
  }
}

/// Client-side state machine: synchronized → awaiting ack → awaiting+buffer.
class OtClientState {
  OtClientState(this.rev, this.text);
  int rev;
  String text;
  Ops? outstanding;
  Ops? buffer;

  /// Local edit already applied to [text]. Returns ops to send now (or null).
  Ops? local(Ops ops, String newText) {
    text = newText;
    if (ops.isEmpty) return null;
    if (outstanding == null) {
      outstanding = ops;
      return ops;
    }
    buffer = [...?buffer, ...ops];
    return null;
  }

  /// Server acked our outstanding ops. Returns next ops to send (or null).
  Ops? ack() {
    rev++;
    outstanding = buffer;
    buffer = null;
    return outstanding;
  }

  /// Remote ops from server. Returns ops to apply to the local document.
  Ops remote(Ops ops) {
    rev++;
    var s = ops;
    if (outstanding != null) {
      final (o, s1) = transform(outstanding!, s);
      outstanding = o;
      s = s1;
    }
    if (buffer != null) {
      final (b, s2) = transform(buffer!, s);
      buffer = b;
      s = s2;
    }
    text = applyOps(text, s);
    return s;
  }
}
