import '../../models/note.dart';
import '../../models/sync_config.dart';
import 'sync_folder.dart';
import 'sync_oss.dart';
import 'sync_server.dart';
import 'sync_webdav.dart';

abstract class SyncAdapter {
  Future<List<Note>> list();
  Future<void> upsert(Note note);
  Future<void> remove(String id);
  Future<String> test();
}

SyncAdapter createAdapter(SyncConfig config) {
  switch (config.provider) {
    case SyncProvider.webdav:
      return createWebdavAdapter(config);
    case SyncProvider.folder:
      return createFolderAdapter(config);
    case SyncProvider.oss:
      return createOssAdapter(config);
    case SyncProvider.server:
    case SyncProvider.off:
      return createServerAdapter(config);
  }
}
