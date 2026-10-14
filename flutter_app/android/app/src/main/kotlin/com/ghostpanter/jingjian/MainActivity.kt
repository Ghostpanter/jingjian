package com.ghostpanter.jingjian

import android.app.AlertDialog
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlin.system.exitProcess

class MainActivity : FlutterActivity() {
    private var unsupportedRuntime = false
    private var unsupportedDialogShowing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        unsupportedRuntime = try {
            UnsupportedRuntime.isUnsupported(this)
        } catch (_: Throwable) {
            false
        }
        super.onCreate(savedInstanceState)
        if (unsupportedRuntime) {
            showUnsupportedDialog()
        }
    }

    override fun onResume() {
        super.onResume()
        if (unsupportedRuntime && !unsupportedDialogShowing && !isFinishing) {
            showUnsupportedDialog()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (unsupportedRuntime) {
            // Non-cancelable: back must not dismiss the notice.
            return
        }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    private fun showUnsupportedDialog() {
        if (isFinishing || unsupportedDialogShowing) return
        unsupportedDialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("暂不支持此运行环境")
            .setMessage("静笺暂不支持 HarmonyOS / 卓易通，应用将退出。")
            .setCancelable(false)
            .setPositiveButton("退出") { _, _ ->
                exitApp()
            }
            .show()
    }

    private fun exitApp() {
        try {
            finishAndRemoveTask()
        } catch (_: Throwable) {
            try {
                finish()
            } catch (_: Throwable) {
                // ignore
            }
        }
        exitProcess(0)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        if (unsupportedRuntime) return
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "jingjian/legacy").setMethodCallHandler { call, result ->
            when (call.method) {
                "hasLegacy" -> result.success(LegacyExporter.hasLegacy(this))
                "export" -> LegacyExporter(this).run { out, err ->
                    if (err != null) result.error("legacy", err, null) else result.success(out)
                }
                "openTtsSettings" -> {
                    val ok = try {
                        startActivity(
                            android.content.Intent("com.android.settings.TTS_SETTINGS")
                                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                        true
                    } catch (e: Exception) {
                        try {
                            startActivity(
                                android.content.Intent(android.provider.Settings.ACTION_SETTINGS)
                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                            true
                        } catch (e2: Exception) {
                            false
                        }
                    }
                    result.success(ok)
                }
                else -> result.notImplemented()
            }
        }
    }
}
