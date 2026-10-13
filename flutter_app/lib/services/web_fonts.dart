import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// Web only: load the bundled Simplified Chinese font (Noto Sans CJK SC,
/// GB2312 subset, SIL OFL) from `web/fonts/` and register it under the
/// families the app asks for. Without it Flutter web downloads Noto from
/// fonts.gstatic.com, so Chinese turns into boxes when that is blocked or
/// the page is used offline / on an intranet.
Future<bool> loadWebCjkFont({Duration timeout = const Duration(seconds: 30)}) async {
  if (!kIsWeb) return false;
  try {
    final res = await http.get(Uri.base.resolve('fonts/jj-cjk-sc.otf')).timeout(timeout);
    if (res.statusCode != 200 || res.bodyBytes.length < 100000) return false;
    final data = ByteData.sublistView(res.bodyBytes);
    for (final family in const ['sans-serif', 'serif', 'Roboto', 'JJCJK']) {
      final loader = FontLoader(family)..addFont(Future.value(data));
      await loader.load();
    }
    return true;
  } catch (_) {
    return false;
  }
}
