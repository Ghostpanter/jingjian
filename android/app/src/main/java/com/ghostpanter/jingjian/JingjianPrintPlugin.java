package com.ghostpanter.jingjian;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
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
        WebView webView = null;
        try {
            webView = new WebView(activity);
            webView.getSettings().setJavaScriptEnabled(false);
            webView.setBackgroundColor(0xFFFFFFFF);
            webView.setAlpha(0f);
            webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            int width = Math.max(activity.getResources().getDisplayMetrics().widthPixels, 794);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, 1600);
            params.leftMargin = -(width + 240);
            ViewGroup content = activity.findViewById(android.R.id.content);
            content.addView(webView, params);
            kept.add(webView);
            final WebView page = webView;
            main.postDelayed(() -> release(page), 120_000);
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
                            release(view);
                            return;
                        }
                        PrintAttributes attributes = new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        PrintDocumentAdapter adapter = new FinishingAdapter(
                            view.createPrintDocumentAdapter(name),
                            () -> release(view)
                        );
                        printManager.print(name, adapter, attributes);
                        call.resolve();
                    } catch (Exception error) {
                        call.reject("无法打开系统打印");
                        release(view);
                    }
                }
            });
            // Do not use the app origin. A second WebView on https://localhost can replace the page.
            webView.loadDataWithBaseURL("https://print.invalid/", html, "text/html", "UTF-8", null);
        } catch (Exception error) {
            if (webView != null) release(webView);
            call.reject("无法打开系统打印");
        }
    }

    private void release(WebView webView) {
        main.post(() -> {
            if (!kept.remove(webView)) return;
            try {
                ViewGroup parent = (ViewGroup) webView.getParent();
                if (parent != null) parent.removeView(webView);
                webView.destroy();
            } catch (Exception ignored) {
            }
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().requestFocus();
                }
            } catch (Exception ignored) {
            }
        });
    }

    private static final class FinishingAdapter extends PrintDocumentAdapter {
        private final PrintDocumentAdapter delegate;
        private final Runnable onFinish;
        private boolean finished;

        FinishingAdapter(PrintDocumentAdapter delegate, Runnable onFinish) {
            this.delegate = delegate;
            this.onFinish = onFinish;
        }

        @Override
        public void onStart() {
            delegate.onStart();
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            delegate.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            if (finished) return;
            finished = true;
            try {
                delegate.onFinish();
            } catch (Exception ignored) {
            }
            onFinish.run();
        }
    }
}