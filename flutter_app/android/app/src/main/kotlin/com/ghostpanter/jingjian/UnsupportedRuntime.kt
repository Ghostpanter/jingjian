package com.ghostpanter.jingjian

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Detect HarmonyOS and 卓易通 (Android compatibility container on HarmonyOS NEXT).
 *
 * Conservative by design: every probe is try/catch; any failure means "supported".
 * Signals are Harmony/卓易通-specific so ColorOS / MIUI / stock Android stay clear.
 *
 * Pure string helpers below are unit-testable without a device.
 */
object UnsupportedRuntime {

    fun isUnsupported(context: Context): Boolean {
        return try {
            isHarmonyOs() || isZhuoyitong(context)
        } catch (_: Throwable) {
            false
        }
    }

    // --- HarmonyOS ---------------------------------------------------------

    private fun isHarmonyOs(): Boolean {
        if (harmonyOsBrand()) return true
        if (ohosApiClassPresent()) return true
        if (ohosSystemProperties()) return true
        return false
    }

    /** Huawei/Honor: BuildEx.getOsBrand() == "harmony" on HarmonyOS (incl. NEXT). */
    private fun harmonyOsBrand(): Boolean {
        return try {
            val clz = Class.forName("com.huawei.system.BuildEx")
            val brand = clz.getMethod("getOsBrand").invoke(null)?.toString()
            matchesHarmonyOsBrand(brand)
        } catch (_: Throwable) {
            false
        }
    }

    /** Dual-framework / older HarmonyOS exposes ohos.* APIs on the classpath. */
    private fun ohosApiClassPresent(): Boolean {
        val names = arrayOf(
            "ohos.app.Context",
            "ohos.utils.system.SystemCapability",
        )
        for (name in names) {
            try {
                Class.forName(name)
                return true
            } catch (_: ClassNotFoundException) {
                // continue
            } catch (_: Throwable) {
                // continue
            }
        }
        return false
    }

    /**
     * System properties that only HarmonyOS (or NEXT) fills.
     * Values must look like ohos/harmony — a bare non-empty hw_sc key is not enough
     * on every OEM, so we require an ohos/harmony cue where ambiguous.
     */
    private fun ohosSystemProperties(): Boolean {
        // Strong NEXT / OHOS version props: any non-empty value is enough.
        val strongKeys = arrayOf(
            "ohos.system.version",
            "ro.build.ohos.version",
            "persist.sys.ohos.version",
            "hw_sc.build.platform.version",
        )
        for (key in strongKeys) {
            if (sysProp(key).isNotEmpty()) return true
        }

        val dist = sysProp("const.product.os.dist.name")
        if (matchesOhosDistName(dist)) return true

        val releaseType = sysProp("hw_sc.build.os.releasetype")
        if (matchesOhosReleaseType(releaseType)) return true

        return false
    }

    // --- 卓易通 ------------------------------------------------------------

    private fun isZhuoyitong(context: Context): Boolean {
        if (zhuoyitongCgroup()) return true
        if (zhuoyitongBuildFields()) return true
        if (zhuoyitongInstaller(context)) return true
        if (zhuoyitongSystemProps()) return true
        return false
    }

    /**
     * 卓易通 runs APKs inside Huawei iSulad / ANCO containers.
     * Avoid bare "lxc" alone (too generic for other containers).
     */
    private fun zhuoyitongCgroup(): Boolean {
        return try {
            val text = File("/proc/self/cgroup").takeIf { it.canRead() }?.readText().orEmpty()
            matchesZhuoyitongCgroup(text)
        } catch (_: Throwable) {
            false
        }
    }

    private fun zhuoyitongBuildFields(): Boolean {
        return try {
            val fields = listOf(
                Build.DISPLAY,
                Build.FINGERPRINT,
                Build.TAGS,
                Build.TYPE,
                sysProp("ro.build.display.id"),
            )
            fields.any { matchesZhuoyitongBuildField(it) }
        } catch (_: Throwable) {
            false
        }
    }

    private fun zhuoyitongInstaller(context: Context): Boolean {
        return try {
            val pm = context.packageManager
            val pkg = context.packageName
            val installer = if (Build.VERSION.SDK_INT >= 30) {
                try {
                    pm.getInstallSourceInfo(pkg).installingPackageName
                } catch (_: Throwable) {
                    pm.getInstallerPackageName(pkg)
                }
            } else {
                @Suppress("DEPRECATION")
                pm.getInstallerPackageName(pkg)
            }
            matchesZhuoyitongInstaller(installer)
        } catch (_: Throwable) {
            false
        }
    }

    private fun zhuoyitongSystemProps(): Boolean {
        val zytFlag = sysProp("persist.sys.zyt_flag")
        if (zytFlag.isNotEmpty() && zytFlag != "0" && !zytFlag.equals("false", true)) {
            return true
        }
        val family = sysProp("ro.vendor.build.ohos.family")
        if (family.equals("zyt", ignoreCase = true) ||
            family.contains("zhuoyi", ignoreCase = true)
        ) {
            return true
        }
        return false
    }

    // --- Pure helpers (unit-testable) --------------------------------------

    fun matchesHarmonyOsBrand(brand: String?): Boolean =
        brand.equals("harmony", ignoreCase = true)

    fun matchesOhosDistName(value: String): Boolean {
        if (value.isEmpty()) return false
        return value.contains("harmony", ignoreCase = true) ||
            value.contains("ohos", ignoreCase = true)
    }

    fun matchesOhosReleaseType(value: String): Boolean {
        if (value.isEmpty()) return false
        // ColorOS/MIUI/stock leave this empty; Harmony fills with release channel tags.
        // Require an ohos/harmony cue so unknown OEM strings do not trip us.
        return value.contains("harmony", ignoreCase = true) ||
            value.contains("ohos", ignoreCase = true) ||
            value.contains("hos", ignoreCase = true)
    }

    fun matchesZhuoyitongCgroup(cgroup: String): Boolean {
        if (cgroup.isEmpty()) return false
        val lower = cgroup.lowercase()
        val markers = arrayOf(
            "isulad",
            "zhuoyi",
            "zhuoyitong",
            "com.huawei.zhuoyitong",
            "/anco/",
            "anco-",
        )
        return markers.any { lower.contains(it) }
    }

    fun matchesZhuoyitongBuildField(value: String?): Boolean {
        if (value.isNullOrEmpty()) return false
        val lower = value.lowercase()
        val markers = arrayOf(
            "zyt",
            "zhuoyi",
            "zhuoyitong",
            "easyabroad",
            "exyroid",
        )
        return markers.any { lower.contains(it) }
    }

    fun matchesZhuoyitongInstaller(installer: String?): Boolean {
        if (installer.isNullOrEmpty()) return false
        return installer.equals("com.zhuoyi.appstore.lite", ignoreCase = true) ||
            installer.equals("com.huawei.zhuoyitong", ignoreCase = true) ||
            installer.contains("zhuoyi", ignoreCase = true)
    }

    // --- Internals ---------------------------------------------------------

    private fun sysProp(key: String): String {
        return try {
            val clz = Class.forName("android.os.SystemProperties")
            (clz.getMethod("get", String::class.java).invoke(null, key) as? String)
                .orEmpty()
                .trim()
        } catch (_: Throwable) {
            ""
        }
    }
}
