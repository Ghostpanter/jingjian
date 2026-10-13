/// Key → bytes storage: files on Android/desktop, IndexedDB on the web.
library;

export 'blob_store_io.dart' if (dart.library.js_interop) 'blob_store_web.dart';
