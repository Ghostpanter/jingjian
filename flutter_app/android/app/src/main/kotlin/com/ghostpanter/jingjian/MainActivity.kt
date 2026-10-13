package com.ghostpanter.jingjian

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "jingjian/legacy").setMethodCallHandler { call, result ->
            when (call.method) {
                "hasLegacy" -> result.success(LegacyExporter.hasLegacy(this))
                "export" -> LegacyExporter(this).run { out, err ->
                    if (err != null) result.error("legacy", err, null) else result.success(out)
                }
                else -> result.notImplemented()
            }
        }
    }
}
