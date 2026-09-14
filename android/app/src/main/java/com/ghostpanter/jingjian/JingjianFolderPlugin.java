package com.ghostpanter.jingjian;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

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
import java.io.ByteArrayOutputStream;
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
    public void pickSaveFile(PluginCall call) {
        String name = call.getString("name", "export.bin");
        String mime = call.getString("mime", "application/octet-stream");
        if (mime.contains(";")) {
            mime = mime.split(";")[0].trim();
        }
        if (mime.isEmpty()) {
            mime = "application/octet-stream";
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "onSaveLocationPicked");
    }

    @ActivityCallback
    private void onSaveLocationPicked(PluginCall call, ActivityResult result) {
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
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // CREATE_DOCUMENT grants are often not persistable; same-session write still works.
        }
        JSObject payload = new JSObject();
        payload.put("uri", uri.toString());
        payload.put("name", call.getString("name", ""));
        call.resolve(payload);
    }

    @PluginMethod
    public void writeSaveFile(PluginCall call) {
        String rawUri = call.getString("uri", "");
        if (rawUri == null || rawUri.isEmpty()) {
            call.reject("缺少保存位置");
            return;
        }
        Uri uri;
        try {
            uri = Uri.parse(rawUri);
        } catch (Exception error) {
            call.reject("保存位置无效");
            return;
        }
        String raw = call.getString("data", "");
        byte[] bytes;
        try {
            bytes = android.util.Base64.decode(raw != null ? raw : "", android.util.Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("文件内容损坏");
            return;
        }
        try {
            OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w");
            if (out == null) {
                out = getContext().getContentResolver().openOutputStream(uri);
            }
            if (out == null) {
                call.reject("无法写入所选位置");
                return;
            }
            try {
                out.write(bytes);
                out.flush();
            } finally {
                out.close();
            }
            JSObject payload = new JSObject();
            payload.put("uri", uri.toString());
            payload.put("name", call.getString("name", ""));
            call.resolve(payload);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "写入失败");
        }
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "export.bin");
        String mime = call.getString("mime", "application/octet-stream");
        if (mime.contains(";")) {
            mime = mime.split(";")[0].trim();
        }
        if (mime.isEmpty()) {
            mime = "application/octet-stream";
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "onExportPicked");
    }

    @ActivityCallback
    private void onExportPicked(PluginCall call, ActivityResult result) {
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
        String raw = call.getString("data", "");
        byte[] bytes;
        try {
            bytes = android.util.Base64.decode(raw != null ? raw : "", android.util.Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("文件内容损坏");
            return;
        }
        try {
            OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w");
            if (out == null) {
                out = getContext().getContentResolver().openOutputStream(uri);
            }
            if (out == null) {
                call.reject("无法写入所选位置");
                return;
            }
            try {
                out.write(bytes);
                out.flush();
            } finally {
                out.close();
            }
            JSObject payload = new JSObject();
            payload.put("uri", uri.toString());
            payload.put("name", call.getString("name", ""));
            call.resolve(payload);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "写入失败");
        }
    }

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

    @PluginMethod
    public void pickImportFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "onImportPicked");
    }

    @ActivityCallback
    private void onImportPicked(PluginCall call, ActivityResult result) {
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
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // One-shot read is enough for import.
        }
        DocumentFile dir = DocumentFile.fromTreeUri(getContext(), uri);
        String name = dir != null && dir.getName() != null ? dir.getName() : "导入";
        JSArray files = new JSArray();
        if (dir != null) {
            collectImportFiles(dir, name, files, 0);
        }
        JSObject out = new JSObject();
        out.put("name", name);
        out.put("files", files);
        call.resolve(out);
    }

    private void collectImportFiles(DocumentFile dir, String relative, JSArray files, int depth) {
        if (dir == null || depth > 12 || files.length() >= 400) {
            return;
        }
        DocumentFile[] children = dir.listFiles();
        if (children == null) {
            return;
        }
        for (DocumentFile child : children) {
            if (child == null || files.length() >= 400) continue;
            String name = child.getName();
            if (name == null || name.startsWith(".")) continue;
            String next = relative + "/" + name;
            if (child.isDirectory()) {
                collectImportFiles(child, next, files, depth + 1);
                continue;
            }
            if (!isImportableName(name)) continue;
            try {
                String content = readText(child.getUri());
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("relativePath", next);
                item.put("content", content);
                files.put(item);
            } catch (Exception ignored) {
                // Skip unreadable files and keep collecting.
            }
        }
    }

    private boolean isImportableName(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt");
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
                    if (name == null || !(name.toLowerCase(Locale.ROOT).endsWith(".md")
                        || name.toLowerCase(Locale.ROOT).endsWith(".markdown")
                        || name.toLowerCase(Locale.ROOT).endsWith(".txt"))) continue;
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
                String mime = name.toLowerCase(Locale.ROOT).endsWith(".txt")
                    ? "text/plain"
                    : "text/markdown";
                target = dir.createFile(mime, name);
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

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        Activity activity = getActivity();
        if (activity != null && intent != null) {
            activity.setIntent(intent);
        }
        JSObject data = describeLaunch(intent);
        if (data != null) {
            notifyListeners("openFile", data, true);
        }
    }

    @PluginMethod
    public void consumeLaunchFile(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        Intent intent = activity.getIntent();
        JSObject data = describeLaunch(intent);
        if (data != null) {
            consumeIntent(intent);
            call.resolve(data);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void readOpenUri(PluginCall call) {
        String raw = call.getString("uri", "");
        if (raw == null || raw.isEmpty()) {
            call.reject("缺少文件");
            return;
        }
        Uri uri;
        try {
            uri = Uri.parse(raw);
        } catch (Exception error) {
            call.reject("文件位置无效");
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // One-shot grants from VIEW/SEND are enough for this read.
        }
        try {
            byte[] bytes = readAll(uri);
            String name = queryDisplayName(uri, call.getString("name", ""));
            String mime = queryMime(uri, name);
            JSObject payload = new JSObject();
            payload.put("uri", uri.toString());
            payload.put("name", name);
            payload.put("mime", mime);
            payload.put("data", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
            if (isTextName(name, mime)) {
                payload.put("text", new String(bytes, StandardCharsets.UTF_8));
            }
            call.resolve(payload);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "无法读取文件");
        }
    }

    private JSObject describeLaunch(Intent intent) {
        if (intent == null) {
            return null;
        }
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) {
            Uri uri = intent.getData();
            if (uri == null) {
                return null;
            }
            return describeUri(uri, intent.getType());
        }
        if (Intent.ACTION_SEND.equals(action)) {
            Uri stream = extraStream(intent);
            if (stream != null) {
                return describeUri(stream, intent.getType());
            }
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                JSObject payload = new JSObject();
                payload.put("kind", "text");
                payload.put("text", text);
                payload.put("name", "分享.txt");
                payload.put("mime", "text/plain");
                return payload;
            }
        }
        return null;
    }

    private JSObject describeUri(Uri uri, String mime) {
        JSObject payload = new JSObject();
        String name = queryDisplayName(uri, uri.getLastPathSegment());
        payload.put("kind", "uri");
        payload.put("uri", uri.toString());
        payload.put("name", name);
        payload.put("mime", mime != null ? mime : queryMime(uri, name));
        return payload;
    }

    private void consumeIntent(Intent intent) {
        intent.setData(null);
        intent.setAction(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
    }

    private Uri extraStream(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    private String queryDisplayName(Uri uri, String fallback) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.isEmpty()) {
                        return name;
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall through to URI last segment.
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        if (fallback != null && !fallback.isEmpty()) {
            return fallback;
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "未命名.md";
    }

    private String queryMime(Uri uri, String name) {
        String mime = getContext().getContentResolver().getType(uri);
        if (mime != null && !mime.isEmpty() && !"application/octet-stream".equals(mime)) {
            return mime;
        }
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot >= 0 && dot < name.length() - 1) {
            ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        if (ext.isEmpty()) {
            return mime != null ? mime : "";
        }
        String mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if (mapped != null) {
            return mapped;
        }
        if ("md".equals(ext) || "markdown".equals(ext)) {
            return "text/markdown";
        }
        if ("epub".equals(ext)) {
            return "application/epub+zip";
        }
        return mime != null ? mime : "";
    }

    private boolean isTextName(String name, String mime) {
        String lower = name.toLowerCase(Locale.ROOT);
        String type = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        return lower.endsWith(".md")
            || lower.endsWith(".markdown")
            || lower.endsWith(".txt")
            || type.startsWith("text/")
            || type.contains("markdown");
    }

    private byte[] readAll(Uri uri) throws IOException {
        InputStream in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) {
            throw new IOException("无法读取文件");
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        try {
            while ((count = in.read(buffer)) != -1) {
                out.write(buffer, 0, count);
            }
        } finally {
            in.close();
        }
        return out.toByteArray();
    }
}
