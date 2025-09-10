import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/book.dart';
import 'storage_service.dart';

class BookService {
  static const String _booksKey = 'saved_books';
  static const String _booksMetadataKey = 'books_metadata';

  static BookService? _instance;
  static BookService get instance {
    _instance ??= BookService._();
    return _instance!;
  }

  BookService._();

  final StorageService _storageService = StorageService.instance;
  List<Book>? _cachedBooks;

  /// 获取所有书籍
  Future<List<Book>> getAllBooks() async {
    if (_cachedBooks != null) {
      return _cachedBooks!;
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final booksJson = prefs.getStringList(_booksKey) ?? [];

      _cachedBooks = booksJson
          .map((jsonString) => Book.fromJson(jsonDecode(jsonString)))
          .toList();

      return _cachedBooks!;
    } catch (e) {
      print('获取书籍列表失败: $e');
      _cachedBooks = [];
      return _cachedBooks!;
    }
  }

  /// 保存书籍列表
  Future<bool> saveBooks(List<Book> books) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final booksJson = books
          .map((book) => jsonEncode(book.toJson()))
          .toList();

      await prefs.setStringList(_booksKey, booksJson);
      _cachedBooks = List.from(books);

      // 保存书籍元数据（用于快速统计）
      await _saveBooksMetadata(books);

      return true;
    } catch (e) {
      print('保存书籍列表失败: $e');
      return false;
    }
  }

  /// 添加新书籍
  Future<bool> addBook(Book book) async {
    try {
      final books = await getAllBooks();

      // 检查是否已存在相同ID的书籍
      if (books.any((b) => b.id == book.id)) {
        print('书籍已存在: ${book.title}');
        return false;
      }

      books.add(book);
      return await saveBooks(books);
    } catch (e) {
      print('添加书籍失败: $e');
      return false;
    }
  }

  /// 更新书籍信息
  Future<bool> updateBook(Book updatedBook) async {
    try {
      final books = await getAllBooks();
      final index = books.indexWhere((book) => book.id == updatedBook.id);

      if (index == -1) {
        print('未找到要更新的书籍: ${updatedBook.title}');
        return false;
      }

      books[index] = updatedBook;
      return await saveBooks(books);
    } catch (e) {
      print('更新书籍失败: $e');
      return false;
    }
  }

  /// 删除书籍
  Future<bool> deleteBook(String bookId) async {
    try {
      final books = await getAllBooks();
      books.removeWhere((book) => book.id == bookId);
      return await saveBooks(books);
    } catch (e) {
      print('删除书籍失败: $e');
      return false;
    }
  }

  /// 根据ID获取书籍
  Future<Book?> getBookById(String bookId) async {
    try {
      final books = await getAllBooks();
      return books.firstWhere(
        (book) => book.id == bookId,
        orElse: () => throw Exception('书籍不存在'),
      );
    } catch (e) {
      print('获取书籍失败: $e');
      return null;
    }
  }

  /// 搜索书籍
  Future<List<Book>> searchBooks(String query) async {
    try {
      final books = await getAllBooks();
      if (query.isEmpty) return books;

      final lowercaseQuery = query.toLowerCase();
      return books.where((book) {
        return book.title.toLowerCase().contains(lowercaseQuery) ||
               book.author.toLowerCase().contains(lowercaseQuery);
      }).toList();
    } catch (e) {
      print('搜索书籍失败: $e');
      return [];
    }
  }

  /// 获取最近阅读的书籍
  Future<List<Book>> getRecentBooks({int limit = 10}) async {
    try {
      final books = await getAllBooks();
      books.sort((a, b) {
        if (a.lastReadTime == null && b.lastReadTime == null) return 0;
        if (a.lastReadTime == null) return 1;
        if (b.lastReadTime == null) return -1;
        return b.lastReadTime!.compareTo(a.lastReadTime!);
      });

      return books.take(limit).toList();
    } catch (e) {
      print('获取最近阅读书籍失败: $e');
      return [];
    }
  }

  /// 更新阅读进度
  Future<bool> updateReadingProgress(String bookId, int position, int chapter) async {
    try {
      final book = await getBookById(bookId);
      if (book == null) return false;

      final updatedBook = book.copyWith(
        lastReadPosition: position,
        currentChapter: chapter,
        lastReadTime: DateTime.now(),
      );

      return await updateBook(updatedBook);
    } catch (e) {
      print('更新阅读进度失败: $e');
      return false;
    }
  }

  /// 保存书籍元数据
  Future<void> _saveBooksMetadata(List<Book> books) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final metadata = {
        'totalBooks': books.length,
        'lastUpdated': DateTime.now().toIso8601String(),
        'totalChapters': books.fold(0, (sum, book) => sum + book.totalChapters),
      };

      await prefs.setString(_booksMetadataKey, jsonEncode(metadata));
    } catch (e) {
      print('保存书籍元数据失败: $e');
    }
  }

  /// 获取书籍元数据
  Future<Map<String, dynamic>> getBooksMetadata() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final metadataJson = prefs.getString(_booksMetadataKey);

      if (metadataJson != null) {
        return jsonDecode(metadataJson);
      }

      return {
        'totalBooks': 0,
        'lastUpdated': null,
        'totalChapters': 0,
      };
    } catch (e) {
      print('获取书籍元数据失败: $e');
      return {
        'totalBooks': 0,
        'lastUpdated': null,
        'totalChapters': 0,
      };
    }
  }

  /// 清除所有书籍数据
  Future<void> clearAllBooks() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_booksKey);
      await prefs.remove(_booksMetadataKey);
      _cachedBooks = null;
    } catch (e) {
      print('清除书籍数据失败: $e');
    }
  }

  /// 导出书籍数据到文件
  Future<String?> exportBooksData() async {
    try {
      final books = await getAllBooks();
      final booksDir = await _storageService.createBooksDirectory();
      final exportFile = File('$booksDir/books_backup.json');

      final exportData = {
        'exportTime': DateTime.now().toIso8601String(),
        'version': '1.0',
        'books': books.map((book) => book.toJson()).toList(),
      };

      await exportFile.writeAsString(jsonEncode(exportData));
      return exportFile.path;
    } catch (e) {
      print('导出书籍数据失败: $e');
      return null;
    }
  }

  /// 从文件导入书籍数据
  Future<bool> importBooksData(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) return false;

      final content = await file.readAsString();
      final data = jsonDecode(content);

      if (data is Map<String, dynamic> && data['books'] is List) {
        final booksJson = data['books'] as List;
        final books = booksJson
            .map((json) => Book.fromJson(json as Map<String, dynamic>))
            .toList();

        return await saveBooks(books);
      }

      return false;
    } catch (e) {
      print('导入书籍数据失败: $e');
      return false;
    }
  }

  /// 验证书籍文件是否存在
  Future<bool> validateBookFile(Book book) async {
    try {
      final file = File(book.filePath);
      return await file.exists();
    } catch (e) {
      print('验证书籍文件失败: $e');
      return false;
    }
  }

  /// 清理无效的书籍记录
  Future<int> cleanupInvalidBooks() async {
    try {
      final books = await getAllBooks();
      final validBooks = <Book>[];
      int removedCount = 0;

      for (final book in books) {
        if (await validateBookFile(book)) {
          validBooks.add(book);
        } else {
          removedCount++;
          print('移除无效书籍: ${book.title} (文件不存在: ${book.filePath})');
        }
      }

      if (removedCount > 0) {
        await saveBooks(validBooks);
      }

      return removedCount;
    } catch (e) {
      print('清理无效书籍失败: $e');
      return 0;
    }
  }
}
