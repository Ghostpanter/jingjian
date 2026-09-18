package com.ghostpanter.jingjian;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
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
                ready = true;
                applyDefaultLanguage();
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
        boolean ok = waitUntilReady();
        ret.put("ok", ok);
        ret.put("hasZh", languageInstalled("zh"));
        ret.put("hasEn", languageInstalled("en"));
        call.resolve(ret);
    }

    @PluginMethod
    public void listVoices(PluginCall call) {
        if (!waitUntilReady() || tts == null) {
            call.reject("unavailable");
            return;
        }
        JSArray voices = new JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Set<Voice> installed = tts.getVoices();
            if (installed != null) {
                for (Voice voice : installed) {
                    Locale locale = voice.getLocale();
                    JSObject item = new JSObject();
                    item.put("name", voice.getName());
                    item.put("lang", locale == null ? "" : locale.toLanguageTag());
                    item.put("local", !voice.isNetworkConnectionRequired());
                    item.put("quality", voice.getQuality());
                    voices.put(item);
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("voices", voices);
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
        String lang = call.getString("lang", "");
        String voiceName = call.getString("voiceName", "");
        call.setKeepAlive(true);
        main.post(() -> {
            finishSpeak(true, null);
            pendingSpeak = call;
            tts.setSpeechRate(Math.max(0.5f, Math.min(1.4f, rate)));
            applyVoice(lang, voiceName);
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

    private void applyDefaultLanguage() {
        Locale[] locales = {
            Locale.SIMPLIFIED_CHINESE,
            Locale.US,
            Locale.CHINESE,
            Locale.ENGLISH,
            Locale.TRADITIONAL_CHINESE,
            Locale.UK,
        };
        for (Locale locale : locales) {
            if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
                return;
            }
        }
    }

    private void applyVoice(String lang, String voiceName) {
        Locale locale = localeFor(lang);
        if (locale != null && tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
            tts.setLanguage(locale);
        }
        if (voiceName == null || voiceName.isEmpty()) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        Set<Voice> voices = tts.getVoices();
        if (voices == null) return;
        for (Voice voice : voices) {
            if (voiceName.equals(voice.getName())) {
                tts.setVoice(voice);
                return;
            }
        }
    }

    private boolean languageInstalled(String prefix) {
        if (!Boolean.TRUE.equals(ready) || tts == null || prefix == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice voice : voices) {
                    Locale locale = voice.getLocale();
                    if (locale == null) continue;
                    String language = locale.getLanguage();
                    if (language != null && language.toLowerCase(Locale.ROOT).startsWith(prefix)) {
                        return true;
                    }
                }
            }
        }
        Locale probe = prefix.equals("en") ? Locale.US : Locale.SIMPLIFIED_CHINESE;
        return tts.isLanguageAvailable(probe) >= TextToSpeech.LANG_AVAILABLE;
    }

    private static Locale localeFor(String lang) {
        if (lang == null || lang.trim().isEmpty()) return null;
        String normalized = lang.trim().replace('_', '-');
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            return Locale.forLanguageTag(normalized);
        }
        String[] parts = normalized.split("-");
        if (parts.length >= 2) return new Locale(parts[0], parts[1]);
        return new Locale(parts[0]);
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
