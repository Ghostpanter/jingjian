import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:jingjian/services/image_upload.dart';
import 'package:jingjian/services/publish/blog_platforms.dart';

http.StreamedResponse _json(Object body, [int code = 200]) =>
    http.StreamedResponse(Stream.value(utf8.encode(jsonEncode(body))), code);

void main() {
  final bytes = Uint8List.fromList([1, 2, 3]);

  test('PicGo upload uses field "list" and reads result[0]', () async {
    late http.BaseRequest seen;
    final svc = ImageUploadService(send: (r) async {
      seen = r;
      return _json({'success': true, 'result': ['https://img.example/a.png']});
    });
    final c = ImageConfig()..uploader = ImageUploader.picgo;
    expect(await svc.upload(c, bytes, 'a.png'), 'https://img.example/a.png');
    expect((seen as http.MultipartRequest).files.single.field, 'list');
    expect(seen.url.toString(), 'http://127.0.0.1:36677/upload');
  });

  test('SM.MS sends token header + smfile, reads data.url', () async {
    late http.BaseRequest seen;
    final svc = ImageUploadService(send: (r) async {
      seen = r;
      return _json({'success': true, 'data': {'url': 'https://s2.loli.net/x.png'}});
    });
    final c = ImageConfig()
      ..uploader = ImageUploader.smms
      ..smmsToken = 'tok';
    expect(await svc.upload(c, bytes, 'x.png'), 'https://s2.loli.net/x.png');
    expect(seen.headers['Authorization'], 'tok');
    expect((seen as http.MultipartRequest).files.single.field, 'smfile');
  });

  test('upload failure surfaces an error', () async {
    final svc = ImageUploadService(send: (r) async => _json({'success': false}, 500));
    final c = ImageConfig()..uploader = ImageUploader.picgo;
    expect(svc.upload(c, bytes, 'a.png'), throwsException);
  });

  test('ImageConfig JSON round-trip', () {
    final c = ImageConfig()
      ..uploader = ImageUploader.lsky
      ..lskyUrl = 'https://p.example'
      ..keepLocalCopy = false;
    final d = ImageConfig.fromJson(jsonDecode(jsonEncode(c.toJson())) as Map<String, dynamic>);
    expect(d.uploader, ImageUploader.lsky);
    expect(d.lskyUrl, 'https://p.example');
    expect(d.keepLocalCopy, false);
  });

  test('Ghost admin JWT is valid HS256', () {
    const secret = '00112233445566778899aabbccddeeff';
    final t = ghostAdminToken('kid1:$secret', now: DateTime.fromMillisecondsSinceEpoch(1000000000));
    final parts = t.split('.');
    expect(parts.length, 3);
    String dec(String s) => utf8.decode(base64Url.decode(base64Url.normalize(s)));
    expect(jsonDecode(dec(parts[0])), {'alg': 'HS256', 'kid': 'kid1', 'typ': 'JWT'});
    final p = jsonDecode(dec(parts[1])) as Map;
    expect(p['aud'], '/admin/');
    expect(p['exp'] - p['iat'], 300);
    final key = [for (var i = 0; i < secret.length; i += 2) int.parse(secret.substring(i, i + 2), radix: 16)];
    final sig = Hmac(sha256, key).convert(utf8.encode('${parts[0]}.${parts[1]}')).bytes;
    expect(base64Url.encode(sig).replaceAll('=', ''), parts[2]);
  });

  test('XML-RPC helpers', () {
    final call = xmlRpcCall('metaWeblog.newPost', [xmlString('a<b')]);
    expect(call.contains('<methodName>metaWeblog.newPost</methodName>'), true);
    expect(call.contains('a&lt;b'), true);
    const fault = '<methodResponse><fault><value><struct><member><name>faultString</name>'
        '<value><string>bad login</string></value></member></struct></value></fault></methodResponse>';
    expect(xmlRpcFault(fault), contains('bad login'));
    const ok = '<methodResponse><params><param><value><string>42</string></value></param></params></methodResponse>';
    expect(xmlRpcString(ok), '42');
  });
}
