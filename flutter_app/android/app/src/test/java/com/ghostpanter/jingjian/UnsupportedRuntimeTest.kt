package com.ghostpanter.jingjian

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for pure detection helpers (no device / no Context). */
class UnsupportedRuntimeTest {

    @Test
    fun harmonyOsBrand_onlyHarmony() {
        assertTrue(UnsupportedRuntime.matchesHarmonyOsBrand("harmony"))
        assertTrue(UnsupportedRuntime.matchesHarmonyOsBrand("Harmony"))
        assertFalse(UnsupportedRuntime.matchesHarmonyOsBrand("android"))
        assertFalse(UnsupportedRuntime.matchesHarmonyOsBrand(""))
        assertFalse(UnsupportedRuntime.matchesHarmonyOsBrand(null))
        assertFalse(UnsupportedRuntime.matchesHarmonyOsBrand("coloros"))
    }

    @Test
    fun ohosDistName() {
        assertTrue(UnsupportedRuntime.matchesOhosDistName("HarmonyOS"))
        assertTrue(UnsupportedRuntime.matchesOhosDistName("OpenHarmony"))
        assertTrue(UnsupportedRuntime.matchesOhosDistName("ohos"))
        assertFalse(UnsupportedRuntime.matchesOhosDistName(""))
        assertFalse(UnsupportedRuntime.matchesOhosDistName("ColorOS"))
        assertFalse(UnsupportedRuntime.matchesOhosDistName("MIUI"))
    }

    @Test
    fun ohosReleaseType_requiresCue() {
        assertTrue(UnsupportedRuntime.matchesOhosReleaseType("HarmonyOS"))
        assertTrue(UnsupportedRuntime.matchesOhosReleaseType("hos"))
        assertFalse(UnsupportedRuntime.matchesOhosReleaseType(""))
        assertFalse(UnsupportedRuntime.matchesOhosReleaseType("release"))
    }

    @Test
    fun zhuoyitongCgroup_markers() {
        assertTrue(UnsupportedRuntime.matchesZhuoyitongCgroup("12:freezer:/isulad/abc123"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongCgroup("/lxc/zhuoyi/container"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongCgroup("devices:/anco/session"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongCgroup("name=com.huawei.zhuoyitong"))
        // bare lxc alone must NOT trip (other containers / ColorOS-safe)
        assertFalse(UnsupportedRuntime.matchesZhuoyitongCgroup("12:freezer:/lxc/other"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongCgroup(""))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongCgroup("0::/"))
    }

    @Test
    fun zhuoyitongBuildField() {
        assertTrue(UnsupportedRuntime.matchesZhuoyitongBuildField("HUAWEI_ZYT_1.0"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongBuildField("EasyAbroad-build"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongBuildField("exyroid-user"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongBuildField("zhuoyitong_preview"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongBuildField("CPH2607_14_A.12"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongBuildField("PKQ1.180729.001"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongBuildField(null))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongBuildField(""))
    }

    @Test
    fun zhuoyitongInstaller() {
        assertTrue(UnsupportedRuntime.matchesZhuoyitongInstaller("com.zhuoyi.appstore.lite"))
        assertTrue(UnsupportedRuntime.matchesZhuoyitongInstaller("com.huawei.zhuoyitong"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongInstaller("com.android.vending"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongInstaller("com.oppo.market"))
        assertFalse(UnsupportedRuntime.matchesZhuoyitongInstaller(null))
    }
}
