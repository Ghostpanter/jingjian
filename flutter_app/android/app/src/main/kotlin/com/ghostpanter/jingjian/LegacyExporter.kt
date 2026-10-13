package com.ghostpanter.jingjian

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.File

/**
 * Reads the 1.7.x (Capacitor) app's data: localStorage + IndexedDB of the
 * https://localhost origin, inside a hidden WebView of the same app. Nothing
 * is deleted; the old data stays where it is.
 */
class LegacyExporter(private val context: Context) {
    companion object {
        fun hasLegacy(ctx: Context): Boolean {
            val dir = File(ctx.applicationInfo.dataDir, "app_webview")
            val ls = File(dir, "Default/Local Storage")
            val idb = File(dir, "Default/IndexedDB")
            return ls.exists() || idb.exists()
        }

        private const val PAGE = """<!doctype html><meta charset="utf-8"><script>
(async () => {
  const out = { ls: {}, overflow: {}, images: 0, errors: [] };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('jingjian.')) out.ls[k] = localStorage.getItem(k);
    }
  } catch (e) { out.errors.push('ls ' + e); }
  const open = (name) => new Promise((res) => {
    let created = false;
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => { created = true; };
    r.onsuccess = () => {
      if (created) { r.result.close(); indexedDB.deleteDatabase(name); res(null); } else res(r.result);
    };
    r.onerror = () => res(null);
  });
  const all = (db, store) => new Promise((res) => {
    try {
      if (!db.objectStoreNames.contains(store)) return res([]);
      const q = db.transaction(store, 'readonly').objectStore(store).getAll();
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => res([]);
    } catch (e) { out.errors.push('idb ' + e); res([]); }
  });
  try {
    const db = await open('jingjian.notes-overflow.v1');
    if (db) for (const row of await all(db, 'bodies')) if (row && row.id) out.overflow[row.id] = row.content;
  } catch (e) { out.errors.push('overflow ' + e); }
  try {
    const db = await open('jingjian.images.v1');
    if (db) for (const row of await all(db, 'files')) {
      if (!row || !row.id || !row.blob) continue;
      const b64 = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).replace(/^data:[^,]*,/, ''));
        fr.onerror = () => res('');
        fr.readAsDataURL(row.blob);
      });
      if (b64) { JJ.image(String(row.id), String(row.name || ''), String(row.mime || ''), b64); out.images++; }
    }
  } catch (e) { out.errors.push('images ' + e); }
  JJ.done(JSON.stringify(out));
})();
</script>"""
    }

    private val main = Handler(Looper.getMainLooper())
    private var finished = false
    private var web: WebView? = null
    val imageDir = File(context.cacheDir, "legacy_images")

    @SuppressLint("SetJavaScriptEnabled")
    fun run(cb: (String?, String?) -> Unit) {
        imageDir.deleteRecursively()
        imageDir.mkdirs()
        val finish = { out: String?, err: String? ->
            main.post {
                if (!finished) {
                    finished = true
                    web?.destroy()
                    web = null
                    cb(out, err)
                }
            }
        }
        main.post {
            try {
                val w = WebView(context)
                web = w
                w.settings.javaScriptEnabled = true
                w.settings.domStorageEnabled = true
                w.settings.databaseEnabled = true
                w.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun image(id: String, name: String, mime: String, b64: String) {
                        try {
                            val safe = id.replace(Regex("[^A-Za-z0-9_-]"), "_")
                            val ext = name.substringAfterLast('.', "").lowercase().takeIf { it.matches(Regex("png|jpe?g|gif|webp|bmp|svg")) }
                                ?: when {
                                    mime.contains("png") -> "png"; mime.contains("webp") -> "webp"
                                    mime.contains("gif") -> "gif"; mime.contains("svg") -> "svg"; else -> "jpg"
                                }
                            File(imageDir, "$safe.$ext").writeBytes(Base64.decode(b64, Base64.DEFAULT))
                        } catch (_: Throwable) {}
                    }

                    @JavascriptInterface
                    fun done(json: String) {
                        finish("{\"imageDir\":${org.json.JSONObject.quote(imageDir.absolutePath)},\"data\":$json}", null)
                    }
                }, "JJ")
                w.webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                        if (req.url.host == "localhost") {
                            return WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(PAGE.toByteArray()))
                        }
                        return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                    }
                }
                w.loadUrl("https://localhost/__jingjian_migrate__")
            } catch (e: Throwable) {
                finish(null, e.toString())
            }
        }
        main.postDelayed({ finish(null, "timeout") }, 60000)
    }
}
