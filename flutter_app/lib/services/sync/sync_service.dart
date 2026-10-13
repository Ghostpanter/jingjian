import '../../models/note.dart';
import '../../models/sync_config.dart';
import '../app_prefs.dart';
import '../note_store.dart';
import 'sync_adapter.dart';
import 'sync_merge.dart';

class SyncService {
  SyncService._();
  static final SyncService instance = SyncService._();

  SyncStatus status = SyncStatus(message: '仅本机');

  Future<String> test(SyncConfig config) async {
    if (config.provider == SyncProvider.off) return '当前仅保存在本机';
    return createAdapter(config).test();
  }

  Future<({List<Note> notes, SyncStatus status, List<({Note local, Note remote})> conflicts})>
      runSync({
    required SyncConfig config,
    required List<Note> local,
    String? activeId,
    bool protectActive = false,
  }) async {
    if (config.provider == SyncProvider.off) {
      status = SyncStatus(state: 'idle', message: '仅本机');
      return (notes: local, status: status, conflicts: <({Note local, Note remote})>[]);
    }
    status = SyncStatus(state: 'syncing', message: '同步中…');
    try {
      final adapter = createAdapter(config);
      final remote = await adapter.list();
      final prefs = AppPrefs.instance;
      final merged = mergeNotes(MergeInput(
        local: local,
        remote: remote,
        tombstones: prefs.readTombstones(),
        activeId: activeId,
        protectActive: protectActive,
      ));
      for (final note in merged.toUpload) {
        await adapter.upsert(note);
      }
      for (final id in merged.toDeleteRemote) {
        await adapter.remove(id);
      }
      await prefs.writeTombstones(merged.tombstones);
      final unchanged = notesFingerprint(local) == notesFingerprint(merged.notes);
      final conflicted = merged.conflicts.length;
      status = SyncStatus(
        state: 'ok',
        message: conflicted > 0
            ? '$conflicted 篇有冲突，请选择'
            : unchanged
                ? '已是最新'
                : '同步完成',
        at: DateTime.now().millisecondsSinceEpoch,
      );
      return (notes: merged.notes, status: status, conflicts: merged.conflicts);
    } catch (e) {
      status = SyncStatus(
        state: 'error',
        message: e.toString().replaceFirst('Exception: ', ''),
        at: DateTime.now().millisecondsSinceEpoch,
      );
      rethrow;
    }
  }

  /// Returns unresolved conflicts (local kept for now) so UI can ask the user.
  Future<List<({Note local, Note remote})>> syncAndApply({String? activeId}) async {
    final config = AppPrefs.instance.readSyncConfig();
    if (config.provider == SyncProvider.off) return const [];
    final store = NoteStore.instance;
    final snapshot = List<Note>.from(store.allNotes);
    final result = await runSync(
      config: config,
      local: snapshot,
      activeId: activeId,
    );
    await store.replaceAll(reconcileAfterSync(snapshot: snapshot, current: store.allNotes, merged: result.notes));
    return result.conflicts;
  }
}
