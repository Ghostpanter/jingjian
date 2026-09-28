package com.ghostpanter.jingjian;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "JingjianPrint")
public class JingjianPrintPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<WebView> kept = new ArrayList<>();

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html", "");
        String jobName = call.getString("jobName", "静笺");
        if (html == null || html.isEmpty()) {
            call.reject("没有可打印的内容");
            return;
        }
        if (jobName == null || jobName.trim().isEmpty()) jobName = "静笺";
        if (jobName.length() > 80) jobName = jobName.substring(0, 80);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("无法打开系统打印");
            return;
        }
        final String name = jobName;
        activity.runOnUiThread(() -> startPrint(activity, call, html, name));
    }

    private void startPrint(Activity activity, PluginCall call, String html, String name) {
        try {
            WebView webView = new WebView(activity);
            webView.getSettings().setJavaScriptEnabled(false);
            webView.setBackgroundColor(0xFFFFFFFF);
            int width = Math.max(activity.getResources().getDisplayMetrics().widthPixels, 794);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT);
            ViewGroup content = activity.findViewById(android.R.id.content);
            content.addView(webView, params);
            retain(webView);
            AtomicBoolean started = new AtomicBoolean(false);
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (!started.compareAndSet(false, true)) return;
                    try {
                        PrintManager printManager =
                            (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            call.reject("系统没有打印服务");
                            return;
                        }
                        PrintAttributes attributes = new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        printManager.print(name, view.createPrintDocumentAdapter(name), attributes);
                        call.resolve();
                    } catch (Exception error) {
                        call.reject("无法打开系统打印");
                    }
                }
            });
            webView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        } catch (Exception error) {
            call.reject("无法打开系统打印");
        }
    }

    private void retain(WebView webView) {
        kept.add(webView);
        while (kept.size() > 2) {
            WebView old = kept.remove(0);
            main.postDelayed(() -> {
                try {
                    ViewGroup parent = (ViewGroup) old.getParent();
                    if (parent != null) parent.removeView(old);
                    old.destroy();
                } catch (Exception ignored) {
                }
            }, 120_000);
        }
    }
}
