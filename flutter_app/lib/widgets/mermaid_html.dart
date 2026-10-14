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
  bool fullscreen = false,
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
html,body{margin:0;background:$bg;color:$fg;font-family:sans-serif;overflow:hidden${fullscreen ? ';height:100%' : ''}}
body{padding:8px;box-sizing:border-box;-webkit-user-select:none;user-select:none}
#m{position:relative;text-align:center;overflow:hidden;touch-action:none${fullscreen ? ';height:100%' : ''}}
#vp{transform-origin:0 0;will-change:transform}
#m svg{max-width:100%;height:auto${fullscreen ? ';max-height:calc(100vh - 16px)' : ''}}
.tb{position:fixed;top:6px;right:6px;display:flex;gap:4px;z-index:9;opacity:.85}
.tb button{width:30px;height:30px;padding:0;border-radius:6px;border:1px solid $muted;background:$bg;color:$fg;font-size:16px;line-height:28px;touch-action:manipulation}
.tb button:active{background:$muted}
.err{font-size:13px;line-height:1.5;text-align:left}
.err b{color:#e5534b}
.err pre{white-space:pre-wrap;color:$muted;margin:6px 0 0;font-size:12px}
</style>
</head><body><div id="m"></div><script>
const FULL = $fullscreen;
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
${panZoomJs(forwardWheel: forwardWheel)}
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
    // Wide diagrams fit the width; use ＋/双击/双指 to zoom in and drag.
    setupPanZoom(svg);
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

/// Pan / pinch-zoom / double-tap / ctrl+wheel / trackpad for the rendered SVG,
/// plus toolbar (＋ － 复位 全屏).
///
/// Gesture rule (Obsidian / Typora-like):
/// - Pinch open = zoom in, pinch close = zoom out (pivot under fingers).
/// - Trackpad: two-finger drag pans when engaged; pinch or Ctrl/⌘+scroll zooms.
/// - Touch: after the diagram is engaged (any pinch, toolbar zoom, double-tap,
///   or a horizontal-ish drag), one-finger pans. At 1x fit and not engaged,
///   vertical one-finger drag / two-finger scroll still scrolls the note.
/// - Full screen: always engaged (free pan).
/// - Double-tap toggles 2x at the point / fit (复位).
/// Posts `z:<scale>`, `e:0|1` (engaged) so the host can hand touches to the
/// WebView, `f` for 全屏, and `w:<dy>` (web) to forward note scroll.
String panZoomJs({bool forwardWheel = false}) => '''
let S = 1, TX = 0, TY = 0, vp = null, ENG = FULL ? 1 : 0;
const MIN = FULL ? 0.3 : 1, MAX = 8;
let _raf = 0, _dirty = false;
function postState(){ post('z:' + S.toFixed(3)); post('e:' + (ENG || FULL ? 1 : 0)); }
function apply(){
  if (!vp) return;
  if (S <= MIN + 0.001 && !FULL) { S = MIN; TX = 0; TY = 0; }
  vp.style.transform = 'translate(' + TX + 'px,' + TY + 'px) scale(' + S + ')';
  _dirty = true;
  if (_raf) return;
  _raf = requestAnimationFrame(function(){ _raf = 0; if (_dirty) { _dirty = false; postState(); } });
}
function engage(){ if (!ENG) { ENG = 1; postState(); } }
function canPan(){ return FULL || ENG || S > 1.001; }
function zoomAt(f, cx, cy){
  const r = box.getBoundingClientRect();
  const x = cx - r.left, y = cy - r.top;
  const prev = S;
  const n = Math.min(MAX, Math.max(MIN, S * f));
  if (Math.abs(n - prev) < 1e-6) return;
  TX = x - (x - TX) * (n / prev); TY = y - (y - TY) * (n / prev); S = n;
  if (S > 1.001) engage();
  apply();
}
function zoomCenter(f){ const r = box.getBoundingClientRect(); engage(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
function resetView(){ S = 1; TX = 0; TY = 0; if (!FULL) ENG = 0; apply(); postState(); }
function setupPanZoom(svg){
  if (!svg) return;
  vp = document.createElement('div'); vp.id = 'vp';
  svg.parentNode.insertBefore(vp, svg); vp.appendChild(svg);
  const tb = document.createElement('div'); tb.className = 'tb';
  const btn = (t, title, fn) => { const b = document.createElement('button'); b.textContent = t; b.title = title;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => { e.stopPropagation(); fn(); }); tb.appendChild(b); };
  btn('＋', '放大', () => zoomCenter(1.4));
  btn('－', '缩小', () => zoomCenter(1 / 1.4));
  btn('⟲', '复位', resetView);
  if (!FULL) btn('⛶', '全屏查看', () => post('f'));
  document.body.appendChild(tb);
  const pts = new Map();
  let lastDist = 0, lastMid = null, lastTap = 0, tapX = 0, tapY = 0, moved = 0, panArmed = false, axisLock = '';
  const passScroll = $forwardWheel;
  box.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
    moved = 0; lastDist = 0; lastMid = null; panArmed = false; axisLock = '';
  });
  box.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size >= 2) {
      const arr = [...pts.values()];
      const a = arr[0], b = arr[1];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      if (lastDist > 0 && d > 0) {
        engage();
        TX += mid.x - lastMid.x; TY += mid.y - lastMid.y;
        zoomAt(d / lastDist, mid.x, mid.y);
      }
      lastDist = d; lastMid = mid; e.preventDefault();
    } else if (canPan()) {
      if (!panArmed) { if (moved < 3) return; panArmed = true; }
      TX += dx; TY += dy; apply(); e.preventDefault();
    } else {
      if (!axisLock && moved >= 4) axisLock = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'h' : 'v';
      if (axisLock === 'h') {
        engage(); panArmed = true; TX += dx; TY += dy; apply(); e.preventDefault();
      } else if (axisLock === 'v' && passScroll) {
        e.preventDefault(); post('w:' + (-dy));
      }
    }
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    lastDist = 0; lastMid = null;
    if (pts.size === 0 && moved < 10) {
      const now = Date.now();
      if (now - lastTap < 320 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 28) {
        if (S > 1.05) resetView(); else { engage(); zoomAt(2, e.clientX, e.clientY); }
        lastTap = 0;
      } else { lastTap = now; tapX = e.clientX; tapY = e.clientY; }
    }
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  postState();
}
window.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); engage(); zoomAt(Math.exp(-e.deltaY / 280), e.clientX, e.clientY); return; }
  if (canPan()) { e.preventDefault(); TX -= e.deltaX; TY -= e.deltaY; apply(); return; }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.1 && Math.abs(e.deltaX) > 0.5) {
    e.preventDefault(); engage(); TX -= e.deltaX; TY -= e.deltaY; apply(); return;
  }
  ${forwardWheel ? "if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); post('w:' + e.deltaY); }" : ''}
}, {passive:false});
''';
