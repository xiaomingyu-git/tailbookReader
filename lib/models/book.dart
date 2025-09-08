class Book {
  final String id;
  final String title;
  final String author;
  final String? coverPath;
  final String filePath;
  final int lastReadPosition;
  final int totalChapters;
  final int currentChapter;
  final DateTime? lastReadTime;

  Book({
    required this.id,
    required this.title,
    required this.author,
    this.coverPath,
    required this.filePath,
    required this.lastReadPosition,
    required this.totalChapters,
    required this.currentChapter,
    this.lastReadTime,
  });

  Book copyWith({
    String? id,
    String? title,
    String? author,
    String? coverPath,
    String? filePath,
    int? lastReadPosition,
    int? totalChapters,
    int? currentChapter,
    DateTime? lastReadTime,
  }) {
    return Book(
      id: id ?? this.id,
      title: title ?? this.title,
      author: author ?? this.author,
      coverPath: coverPath ?? this.coverPath,
      filePath: filePath ?? this.filePath,
      lastReadPosition: lastReadPosition ?? this.lastReadPosition,
      totalChapters: totalChapters ?? this.totalChapters,
      currentChapter: currentChapter ?? this.currentChapter,
      lastReadTime: lastReadTime ?? this.lastReadTime,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'author': author,
      'coverPath': coverPath,
      'filePath': filePath,
      'lastReadPosition': lastReadPosition,
      'totalChapters': totalChapters,
      'currentChapter': currentChapter,
      'lastReadTime': lastReadTime?.toIso8601String(),
    };
  }

  factory Book.fromJson(Map<String, dynamic> json) {
    return Book(
      id: json['id'] as String,
      title: json['title'] as String,
      author: json['author'] as String,
      coverPath: json['coverPath'] as String?,
      filePath: json['filePath'] as String,
      lastReadPosition: json['lastReadPosition'] as int,
      totalChapters: json['totalChapters'] as int,
      currentChapter: json['currentChapter'] as int,
      lastReadTime: json['lastReadTime'] != null
          ? DateTime.parse(json['lastReadTime'] as String)
          : null,
    );
  }
}
