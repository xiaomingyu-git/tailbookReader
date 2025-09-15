import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as path;
import '../models/book.dart';
import 'storage_service.dart';

class BookService {
  static const String _booksKey = 'saved_books';
  static const String _booksMetadataKey = 'books_metadata';
  static const String _syncFileName = 'book.sync';

  static BookService? _instance;
  static BookService get instance {
    _instance ??= BookService._();
    return _instance!;
  }

  BookService._();

  final StorageService _storageService = StorageService.instance;
  List<Book>? _cachedBooks;

  /// 获取同步文件路径
  Future<String?> _getSyncFilePath() async {
    try {
      final storagePath = await _storageService.getStoragePath();
      if (storagePath == null) return null;
      return path.join(storagePath, _syncFileName);
    } catch (e) {
      print('获取同步文件路径失败: $e');
      return null;
    }
  }

  /// 从同步文件读取书籍信息
  Future<List<Book>> _loadBooksFromSyncFile() async {
    try {
      final syncFilePath = await _getSyncFilePath();
      if (syncFilePath == null) {
        print('同步文件路径为空');
        return [];
      }

      final syncFile = File(syncFilePath);
      if (!await syncFile.exists()) {
        print('同步文件不存在: $syncFilePath');
        return [];
      }

      final content = await syncFile.readAsString();
      if (content.isEmpty) {
        print('同步文件为空');
        return [];
      }

      final data = jsonDecode(content);
      if (data is Map<String, dynamic> && data['books'] is List) {
        final booksJson = data['books'] as List;
        return booksJson
            .map((json) => Book.fromJson(json as Map<String, dynamic>))
            .toList();
      } else if (data is List) {
        // 兼容旧格式，直接是书籍列表
        return data
            .map((json) => Book.fromJson(json as Map<String, dynamic>))
            .toList();
      }

      print('同步文件格式不正确');
      return [];
    } catch (e) {
      print('从同步文件读取书籍失败: $e');
      return [];
    }
  }

  /// 将书籍信息写入同步文件
  Future<bool> _saveBooksToSyncFile(List<Book> books) async {
    try {
      final syncFilePath = await _getSyncFilePath();
      if (syncFilePath == null) {
        print('同步文件路径为空');
        return false;
      }

      final syncFile = File(syncFilePath);
      final syncData = {
        'version': '1.0',
        'lastUpdated': DateTime.now().toIso8601String(),
        'books': books.map((book) => book.toJson()).toList(),
      };

      await syncFile.writeAsString(jsonEncode(syncData));
      print('书籍信息已同步到文件: $syncFilePath');
      return true;
    } catch (e) {
      print('保存书籍到同步文件失败: $e');
      return false;
    }
  }

  /// 获取所有书籍
  Future<List<Book>> getAllBooks() async {
    if (_cachedBooks != null) {
      return _cachedBooks!;
    }

    try {
      // 优先从同步文件读取
      final syncBooks = await _loadBooksFromSyncFile();
      if (syncBooks.isNotEmpty) {
        _cachedBooks = syncBooks;
        return _cachedBooks!;
      }

      // 如果同步文件为空或不存在，从本地存储读取
      final prefs = await SharedPreferences.getInstance();
      final booksJson = prefs.getStringList(_booksKey) ?? [];

      _cachedBooks = booksJson
          .map((jsonString) => Book.fromJson(jsonDecode(jsonString)))
          .toList();

      // 如果本地有数据，同步到文件
      if (_cachedBooks!.isNotEmpty) {
        await _saveBooksToSyncFile(_cachedBooks!);
      }

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
      // 保存到本地存储
      final prefs = await SharedPreferences.getInstance();
      final booksJson = books
          .map((book) => jsonEncode(book.toJson()))
          .toList();

      await prefs.setStringList(_booksKey, booksJson);
      _cachedBooks = List.from(books);

      // 保存书籍元数据（用于快速统计）
      await _saveBooksMetadata(books);

      // 同步到文件
      await _saveBooksToSyncFile(books);

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
      final bookToDelete = books.firstWhere(
        (book) => book.id == bookId,
        orElse: () => throw Exception('书籍不存在'),
      );

      // 删除物理文件
      await _deletePhysicalFile(bookToDelete.filePath);

      // 从数据中删除书籍记录
      books.removeWhere((book) => book.id == bookId);
      return await saveBooks(books);
    } catch (e) {
      print('删除书籍失败: $e');
      return false;
    }
  }

  /// 删除物理文件
  Future<void> _deletePhysicalFile(String filePath) async {
    try {
      final file = File(filePath);
      if (await file.exists()) {
        await file.delete();
        print('已删除物理文件: $filePath');
      } else {
        print('文件不存在，跳过删除: $filePath');
      }
    } catch (e) {
      print('删除物理文件失败: $e');
      // 不抛出异常，避免影响数据删除
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

  /// 强制刷新书籍列表（从同步文件重新读取）
  Future<List<Book>> refreshBooksFromSync() async {
    try {
      // 清除缓存
      _cachedBooks = null;

      // 从同步文件重新读取
      final syncBooks = await _loadBooksFromSyncFile();
      _cachedBooks = syncBooks;

      // 如果同步文件有数据，同步到本地存储
      if (syncBooks.isNotEmpty) {
        final prefs = await SharedPreferences.getInstance();
        final booksJson = syncBooks
            .map((book) => jsonEncode(book.toJson()))
            .toList();
        await prefs.setStringList(_booksKey, booksJson);
        await _saveBooksMetadata(syncBooks);
      }

      return syncBooks;
    } catch (e) {
      print('刷新书籍列表失败: $e');
      return [];
    }
  }

  /// 清除所有书籍数据
  Future<void> clearAllBooks() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_booksKey);
      await prefs.remove(_booksMetadataKey);
      _cachedBooks = null;

      // 同时清除同步文件
      final syncFilePath = await _getSyncFilePath();
      if (syncFilePath != null) {
        final syncFile = File(syncFilePath);
        if (await syncFile.exists()) {
          await syncFile.delete();
        }
      }
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

  /// 检查同步文件夹中是否存在同名文件
  Future<Book?> findExistingBookByFileName(String fileName) async {
    try {
      final books = await getAllBooks();
      final fileNameHash = fileName.hashCode.toString();

      for (final book in books) {
        // 比较文件名hash值，确保同名文件有相同的ID
        if (book.id == fileNameHash) {
          return book;
        }
      }
      return null;
    } catch (e) {
      print('检查同名文件失败: $e');
      return null;
    }
  }

  /// 根据书籍标题查找已存在的书籍
  Future<Book?> findExistingBookByTitle(String title) async {
    try {
      final books = await getAllBooks();
      final titleHash = title.hashCode.toString();

      for (final book in books) {
        // 比较标题hash值，确保同名书籍有相同的ID
        if (book.id == titleHash) {
          return book;
        }
      }
      return null;
    } catch (e) {
      print('检查同名书籍失败: $e');
      return null;
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

          // 尝试删除可能存在的物理文件
          await _deletePhysicalFile(book.filePath);
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
