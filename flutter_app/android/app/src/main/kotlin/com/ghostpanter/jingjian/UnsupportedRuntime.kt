package com.ghostpanter.jingjian

import android.content.Context
import android.content.pm.PackageManager

/**
 * Block HarmonyOS / 卓易通 at process start. No UI, no log to the user.
 * Keep detection names out of release notes.
 */
internal object UnsupportedRuntime {
    fun shouldExit(context: Context): Boolean {
        if (harmonyOsBrand()) return true
        if (ohosSystemProperty()) return true
        if (zhuoyiTongMarker(context)) return true
        return false
    }

    /** Huawei/Honor BuildEx: getOsBrand() == "harmony" on HarmonyOS (incl. NEXT). */
    private fun harmonyOsBrand(): Boolean {
        return try {
            val clz = Class.forName("com.huawei.system.BuildEx")
            val brand = clz.getMethod("getOsBrand").invoke(null)?.toString().orEmpty()
            brand.equals("harmony", ignoreCase = true)
        } catch (_: Throwable) {
            false
        }
    }

    private fun ohosSystemProperty(): Boolean {
        val keys = arrayOf(
            "ohos.system.version",
            "ro.build.ohos.version",
            "ro.harmony.version.release",
            "persist.sys.ohos.version",
            "hw_sc.build.os.releasetype",
            "const.product.os.dist.name",
        )
        for (key in keys) {
            val v = sysProp(key)
            if (v.isEmpty()) continue
            if (key == "const.product.os.dist.name") {
                if (v.contains("harmony", ignoreCase = true) || v.contains("ohos", ignoreCase = true)) {
                    return true
                }
                continue
            }
            if (key == "hw_sc.build.os.releasetype") {
                // HarmonyOS releasetype values; empty/absent on stock Android.
                return true
            }
            return true
        }
        return false
    }

    /**
     * 卓易通 / dual-framework markers seen on HarmonyOS NEXT Android containers.
     * Package presence alone is not enough; require at least one OHOS/鸿蒙 cue.
     */
    private fun zhuoyiTongMarker(context: Context): Boolean {
        val pm = context.packageManager
        val packages = arrayOf(
            "com.huawei.android.launcher",
            "com.huawei.associateassistant",
            "com.hihonor.associateassistant",
            "com.huawei.hms.fwksdk.stub",
            "com.huawei.ohos.inputmethod",
        )
        var saw = false
        for (pkg in packages) {
            if (pkgInstalled(pm, pkg)) {
                saw = true
                break
            }
        }
        if (!saw) return false
        // Pair package cue with display-id HARMONY so plain Huawei/Honor Android is not killed.
        val display = sysProp("ro.build.display.id")
        return display.contains("HARMONY", ignoreCase = true) || display.contains("OpenHarmony", ignoreCase = true)
    }

    private fun pkgInstalled(pm: PackageManager, name: String): Boolean {
        return try {
            pm.getPackageInfo(name, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        } catch (_: Throwable) {
            false
        }
    }

    private fun sysProp(key: String): String {
        return try {
            val clz = Class.forName("android.os.SystemProperties")
            (clz.getMethod("get", String::class.java).invoke(null, key) as? String).orEmpty().trim()
        } catch (_: Throwable) {
            ""
        }
    }
}
