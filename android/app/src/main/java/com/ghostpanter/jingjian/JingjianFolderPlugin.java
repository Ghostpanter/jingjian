package com.ghostpanter.jingjian;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@CapacitorPlugin(name = "JingjianFolder")
public class JingjianFolderPlugin extends Plugin {
    private static final String PREFS = "jingjian_folder";
    private static final String KEY_URI = "tree_uri";
    private static final String KEY_NAME = "tree_name";

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK
            || result.getData() == null
            || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException ignored) {
            // Some providers grant access without persistable flags.
        }
        DocumentFile dir = DocumentFile.fromTreeUri(getContext(), uri);
        String name = dir != null && dir.getName() != null ? dir.getName() : "已选择的文件夹";
        prefs().edit().putString(KEY_URI, uri.toString()).putString(KEY_NAME, name).apply();
        JSObject out = new JSObject();
        out.put("name", name);
        out.put("uri", uri.toString());
        call.resolve(out);
    }

    @PluginMethod
    public void status(PluginCall call) {
        DocumentFile dir = tree();
        JSObject out = new JSObject();
        if (dir == null || !dir.exists() || !dir.canRead()) {
            out.put("ok", false);
            out.put("name", "");
            call.resolve(out);
            return;
        }
        out.put("ok", true);
        String stored = prefs().getString(KEY_NAME, "");
        String name = dir.getName() != null ? dir.getName() : stored;
        out.put("name", name != null ? name : "");
        call.resolve(out);
    }

    @PluginMethod
    public void list(PluginCall call) {
        DocumentFile dir = tree();
        if (dir == null) {
            call.reject("请先选择保存文件夹");
            return;
        }
        try {
            JSArray files = new JSArray();
            DocumentFile[] children = dir.listFiles();
            if (children != null) {
                for (DocumentFile file : children) {
                    if (file == null || !file.isFile()) continue;
                    String name = file.getName();
                    if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".md")) continue;
                    JSObject item = new JSObject();
                    item.put("name", name);
                    item.put("content", readText(file.getUri()));
                    files.put(item);
                }
            }
            JSObject out = new JSObject();
            out.put("files", files);
            call.resolve(out);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "读取文件夹失败");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String name = call.getString("name");
        String content = call.getString("content", "");
        String shortId = call.getString("shortId", "");
        if (name == null || name.isEmpty()) {
            call.reject("缺少文件名");
            return;
        }
        DocumentFile dir = tree();
        if (dir == null) {
            call.reject("请先选择保存文件夹");
            return;
        }
        try {
            DocumentFile target = findByShortId(dir, shortId);
            if (target == null) {
                target = findByName(dir, name);
            }
            if (target == null) {
                target = dir.createFile("text/markdown", name);
                if (target == null) {
                    target = dir.createFile("text/plain", name);
                }
            } else if (!name.equals(target.getName())) {
                target.renameTo(name);
            }
            if (target == null) {
                call.reject("无法在该目录创建文件");
                return;
            }
            writeText(target.getUri(), content != null ? content : "");
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "写入失败");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String shortId = call.getString("shortId", "");
        DocumentFile dir = tree();
        if (dir == null) {
            call.resolve();
            return;
        }
        try {
            DocumentFile[] children = dir.listFiles();
            if (children != null) {
                for (DocumentFile file : children) {
                    if (file == null) continue;
                    String name = file.getName();
                    if (name == null) continue;
                    if (!name.replace("-", "").contains(shortId)) continue;
                    file.delete();
                }
            }
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "删除失败");
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private DocumentFile tree() {
        String raw = prefs().getString(KEY_URI, "");
        if (raw == null || raw.isEmpty()) return null;
        try {
            Uri uri = Uri.parse(raw);
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), uri);
            if (dir == null || !dir.exists()) return null;
            return dir;
        } catch (Exception error) {
            return null;
        }
    }

    private DocumentFile findByName(DocumentFile dir, String name) {
        DocumentFile[] children = dir.listFiles();
        if (children == null) return null;
        for (DocumentFile file : children) {
            if (file != null && name.equals(file.getName())) return file;
        }
        return null;
    }

    private DocumentFile findByShortId(DocumentFile dir, String shortId) {
        if (shortId == null || shortId.isEmpty()) return null;
        DocumentFile[] children = dir.listFiles();
        if (children == null) return null;
        for (DocumentFile file : children) {
            if (file == null) continue;
            String name = file.getName();
            if (name != null && name.replace("-", "").contains(shortId)) return file;
        }
        return null;
    }

    private String readText(Uri uri) throws IOException {
        InputStream in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            char[] buffer = new char[8192];
            int read;
            while ((read = reader.read(buffer)) >= 0) {
                builder.append(buffer, 0, read);
            }
            return builder.toString();
        }
    }

    private void writeText(Uri uri, String content) throws IOException {
        OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt");
        if (out == null) {
            out = getContext().getContentResolver().openOutputStream(uri);
        }
        if (out == null) {
            throw new IOException("无法写入该文件");
        }
        try {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
        } finally {
            out.close();
        }
    }
}
