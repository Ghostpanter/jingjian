import 'dart:convert';

/// Builds the self-contained HTML page that renders one Mermaid block.
///
/// [scriptTag] loads mermaid (inline on mobile, bundled asset URL on web).
/// [postJs] is a JS expression body for `function post(msg)` that sends a
/// string to the host: messages are `h:<height>` and `w:<deltaY>`.
String buildMermaidHtml({
  required String source,
  required String scriptTag,
  required String postJs,
  required String bg,
  required String fg,
  required String muted,
  required bool dark,
  bool forwardWheel = false,
}) {
  final vars = dark
      ? "{background:'$bg',primaryColor:'#2a2a2e',primaryTextColor:'$fg',lineColor:'#9a9a9a',"
          "textColor:'$fg',edgeLabelBackground:'$bg',"
          "cScale0:'#3b5b7a',cScale1:'#2f6b52',cScale2:'#6b4f2a',cScale3:'#5a3d75',cScale4:'#2f6470',"
          "cScale5:'#6e3a4a',cScale6:'#4b5d2e',cScale7:'#3d4a73',cScale8:'#705a2e',cScale9:'#365e5e',"
          "cScale10:'#5e3c63',cScale11:'#47566b'}"
      : "{background:'$bg'}";
  return '''
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
$scriptTag
<style>
html,body{margin:0;background:$bg;color:$fg;font-family:sans-serif;overflow:hidden}
body{padding:8px}
#m{text-align:center;overflow-x:auto;overflow-y:hidden}
#m svg{max-width:100%;height:auto}
.err{font-size:13px;line-height:1.5;text-align:left}
.err b{color:#e5534b}
.err pre{white-space:pre-wrap;color:$muted;margin:6px 0 0;font-size:12px}
</style>
</head><body><div id="m"></div><script>
function post(msg){ $postJs }
const box = document.getElementById('m');
const source = ${jsonEncode(source)};
let last = 0;
function report(){
  const h = Math.ceil(box.getBoundingClientRect().height) + 16;
  if (Math.abs(h - last) > 1) { last = h; post('h:' + h); }
}
function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function failLoad(){
  box.innerHTML = '<div class="err"><b>Mermaid 渲染引擎加载失败</b><pre>未能加载内置的 mermaid 脚本，也无法从网络获取。'
    + '若系统 WebView 版本过旧，请在应用商店更新“Android System WebView”或 Chrome 后重试。</pre></div>';
  report();
}
function fail(e){
  const msg = (e && (e.message || e.str)) || String(e || '未知错误');
  box.innerHTML = '<div class="err"><b>Mermaid 图有语法错误，无法渲染</b><pre>' + esc(msg).slice(0, 600) + '</pre></div>';
  report();
}
${forwardWheel ? "window.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); post('w:' + e.deltaY); } }, {passive:false});" : ''}
function whenReady(fn){
  let n = 0;
  (function tick(){
    if (typeof mermaid !== 'undefined') return fn();
    if (++n > 100) return failLoad(); // ~10 s incl. CDN fallback
    setTimeout(tick, 100);
  })();
}
whenReady(function(){
try {
  mermaid.initialize({startOnLoad:false, theme:'${dark ? 'dark' : 'neutral'}', darkMode:$dark,
    securityLevel:'strict', suppressErrorRendering:true, themeVariables:$vars});
  mermaid.parse(source).then(() => mermaid.render('jjsvg', source)).then(r => {
    box.innerHTML = r.svg;
    // Very wide diagrams: don't shrink below 55% — scroll sideways instead.
    const svg = box.querySelector('svg');
    let vb = svg && svg.viewBox && svg.viewBox.baseVal;
    // Some diagrams (pie legend) draw outside their viewBox; grow it to fit.
    try {
      const bb = svg.getBBox();
      if (vb && vb.width && (bb.x < vb.x || bb.y < vb.y || bb.x + bb.width > vb.x + vb.width || bb.y + bb.height > vb.y + vb.height)) {
        const x = Math.min(vb.x, bb.x) - 4, y = Math.min(vb.y, bb.y) - 4;
        const w = Math.max(vb.x + vb.width, bb.x + bb.width) + 4 - x, h = Math.max(vb.y + vb.height, bb.y + bb.height) + 4 - y;
        svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
        svg.style.maxWidth = w + 'px';
        vb = svg.viewBox.baseVal;
      }
    } catch (_) {}
    if (vb && vb.width * 0.55 > box.clientWidth) {
      svg.style.maxWidth = 'none';
      svg.style.width = Math.round(vb.width * 0.55) + 'px';
    }
    report();
    new ResizeObserver(report).observe(box);
  }).catch(fail);
} catch (e) { fail(e); }
});
</script></body></html>''';
}

/// Bundled mermaid inside the Android APK (always readable by WebView, even
/// with file access off), with a CDN fallback if it fails to load.
const mermaidCdn = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js';
const androidAssetBase = 'file:///android_asset/flutter_assets/assets/preview/';

String mermaidScriptTag(String src) =>
    '<script src="$src" onerror="var s=document.createElement(\'script\');s.src=\'$mermaidCdn\';document.head.appendChild(s)"></script>';
