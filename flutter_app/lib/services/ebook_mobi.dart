// Port of the old app's ebook-mobi.ts: PalmDoc + HUFF/CDIC Kindle MOBI/AZW/PRC.
import 'dart:convert';
import 'dart:typed_data';

class MobiBook {
  MobiBook({required this.title, this.author, required this.html, required this.images, this.coverHref});
  final String title;
  final String? author;
  final String html;
  final Map<String, Uint8List> images; // href "mobi-image-N" -> bytes
  final String? coverHref;
}

int _u16(Uint8List b, int o) => o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0;
int _u32(Uint8List b, int o) =>
    o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) & 0xFFFFFFFF : 0;

bool looksLikeMobi(Uint8List bytes, String name) {
  if (RegExp(r'\.(mobi|azw|azw3|prc)$', caseSensitive: false).hasMatch(name)) return true;
  if (bytes.length < 68) return false;
  final type = latin1.decode(bytes.sublist(60, 68));
  return type == 'BOOKMOBI' || type == 'TEXtREAd';
}

Uint8List decompressPalmDoc(Uint8List data) {
  final out = BytesBuilder(copy: false);
  final buf = <int>[];
  for (var i = 0; i < data.length; i++) {
    final byte = data[i];
    if (byte == 0) {
      buf.add(0);
    } else if (byte <= 8) {
      final end = (i + 1 + byte).clamp(0, data.length);
      buf.addAll(data.sublist(i + 1, end));
      i += byte;
    } else if (byte <= 0x7f) {
      buf.add(byte);
    } else if (byte <= 0xbf) {
      if (i + 1 >= data.length) break;
      final pair = (byte << 8) | data[i + 1];
      i += 1;
      final distance = (pair & 0x3fff) >> 3;
      final length = (pair & 7) + 3;
      for (var c = 0; c < length; c++) {
        final at = buf.length - distance;
        buf.add(at >= 0 && at < buf.length ? buf[at] : 0);
      }
    } else {
      buf.add(32);
      buf.add(byte ^ 0x80);
    }
  }
  out.add(buf);
  return out.takeBytes();
}

int _trailingEntrySize(Uint8List data, int end) {
  var size = 0;
  for (var i = 0; i < 4 && i < end; i++) {
    final v = data[end - 1 - i];
    size |= (v & 0x7f) << (7 * i);
    if (v & 0x80 != 0) break;
  }
  return size;
}

Uint8List _stripTrailing(Uint8List data, int flags) {
  var end = data.length;
  var flag = flags >> 1;
  while (flag != 0) {
    if (flag & 1 != 0) {
      end -= _trailingEntrySize(data, end);
      if (end <= 0) return data;
    }
    flag >>= 1;
  }
  if (flags & 1 != 0 && end > 0) end -= (data[end - 1] & 3) + 1;
  return end > 0 && end < data.length ? Uint8List.sublistView(data, 0, end) : data;
}

class _DictEntry {
  _DictEntry(this.bytes, this.ready);
  Uint8List bytes;
  bool ready;
}

Uint8List Function(Uint8List) _huffCdic(List<Uint8List> records, int huffIndex, int huffCount) {
  final huff = records[huffIndex];
  if (huff.length < 24) throw Exception('无法解开 Kindle 压缩');
  final off1 = _u32(huff, 8);
  final off2 = _u32(huff, 12);
  final d1Len = List<int>.filled(256, 0);
  final d1Term = List<bool>.filled(256, false);
  final d1Max = List<int>.filled(256, 0);
  for (var i = 0; i < 256; i++) {
    final raw = _u32(huff, off1 + i * 4);
    final len = raw & 0x1f;
    d1Len[i] = len;
    d1Term[i] = raw & 0x80 != 0;
    d1Max[i] = len == 0 ? 0 : ((((raw >> 8) + 1) << (32 - len)) - 1) & 0xFFFFFFFF;
  }
  final mincode = List<int>.filled(33, 0);
  final maxcode = List<int>.filled(33, 0);
  for (var len = 1; len <= 32; len++) {
    final mn = _u32(huff, off2 + (len - 1) * 8);
    final mx = _u32(huff, off2 + (len - 1) * 8 + 4);
    mincode[len] = (mn << (32 - len)) & 0xFFFFFFFF;
    maxcode[len] = (((mx + 1) << (32 - len)) - 1) & 0xFFFFFFFF;
  }
  final dictionary = <_DictEntry>[];
  for (var o = 1; o < huffCount; o++) {
    if (huffIndex + o >= records.length) break;
    final cdic = records[huffIndex + o];
    if (cdic.length < 16) continue;
    final phrases = _u32(cdic, 8);
    final bits = _u32(cdic, 12);
    final take = [1 << bits, phrases - dictionary.length].reduce((a, b) => a < b ? a : b);
    for (var i = 0; i < take; i++) {
      final entry = _u16(cdic, 16 + i * 2);
      final blen = _u16(cdic, 16 + entry);
      final s = 18 + entry;
      final e = (s + (blen & 0x7fff)).clamp(0, cdic.length);
      dictionary.add(_DictEntry(Uint8List.sublistView(cdic, s.clamp(0, cdic.length), e), blen & 0x8000 != 0));
    }
  }

  int u64(Uint8List d, int pos) {
    // Use 64-bit ints (Dart VM ints are 64-bit; web loses precision — MOBI HUFF is VM-only).
    var v = 0;
    for (var i = 0; i < 8; i++) {
      v = (v << 8) | (pos + i < d.length ? d[pos + i] : 0);
    }
    return v;
  }

  late Uint8List Function(Uint8List) unpack;
  unpack = (Uint8List data) {
    final out = BytesBuilder(copy: false);
    var bitsLeft = data.length * 8;
    var pos = 0;
    var n = 32;
    var packed = u64(data, pos);
    var guard = 0;
    while (guard++ < 10000000) {
      if (n <= 0) {
        pos += 4;
        packed = u64(data, pos);
        n += 32;
      }
      final code = (packed >>> n) & 0xFFFFFFFF;
      final top = code >>> 24;
      var len = d1Len[top];
      var max = d1Max[top];
      if (!d1Term[top]) {
        while (len < 32 && code < mincode[len]) {
          len++;
        }
        max = maxcode[len];
      }
      if (len == 0) break;
      n -= len;
      bitsLeft -= len;
      if (bitsLeft < 0) break;
      final slot = ((max - code) & 0xFFFFFFFF) >>> (32 - len);
      if (slot >= dictionary.length) break;
      final entry = dictionary[slot];
      if (!entry.ready) {
        entry.bytes = unpack(entry.bytes);
        entry.ready = true;
      }
      out.add(entry.bytes);
    }
    return out.takeBytes();
  };
  return unpack;
}

String _decodeText(Uint8List bytes, int encoding) {
  if (encoding == 1252) return latin1.decode(bytes, allowInvalid: true);
  return utf8.decode(bytes, allowMalformed: true);
}

({String title, String author, int coverOffset}) _readExth(Uint8List r0, int mobiLen) {
  final start = 16 + mobiLen;
  if (start + 12 > r0.length || latin1.decode(r0.sublist(start, start + 4)) != 'EXTH') {
    return (title: '', author: '', coverOffset: -1);
  }
  final count = _u32(r0, start + 8);
  var off = start + 12;
  var title = '';
  var author = '';
  var cover = -1;
  for (var i = 0; i < count && off + 8 <= r0.length; i++) {
    final type = _u32(r0, off);
    final length = _u32(r0, off + 4);
    if (length < 8) break;
    final end = (off + length).clamp(0, r0.length);
    final payload = r0.sublist(off + 8, end);
    if (type == 100 && author.isEmpty) author = utf8.decode(payload, allowMalformed: true).trim();
    if ((type == 503 || type == 99) && title.isEmpty) title = utf8.decode(payload, allowMalformed: true).trim();
    if (type == 201 && payload.length >= 4) cover = _u32(payload, 0);
    off += length;
  }
  return (title: title, author: author, coverOffset: cover);
}

MobiBook parseMobi(Uint8List bytes, String name) {
  if (bytes.length < 86) throw Exception('不是有效的 Kindle 电子书');
  final count = _u16(bytes, 76);
  final offsets = [for (var i = 0; i < count; i++) _u32(bytes, 78 + i * 8)];
  final records = <Uint8List>[];
  for (var i = 0; i < offsets.length; i++) {
    final s = offsets[i].clamp(0, bytes.length);
    final e = (i + 1 < offsets.length ? offsets[i + 1] : bytes.length).clamp(s, bytes.length);
    records.add(Uint8List.sublistView(bytes, s, e));
  }
  final r0 = records.isEmpty ? Uint8List(0) : records[0];
  if (r0.length < 16) throw Exception('不是有效的 Kindle 电子书');
  final compression = _u16(r0, 0);
  if (_u16(r0, 12) != 0) throw Exception('这本书有加密，无法导入');
  final textRecords = _u16(r0, 8);
  final isMobi = r0.length >= 24 && latin1.decode(r0.sublist(16, 20)) == 'MOBI';
  final mobiLen = isMobi ? _u32(r0, 20) : 0;
  final encoding = isMobi && r0.length >= 32 ? _u32(r0, 28) : 65001;
  // All offsets below are relative to the start of record 0 (MobileRead /
  // calibre convention); a field exists when it lies inside the MOBI header.
  bool has(int off, int size) => isMobi && off + size <= 16 + mobiLen && off + size <= r0.length;
  final extraFlags = has(0xF2, 2) ? _u16(r0, 0xF2) : 0;
  final version = has(36, 4) ? _u32(r0, 36) : 0;
  final firstImage = has(108, 4) ? _u32(r0, 108) : 0;
  final huffStart = has(112, 4) ? _u32(r0, 112) : 0;
  final huffCount = has(116, 4) ? _u32(r0, 116) : 0;
  final nameOff = has(84, 4) ? _u32(r0, 84) : 0;
  final nameLen = has(88, 4) ? _u32(r0, 88) : 0;
  final exthFlags = has(128, 4) ? _u32(r0, 128) : 0;
  final exth = exthFlags & 0x40 != 0 ? _readExth(r0, mobiLen) : (title: '', author: '', coverOffset: -1);
  final headerTitle = nameLen > 0 && nameOff + nameLen <= r0.length
      ? _decodeText(r0.sublist(nameOff, nameOff + nameLen), encoding).trim()
      : '';
  final fileTitle = name.replaceAll(RegExp(r'\.[^.]+$'), '');
  final pdbName = latin1.decode(bytes.sublist(0, 32)).replaceAll(RegExp(r'\x00.*$', dotAll: true), '').trim();
  final title = [exth.title, headerTitle, fileTitle, pdbName, '未命名电子书'].firstWhere((t) => t.isNotEmpty);

  Uint8List Function(Uint8List) unpack;
  if (compression == 1) {
    unpack = (d) => d;
  } else if (compression == 2) {
    unpack = decompressPalmDoc;
  } else if (compression == 17480) {
    if (huffStart <= 0 || huffStart >= records.length) throw Exception('无法解开 Kindle 压缩');
    unpack = _huffCdic(records, huffStart, huffCount);
  } else {
    throw Exception('无法解开这本 Kindle 书的压缩');
  }

  final merged = BytesBuilder(copy: false);
  for (var i = 1; i <= textRecords && i < records.length; i++) {
    merged.add(unpack(_stripTrailing(records[i], extraFlags)));
  }
  var textBytes = merged.takeBytes();
  if (version >= 8) {
    // KF8 / AZW3: text = several "flows"; flow 0 is the XHTML (skeletons +
    // fragments stored in reading order), the rest are CSS/SVG. FDST lists them.
    final fdstIdx = has(0xC0, 4) ? _u32(r0, 0xC0) : 0;
    if (fdstIdx > 0 && fdstIdx < records.length) {
      final f = records[fdstIdx];
      if (f.length >= 20 && latin1.decode(f.sublist(0, 4)) == 'FDST') {
        final n = _u32(f, 8);
        if (n >= 1) {
          final s = _u32(f, 12).clamp(0, textBytes.length);
          final e = _u32(f, 16).clamp(s, textBytes.length);
          if (e > s) textBytes = Uint8List.sublistView(textBytes, s, e);
        }
      }
    }
  }
  var html = _decodeText(textBytes, version >= 8 ? 65001 : encoding)
      .replaceAll('\x00', '')
      .replaceAll(RegExp(r'<idx:entry[\s\S]*?</idx:entry>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<guide[\s\S]*?</guide>', caseSensitive: false), '');
  html = html.replaceAllMapped(
    RegExp(r'''<img([^>]*?)recindex=["']0*([0-9]+)["']([^>]*)>''', caseSensitive: false),
    (m) => '<img${m[1]}src="mobi-image-${int.parse(m[2]!)}"${m[3]}>',
  );
  if (version < 8) {
    // MOBI6 (calibre/kindlegen) writes headings as <font size="6|7|+N"><b>..</b></font>
    html = html
        .replaceAll(RegExp(r'</mbp:pagebreak>', caseSensitive: false), '')
        .replaceAllMapped(
          RegExp(r'''<p\b[^>]*>\s*<font\s+size=["']?(?:[5-7]|\+[1-4])["']?[^>]*>\s*<b>([\s\S]{1,120}?)</b>\s*</font>\s*</p>''',
              caseSensitive: false),
          (m) => '<h2>${m[1]}</h2>',
        );
  }
  if (version >= 8) {
    html = html
        .replaceAll(RegExp(r'<\?xml[^>]*\?>'), '')
        .replaceAll(RegExp(r'<head[\s\S]*?</head>', caseSensitive: false), '')
        .replaceAll(RegExp(r'<!DOCTYPE[^>]*>|</?html\b[^>]*>|</?body\b[^>]*>', caseSensitive: false), '');
    html = '<html><body>$html</body></html>';
    html = html
        .replaceAllMapped(
          RegExp(r'kindle:embed:([0-9A-Va-v]{4})(?:\?[^"\x27)\s>]*)?'),
          (m) => 'mobi-image-${int.parse(m[1]!, radix: 32)}',
        );
  }
  final plain = html.replaceAll(RegExp(r'<[^>]+>'), '').trim();
  final flow = RegExp(r'<(?:html|body|head|p|div|h[1-6]|mbp:pagebreak|font|span|img|br|a)\b', caseSensitive: false).hasMatch(html);
  if (plain.isEmpty || !flow) {
    throw Exception('无法解析这本 Kindle 书，可先转成 EPUB 再导入');
  }
  final images = <String, Uint8List>{};
  String? cover;
  if (firstImage > 0) {
    for (var i = firstImage; i < records.length; i++) {
      final r = records[i];
      final isImg = r.length > 3 &&
          ((r[0] == 0xff && r[1] == 0xd8) || (r[0] == 0x89 && r[1] == 0x50) || (r[0] == 0x47 && r[1] == 0x49));
      if (!isImg) continue;
      images['mobi-image-${i - firstImage + 1}'] = r;
    }
    if (exth.coverOffset >= 0) {
      final href = 'mobi-image-${exth.coverOffset + 1}';
      if (images.containsKey(href)) cover = href;
    }
  }
  return MobiBook(
    title: title,
    author: exth.author.isEmpty ? null : exth.author,
    html: html,
    images: images,
    coverHref: cover,
  );
}
