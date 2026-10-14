import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/widgets/mermaid_html.dart';

const flow = r"""flowchart TB
  subgraph Frontend["前端层"]
    direction TB
    A[用户浏览器] --> B{是否已登录?}
    B -->|否| C[登录页]
    B -->|是| D[Dashboard]
    C --> E[OAuth / 账号密码]
    E --> F[Token 签发]
    F --> D
  end
  subgraph Gateway["API 网关"]
    direction LR
    G[Nginx / Traefik] --> H[限流 & 鉴权中间件]
    H --> I[路由分发]
  end
  subgraph Services["微服务层"]
    direction TB
    I --> J[用户服务]
    I --> K[订单服务]
    I --> L[支付服务]
    I --> M[通知服务]
  end
  D --> G
""";

String page(String src) => buildMermaidHtml(
    source: flow, scriptTag: mermaidScriptTag(src), postJs: 'document.title=msg;',
    bg: '#000000', fg: '#eeeeee', muted: '#999999', dark: true);

void main() {
  test('android page references the bundled asset, not an inline 2.6 MB script', () {
    final html = page('${androidAssetBase}mermaid.min.js');
    expect(html.length, lessThan(20000));
    expect(html, contains('file:///android_asset/flutter_assets/assets/preview/mermaid.min.js'));
    expect(html, contains(mermaidCdn)); // fallback
    expect(html, contains('渲染引擎加载失败'));
    if (Platform.environment['JJ_MM_OUT'] != null) {
      final d = Platform.environment['JJ_MM_OUT']!;
      File('$d/ok.html').writeAsStringSync(page('mermaid.min.js'));
      File('$d/bad.html').writeAsStringSync(page('missing.js'));
    }
  });
}
