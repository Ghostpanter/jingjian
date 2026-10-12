import '../models/note.dart';

abstract class TreeNode {}

class FolderNode extends TreeNode {
  FolderNode({required this.path, required this.name, List<TreeNode>? children})
      : children = children ?? [];
  final String path;
  final String name;
  final List<TreeNode> children;
}

class NoteNode extends TreeNode {
  NoteNode(this.note);
  final Note note;
}

String normalizeFolder(String path) {
  final parts = <String>[];
  for (final raw in path.replaceAll(r'\', '/').split('/')) {
    final part = raw.trim();
    if (part.isEmpty || part == '.') continue;
    if (part == '..') {
      if (parts.isNotEmpty) parts.removeLast();
      continue;
    }
    parts.add(part);
  }
  return parts.join('/');
}

String folderName(String path) {
  final n = normalizeFolder(path);
  if (n.isEmpty) return '';
  return n.split('/').last;
}

String parentFolder(String path) {
  final parts = normalizeFolder(path).split('/').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '';
  parts.removeLast();
  return parts.join('/');
}

List<String> ancestorFolders(String path) {
  final n = normalizeFolder(path);
  if (n.isEmpty) return [];
  final parts = n.split('/');
  final out = <String>[];
  for (var i = 1; i <= parts.length; i++) {
    out.add(parts.sublist(0, i).join('/'));
  }
  return out;
}

List<String> collectFolders(List<Note> notes, {List<String> extra = const []}) {
  final set = <String>{};
  for (final path in extra) {
    set.addAll(ancestorFolders(path));
  }
  for (final note in notes) {
    if (note.isTrashed || note.folder == null || note.folder!.isEmpty) continue;
    set.addAll(ancestorFolders(note.folder!));
  }
  final list = set.toList()..sort((a, b) => a.compareTo(b));
  return list;
}

List<TreeNode> buildFolderTree(List<Note> notes, {List<String> extraFolders = const []}) {
  final active = notes.where((n) => !n.isTrashed).toList();
  final folders = collectFolders(active, extra: extraFolders);
  final folderMap = <String, FolderNode>{};
  for (final path in folders) {
    folderMap[path] = FolderNode(path: path, name: folderName(path));
  }
  for (final path in folders) {
    final parent = parentFolder(path);
    if (parent.isNotEmpty && folderMap.containsKey(parent)) {
      folderMap[parent]!.children.add(folderMap[path]!);
    }
  }
  final roots = <TreeNode>[];
  for (final path in folders) {
    if (parentFolder(path).isEmpty) roots.add(folderMap[path]!);
  }
  for (final note in active) {
    final folder = normalizeFolder(note.folder ?? '');
    if (folder.isEmpty) {
      roots.add(NoteNode(note));
    } else if (folderMap.containsKey(folder)) {
      folderMap[folder]!.children.add(NoteNode(note));
    } else {
      roots.add(NoteNode(note));
    }
  }
  void sortNodes(List<TreeNode> nodes) {
    nodes.sort((a, b) {
      if (a is FolderNode && b is! FolderNode) return -1;
      if (a is! FolderNode && b is FolderNode) return 1;
      if (a is FolderNode && b is FolderNode) return a.name.compareTo(b.name);
      if (a is NoteNode && b is NoteNode) {
        return b.note.updatedAt.compareTo(a.note.updatedAt);
      }
      return 0;
    });
    for (final n in nodes) {
      if (n is FolderNode) sortNodes(n.children);
    }
  }
  sortNodes(roots);
  return roots;
}

List<Note> notesInFolder(List<Note> notes, String? folder, {bool includeNested = true}) {
  final root = normalizeFolder(folder ?? '');
  return notes.where((n) {
    if (n.isTrashed) return false;
    final f = normalizeFolder(n.folder ?? '');
    if (root.isEmpty) return true;
    if (f == root) return true;
    if (includeNested && f.startsWith('$root/')) return true;
    return false;
  }).toList();
}
