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


/// Plain-Chinese explanation for an HTTP failure from a sync backend.
/// [kind] is 'WebDAV' / 'OSS' / '同步服务器'.
String syncHttpError(String kind, int code) {
  final hint = switch (code) {
    401 => '账号、密码或密钥不正确',
    403 => '没有权限（检查账号权限、应用密码或 Bucket 授权）',
    404 => kind == 'OSS'
        ? '找不到 Bucket 或地址不对（检查 Endpoint、Bucket 名与地域）'
        : kind == 'WebDAV'
            ? '找不到同步目录（检查 WebDAV 地址与路径，例如坚果云为 https://dav.jianguoyun.com/dav/目录名/）'
            : '服务器上没有这个接口，可能需要更新并重新部署同步服务端',
    405 => '服务器不支持该操作（地址可能不是 WebDAV / 同步服务）',
    429 || 503 => '服务器繁忙或限流，请稍后重试',
    >= 500 => '服务器内部错误，请稍后重试或检查服务端日志',
    _ => '请检查 设置 → 同步 中的配置',
  };
  return '$kind 同步失败（$code）：$hint';
}
