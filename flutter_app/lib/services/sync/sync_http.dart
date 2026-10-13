import 'dart:convert';

import 'package:http/http.dart' as http;

String joinUrl(List<String> parts) {
  final cleaned = <String>[];
  for (var i = 0; i < parts.length; i++) {
    var value = parts[i].trim();
    if (value.isEmpty) continue;
    if (i == 0) {
      value = value.replaceAll(RegExp(r'/+$'), '');
    } else {
      value = value.replaceAll(RegExp(r'^/+'), '').replaceAll(RegExp(r'/+$'), '');
    }
    cleaned.add(value);
  }
  return cleaned.join('/');
}

String basicAuth(String user, String password) {
  final bytes = utf8.encode('$user:$password');
  return 'Basic ${base64Encode(bytes)}';
}

Future<http.Response> syncRequest(
  String url, {
  String method = 'GET',
  Map<String, String>? headers,
  Object? body,
  int timeoutMs = 20000,
}) async {
  final client = http.Client();
  try {
    final uri = Uri.parse(url);
    final req = http.Request(method, uri);
    if (headers != null) req.headers.addAll(headers);
    if (body != null) {
      if (body is String) {
        req.bodyBytes = utf8.encode(body);
      } else if (body is List<int>) {
        req.bodyBytes = body;
      } else {
        req.body = body.toString();
      }
    }
    final streamed = await client.send(req).timeout(Duration(milliseconds: timeoutMs));
    return await http.Response.fromStream(streamed);
  } on Exception catch (e) {
    if (e.toString().contains('TimeoutException')) {
      throw Exception('连接超时');
    }
    throw Exception('无法连接同步服务，请检查地址与网络');
  } finally {
    client.close();
  }
}
