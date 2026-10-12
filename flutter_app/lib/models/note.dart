class Note {
  Note({
    required this.id,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    this.trashedAt,
    this.restoredAt,
    this.format = NoteFormat.markdown,
    this.folder,
    this.bookId,
    this.bookTitle,
    this.bookAuthor,
    this.bookCover,
    this.chapterIndex,
    this.readRatio,
    this.readAt,
    this.starred = false,
    this.starredAt,
    this.openedAt,
  });

  final String id;
  String content;
  final int createdAt;
  int updatedAt;
  int? trashedAt;
  int? restoredAt;
  NoteFormat format;
  String? folder;
  String? bookId;
  String? bookTitle;
  String? bookAuthor;
  String? bookCover;
  int? chapterIndex;
  double? readRatio;
  int? readAt;
  bool starred;
  int? starredAt;
  int? openedAt;

  bool get isTrashed {
    if (trashedAt == null) return false;
    if (restoredAt == null) return true;
    return trashedAt! > restoredAt!;
  }

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
        if (restoredAt != null) 'restoredAt': restoredAt,
        'format': format == NoteFormat.txt ? 'txt' : 'md',
        if (folder != null && folder!.isNotEmpty) 'folder': folder,
        if (bookId != null) 'bookId': bookId,
        if (bookTitle != null) 'bookTitle': bookTitle,
        if (bookAuthor != null) 'bookAuthor': bookAuthor,
        if (bookCover != null) 'bookCover': bookCover,
        if (chapterIndex != null) 'chapterIndex': chapterIndex,
        if (readRatio != null) 'readRatio': readRatio,
        if (readAt != null) 'readAt': readAt,
        if (starred) 'starred': true,
        if (starredAt != null) 'starredAt': starredAt,
        if (openedAt != null) 'openedAt': openedAt,
      };

  factory Note.fromJson(Map<String, dynamic> json) {
    return Note(
      id: json['id'] as String,
      content: json['content'] as String? ?? '',
      createdAt: (json['createdAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      trashedAt: (json['trashedAt'] as num?)?.toInt(),
      restoredAt: (json['restoredAt'] as num?)?.toInt(),
      format: json['format'] == 'txt' ? NoteFormat.txt : NoteFormat.markdown,
      folder: json['folder'] as String?,
      bookId: json['bookId'] as String?,
      bookTitle: json['bookTitle'] as String?,
      bookAuthor: json['bookAuthor'] as String?,
      bookCover: json['bookCover'] as String?,
      chapterIndex: (json['chapterIndex'] as num?)?.toInt(),
      readRatio: (json['readRatio'] as num?)?.toDouble(),
      readAt: (json['readAt'] as num?)?.toInt(),
      starred: json['starred'] == true,
      starredAt: (json['starredAt'] as num?)?.toInt(),
      openedAt: (json['openedAt'] as num?)?.toInt(),
    );
  }

  Note copyWith({
    String? content,
    int? updatedAt,
    int? trashedAt,
    int? restoredAt,
    bool clearTrash = false,
    bool clearRestore = false,
    NoteFormat? format,
    String? folder,
    bool clearFolder = false,
    String? bookId,
    String? bookTitle,
    String? bookAuthor,
    String? bookCover,
    int? chapterIndex,
    double? readRatio,
    int? readAt,
    bool? starred,
    int? starredAt,
    int? openedAt,
  }) {
    return Note(
      id: id,
      content: content ?? this.content,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      trashedAt: clearTrash ? null : (trashedAt ?? this.trashedAt),
      restoredAt: clearRestore ? null : (restoredAt ?? this.restoredAt),
      format: format ?? this.format,
      folder: clearFolder ? null : (folder ?? this.folder),
      bookId: bookId ?? this.bookId,
      bookTitle: bookTitle ?? this.bookTitle,
      bookAuthor: bookAuthor ?? this.bookAuthor,
      bookCover: bookCover ?? this.bookCover,
      chapterIndex: chapterIndex ?? this.chapterIndex,
      readRatio: readRatio ?? this.readRatio,
      readAt: readAt ?? this.readAt,
      starred: starred ?? this.starred,
      starredAt: starredAt ?? this.starredAt,
      openedAt: openedAt ?? this.openedAt,
    );
  }
}

enum NoteFormat { markdown, txt }
