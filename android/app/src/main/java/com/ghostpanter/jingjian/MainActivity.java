package com.ghostpanter.jingjian;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String CHROME_PREFS = "jingjian_chrome";
    private static final String DEFAULT_BG = "#F2EDE4";
    private volatile boolean keepSplash = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> keepSplash);
        splash.setOnExitAnimationListener(splashView -> {
            splashView.getView()
                .animate()
                .alpha(0f)
                .setDuration(180)
                .withEndAction(splashView::remove)
                .start();
        });
        registerPlugin(JingjianFolderPlugin.class);
        registerPlugin(JingjianTtsPlugin.class);
        super.onCreate(savedInstanceState);
        setTheme(R.style.AppTheme_NoActionBar);
        applySavedChrome();
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        new Handler(Looper.getMainLooper()).postDelayed(this::releaseSplash, 2500);
    }

    void releaseSplash() {
        keepSplash = false;
    }

    static void applyChrome(android.app.Activity activity, String bg, boolean dark) {
        applyChrome(activity, bg, dark, false);
    }

    static void applyChrome(
        android.app.Activity activity,
        String bg,
        boolean dark,
        boolean dismissSplash
    ) {
        if (activity == null) return;
        Window window = activity.getWindow();
        if (window == null) return;
        int color = parseColor(bg);
        window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(color));
        window.getDecorView().setBackgroundColor(color);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        }
        if (activity instanceof MainActivity) {
            MainActivity main = (MainActivity) activity;
            try {
                if (main.bridge != null && main.bridge.getWebView() != null) {
                    main.bridge.getWebView().setBackgroundColor(color);
                }
            } catch (Exception ignored) {
            }
            if (dismissSplash) {
                main.releaseSplash();
            }
        }
    }

    private void applySavedChrome() {
        SharedPreferences prefs = getSharedPreferences(CHROME_PREFS, MODE_PRIVATE);
        applyChrome(
            this,
            prefs.getString("bg", DEFAULT_BG),
            prefs.getBoolean("dark", false),
            false
        );
    }

    static int parseColor(String bg) {
        try {
            if (bg != null && bg.matches("#[0-9a-fA-F]{6}")) {
                return Color.parseColor(bg);
            }
        } catch (Exception ignored) {
        }
        return Color.parseColor(DEFAULT_BG);
    }
}
