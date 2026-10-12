import 'dart:convert';

import 'package:crypto/crypto.dart';

String rfc3986(String value) {
  return Uri.encodeComponent(value).replaceAllMapped(
    RegExp(r"[!'()*]"),
    (m) => '%${m.group(0)!.codeUnitAt(0).toRadixString(16).toUpperCase()}',
  );
}

String encodeS3Path(String key) => key.split('/').map(rfc3986).join('/');

String _hex(List<int> bytes) =>
    bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

Digest _hmac(List<int> key, String data) =>
    Hmac(sha256, key).convert(utf8.encode(data));

String sha256Hex(List<int> data) => _hex(sha256.convert(data).bytes);

String amzDate(DateTime date) {
  final utc = date.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${utc.year}${two(utc.month)}${two(utc.day)}T${two(utc.hour)}${two(utc.minute)}${two(utc.second)}Z';
}

Future<Map<String, String>> signS3Request({
  required String method,
  required String url,
  Map<String, String>? headers,
  List<int>? body,
  required String accessKey,
  required String secretKey,
  required String region,
  String service = 's3',
  DateTime? now,
}) async {
  final parsed = Uri.parse(url);
  final ts = amzDate(now ?? DateTime.now());
  final dateStamp = ts.substring(0, 8);
  final regionTrim = region.trim().isEmpty ? 'us-east-1' : region.trim();
  final payloadHash = sha256Hex(body ?? <int>[]);

  final hdrs = <String, String>{};
  for (final e in (headers ?? {}).entries) {
    hdrs[e.key.toLowerCase()] = e.value.trim();
  }
  hdrs['host'] = parsed.host + (parsed.hasPort ? ':${parsed.port}' : '');
  hdrs['x-amz-date'] = ts;
  hdrs['x-amz-content-sha256'] = payloadHash;

  final signedHeaderKeys = hdrs.keys.toList()..sort();
  final canonicalHeaders =
      signedHeaderKeys.map((k) => '$k:${hdrs[k]}\n').join();
  final signedHeaders = signedHeaderKeys.join(';');

  final canonicalQuery = () {
    final params = <String, String>{};
    parsed.queryParameters.forEach((k, v) => params[k] = v);
    final keys = params.keys.toList()..sort();
    return keys.map((k) => '${rfc3986(k)}=${rfc3986(params[k]!)}').join('&');
  }();

  final path = parsed.path.isEmpty ? '/' : parsed.path;
  final canonicalRequest = [
    method.toUpperCase(),
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  final credentialScope = '$dateStamp/$regionTrim/$service/aws4_request';
  final stringToSign = [
    'AWS4-HMAC-SHA256',
    ts,
    credentialScope,
    sha256Hex(utf8.encode(canonicalRequest)),
  ].join('\n');

  final kDate = _hmac(utf8.encode('AWS4$secretKey'), dateStamp).bytes;
  final kRegion = _hmac(kDate, regionTrim).bytes;
  final kService = _hmac(kRegion, service).bytes;
  final kSigning = _hmac(kService, 'aws4_request').bytes;
  final signature = _hex(_hmac(kSigning, stringToSign).bytes);

  hdrs['authorization'] =
      'AWS4-HMAC-SHA256 Credential=$accessKey/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature';
  return hdrs;
}
