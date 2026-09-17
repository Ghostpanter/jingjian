package com.ghostpanter.jingjian;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "JingjianTts")
public class JingjianTtsPlugin extends Plugin {
    private static final String UTTERANCE_ID = "jingjian-tts";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();
    private TextToSpeech tts;
    private Boolean ready;
    private PluginCall pendingSpeak;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            synchronized (lock) {
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    ready = false;
                    lock.notifyAll();
                    return;
                }
                ready = pickChineseVoice();
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {}

                    @Override
                    public void onDone(String utteranceId) {
                        finishSpeak(false, null);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        finishSpeak(false, "error");
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        finishSpeak(true, null);
                    }
                });
                lock.notifyAll();
            }
        });
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", waitUntilReady());
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!waitUntilReady() || tts == null) {
            call.reject("unavailable");
            return;
        }
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.resolve(stopped(false));
            return;
        }
        float rate = call.getFloat("rate", 0.92f);
        call.setKeepAlive(true);
        main.post(() -> {
            finishSpeak(true, null);
            pendingSpeak = call;
            tts.setSpeechRate(Math.max(0.5f, Math.min(1.4f, rate)));
            Bundle params = new Bundle();
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, UTTERANCE_ID);
            if (result == TextToSpeech.ERROR) {
                finishSpeak(false, "error");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            if (tts != null) tts.stop();
            finishSpeak(true, null);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> {
            finishSpeak(true, null);
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
            synchronized (lock) {
                ready = false;
            }
        });
    }

    private boolean waitUntilReady() {
        synchronized (lock) {
            long deadline = System.currentTimeMillis() + 2500;
            while (ready == null && System.currentTimeMillis() < deadline) {
                try {
                    lock.wait(Math.max(1, deadline - System.currentTimeMillis()));
                } catch (InterruptedException ignored) {
                    break;
                }
            }
            return Boolean.TRUE.equals(ready);
        }
    }

    private boolean pickChineseVoice() {
        Locale[] locales = {
            Locale.SIMPLIFIED_CHINESE,
            Locale.CHINESE,
            new Locale("zh", "CN"),
            new Locale("zh"),
            Locale.TRADITIONAL_CHINESE,
        };
        boolean languageOk = false;
        for (Locale locale : locales) {
            int result = tts.isLanguageAvailable(locale);
            if (result >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
                languageOk = true;
                break;
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Voice best = null;
            int bestScore = -1;
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice voice : voices) {
                    Locale locale = voice.getLocale();
                    if (locale == null) continue;
                    String lang = locale.getLanguage();
                    if (lang == null || !lang.toLowerCase(Locale.ROOT).startsWith("zh")) continue;
                    int score = voice.getQuality();
                    if (!voice.isNetworkConnectionRequired()) score += 200;
                    if (score > bestScore) {
                        bestScore = score;
                        best = voice;
                    }
                }
            }
            if (best != null) {
                tts.setVoice(best);
                return true;
            }
        }
        return languageOk;
    }

    private void finishSpeak(boolean stopped, String error) {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        if (call == null) return;
        if (error != null) {
            call.reject(error);
            return;
        }
        call.resolve(stopped(stopped));
    }

    private static JSObject stopped(boolean value) {
        JSObject ret = new JSObject();
        ret.put("stopped", value);
        return ret;
    }
}
