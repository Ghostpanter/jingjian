package com.ghostpanter.jingjian

import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlin.system.exitProcess

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        if (UnsupportedRuntime.shouldExit(this)) {
            finishAndRemoveTask()
            exitProcess(0)
        }
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "jingjian/legacy").setMethodCallHandler { call, result ->
            when (call.method) {
                "hasLegacy" -> result.success(LegacyExporter.hasLegacy(this))
                "export" -> LegacyExporter(this).run { out, err ->
                    if (err != null) result.error("legacy", err, null) else result.success(out)
                }
                "openTtsSettings" -> {
                    val ok = try {
                        startActivity(android.content.Intent("com.android.settings.TTS_SETTINGS").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
                        true
                    } catch (e: Exception) {
                        try {
                            startActivity(android.content.Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
                            true
                        } catch (e2: Exception) { false }
                    }
                    result.success(ok)
                }
                else -> result.notImplemented()
            }
        }
    }
}
