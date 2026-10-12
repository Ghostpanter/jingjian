class Note {
  Note({
    required this.id,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    this.trashedAt,
    this.format = NoteFormat.markdown,
  });

  final String id;
  String content;
  final int createdAt;
  int updatedAt;
  int? trashedAt;
  NoteFormat format;

  bool get isTrashed => trashedAt != null;

  String get title {
    for (final raw in content.split('\n')) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      return line
          .replaceFirst(RegExp(r'^#{1,6}\s+'), '')
          .replaceAll(RegExp(r'[*_`~]'), '')
          .trim();
    }
    return '未命名笔记';
  }

  String get preview {
    final lines = content
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .skip(1)
        .take(2);
    return lines.join(' · ');
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'content': content,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        if (trashedAt != null) 'trashedAt': trashedAt,
        'format': format == NoteFormat.txt ? 'txt' : 'md',
      };

  factory Note.fromJson(Map<String, dynamic> json) {
    return Note(
      id: json['id'] as String,
      content: json['content'] as String? ?? '',
      createdAt: (json['createdAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      trashedAt: (json['trashedAt'] as num?)?.toInt(),
      format: json['format'] == 'txt' ? NoteFormat.txt : NoteFormat.markdown,
    );
  }

  Note copyWith({
    String? content,
    int? updatedAt,
    int? trashedAt,
    bool clearTrash = false,
    NoteFormat? format,
  }) {
    return Note(
      id: id,
      content: content ?? this.content,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      trashedAt: clearTrash ? null : (trashedAt ?? this.trashedAt),
      format: format ?? this.format,
    );
  }
}

enum NoteFormat { markdown, txt }
