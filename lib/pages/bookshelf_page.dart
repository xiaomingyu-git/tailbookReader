import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as path;
import 'dart:io';
import '../models/book.dart';
import '../services/storage_service.dart';
import '../services/book_service.dart';
import 'reading_page.dart';
import 'storage_management_page.dart';

class BookshelfPage extends StatefulWidget {
  const BookshelfPage({super.key});

  @override
  State<BookshelfPage> createState() => _BookshelfPageState();
}

class _BookshelfPageState extends State<BookshelfPage> {
  List<Book> _books = [];
  final StorageService _storageService = StorageService.instance;
  final BookService _bookService = BookService.instance;
  bool _isLoading = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadBooks();
  }

  Future<void> _loadBooks() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final books = await _bookService.getAllBooks();
      setState(() {
        _books = books;
      });
    } catch (e) {
      print('加载书籍失败: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('加载书籍失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// 提取书籍标题（去掉时间戳前缀）
  String _extractBookTitle(String fileName) {
    // 去掉文件扩展名
    String title = fileName.split('.').first;

    // 去掉时间戳前缀（格式：数字_）
    final timestampPattern = RegExp(r'^\d+_');
    if (timestampPattern.hasMatch(title)) {
      title = title.replaceFirst(timestampPattern, '');
    }

    // 去掉多个时间戳前缀（处理嵌套时间戳）
    while (timestampPattern.hasMatch(title)) {
      title = title.replaceFirst(timestampPattern, '');
    }

    return title;
  }

  /// 刷新书架（从同步文件重新读取）
  Future<void> _refreshBookshelf() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final books = await _bookService.refreshBooksFromSync();
      setState(() {
        _books = books;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已从同步文件刷新书架，共 ${books.length} 本书籍'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      print('刷新书架失败: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('刷新书架失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _importBook() async {
    try {
      // 获取本地存储路径
      final localStoragePath = await _storageService.getStoragePath();

      if (localStoragePath == null || localStoragePath.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('请先在设置中配置本地存储路径'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        return;
      }

      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['txt'],
        allowMultiple: true,
      );

      if (result != null) {
        int successCount = 0;
        int skippedCount = 0;
        List<String> skippedFiles = [];

        // 先获取当前所有书籍，避免在循环中重复查询
        final currentBooks = await _bookService.getAllBooks();
        final existingTitles = currentBooks.map((book) => book.title).toSet();

        for (var file in result.files) {
          if (file.path != null) {
            try {
              final fileName = file.name;
              // 提取书籍标题（去掉时间戳前缀）
              final bookTitle = _extractBookTitle(fileName);
              final bookId = bookTitle.hashCode.toString();

              // 第一步：检查当前会话中是否已存在这个标题
              if (existingTitles.contains(bookTitle)) {
                // 如果已存在，跳过导入
                skippedCount++;
                skippedFiles.add(fileName);
                print('跳过导入，已存在相同标题: ${fileName} -> ${bookTitle}');
                continue;
              }

              // 第二步：检查book文件夹中是否有相同hash值的文件
              final booksDirPath = await _storageService.createBooksDirectory();
              final booksDir = Directory(booksDirPath);
              final targetPath = path.join(booksDir.path, fileName);

              String finalFilePath = targetPath;
              bool needCopy = true;

              // 检查book文件夹中是否已存在同名文件
              final existingFile = File(targetPath);
              if (await existingFile.exists()) {
                // 如果book文件夹中已存在同名文件，直接使用，不需要复制
                print('book文件夹中已存在同名文件，直接使用: ${fileName}');
                finalFilePath = targetPath;
                needCopy = false;
              } else {
                // 第三步：如果都不存在，复制文件到book文件夹
                final sourceFile = File(file.path!);

                try {
                  await sourceFile.copy(targetPath);
                  print('文件复制成功: ${fileName}');
                } catch (copyError) {
                  print('文件复制失败: $copyError');
                  // 如果复制失败，尝试使用原始路径
                  if (copyError.toString().contains('Operation not permitted')) {
                    throw Exception('文件复制权限不足，请检查：\n'
                        '1. 目标文件夹的写入权限\n'
                        '2. 应用的文件访问权限\n'
                        '3. 尝试选择其他存储路径');
                  } else {
                    throw Exception('文件复制失败: $copyError');
                  }
                }
              }

              // 创建书籍记录
              final book = Book(
                id: bookId,
                title: bookTitle,
                author: '未知作者',
                coverPath: null,
                filePath: finalFilePath,
                lastReadPosition: 0,
                totalChapters: 0,
                currentChapter: 1,
              );

              // 使用BookService保存书籍到book.sync
              final success = await _bookService.addBook(book);
              if (success) {
                // 更新本地缓存，避免后续文件重复添加
                existingTitles.add(bookTitle);
                successCount++;
                print('书籍记录已添加到book.sync: ${book.title}');
              } else {
                print('保存书籍到数据库失败: ${book.title}');
              }
            } catch (e) {
              print('导入书籍失败: $e');
              // 显示具体的错误信息
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('导入失败: ${e.toString()}'),
                    backgroundColor: Colors.red,
                    behavior: SnackBarBehavior.floating,
                    duration: const Duration(seconds: 5),
                    margin: const EdgeInsets.all(16),
                  ),
                );
              }
            }
          }
        }

        // 重新加载书籍列表以更新UI
        await _loadBooks();

        if (mounted) {
          String message = '成功导入 $successCount 本书籍';
          if (skippedCount > 0) {
            message += '\n跳过 $skippedCount 个文件（book.sync中已存在）';
            if (skippedFiles.isNotEmpty) {
              message += '\n跳过的文件：${skippedFiles.join(', ')}';
            }
          }

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              behavior: SnackBarBehavior.floating,
              duration: Duration(seconds: skippedCount > 0 ? 5 : 3),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('导入书籍失败: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _openBook(Book book) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ReadingPage(book: book),
      ),
    );
  }

  Future<void> _deleteBook(Book book) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除书籍'),
        content: Text('确定要删除《${book.title}》吗？\n\n此操作将同时删除：\n• 书籍记录\n• 物理文件\n\n此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        final success = await _bookService.deleteBook(book.id);
        if (success) {
          setState(() {
            _books.removeWhere((b) => b.id == book.id);
          });

          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('已删除《${book.title}》'),
                backgroundColor: Colors.green,
              ),
            );
          }
        } else {
          throw Exception('删除失败');
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('删除失败: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  List<Book> _searchResults = [];
  bool _isSearching = false;

  Future<void> _searchBooks(String query) async {
    setState(() {
      _searchQuery = query;
      _isSearching = query.isNotEmpty;
    });

    if (query.isEmpty) {
      // 清空搜索，显示所有书籍
      setState(() {
        _searchResults = [];
        _isSearching = false;
      });
    } else {
      try {
        final results = await _bookService.searchBooks(query);
        setState(() {
          _searchResults = results;
        });
      } catch (e) {
        print('搜索失败: $e');
        setState(() {
          _searchResults = [];
        });
      }
    }
  }

  List<Book> get _displayedBooks {
    return _isSearching ? _searchResults : _books;
  }

  void _showBooksMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.cleaning_services),
            title: const Text('清理无效书籍'),
            onTap: () {
              Navigator.pop(context);
              _cleanupInvalidBooks();
            },
          ),
          ListTile(
            leading: const Icon(Icons.storage),
            title: const Text('存储管理'),
            onTap: () {
              Navigator.pop(context);
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => const StorageManagementPage(),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _cleanupInvalidBooks() async {
    try {
      final removedCount = await _bookService.cleanupInvalidBooks();
      if (removedCount > 0) {
        await _loadBooks(); // 重新加载书籍列表
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('已清理 $removedCount 本无效书籍'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('没有发现无效书籍'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('清理失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的书架'),
        actions: [
          IconButton(
            onPressed: _refreshBookshelf,
            icon: const Icon(Icons.refresh),
            tooltip: '刷新书架',
          ),
          IconButton(
            onPressed: _importBook,
            icon: const Icon(Icons.add),
            tooltip: '导入书籍',
          ),
          IconButton(
            onPressed: () => _showBooksMenu(context),
            icon: const Icon(Icons.more_vert),
            tooltip: '更多选项',
          ),
        ],
      ),
      body: Column(
        children: [
          // 搜索框 - 始终显示
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              onChanged: _searchBooks,
              decoration: InputDecoration(
                hintText: '搜索书籍...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        onPressed: () => _searchBooks(''),
                        icon: const Icon(Icons.clear),
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),

          // 书籍列表或空状态
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildBooksGrid(),
          ),
        ],
      ),
    );
  }

  Widget _buildBooksGrid() {
    // 如果没有书籍，显示简单的空状态
    if (_displayedBooks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.library_books_outlined,
              size: 80,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              _searchQuery.isEmpty ? '书架空空如也' : '未找到相关书籍',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              _searchQuery.isEmpty
                  ? '点击右上角的 + 号导入书籍'
                  : '尝试其他搜索关键词',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
            if (_searchQuery.isEmpty) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _importBook,
                icon: const Icon(Icons.add),
                label: const Text('导入书籍'),
              ),
            ],
          ],
        ),
      );
    }

    // 有书籍时显示列表布局
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _displayedBooks.length,
      itemBuilder: (context, index) {
        final book = _displayedBooks[index];
        return BookListItem(
          book: book,
          onTap: () => _openBook(book),
          onDelete: () => _deleteBook(book),
        );
      },
    );
  }
}

class BookListItem extends StatelessWidget {
  final Book book;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const BookListItem({
    super.key,
    required this.book,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // 书籍封面
              Container(
                width: 60,
                height: 80,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
                  ),
                ),
                child: book.coverPath != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          File(book.coverPath!),
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildDefaultCover(context);
                          },
                        ),
                      )
                    : _buildDefaultCover(context),
              ),

              const SizedBox(width: 16),

              // 书籍信息
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 书籍标题
                    Text(
                      book.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const SizedBox(height: 4),

                    // 作者
                    Text(
                      book.author,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const SizedBox(height: 8),

                    // 阅读进度
                    if (book.lastReadPosition > 0) ...[
                      LinearProgressIndicator(
                        value: book.lastReadPosition / 1000, // 假设总长度为1000
                        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],

                    // 最后阅读时间
                    if (book.lastReadTime != null)
                      Text(
                        '最后阅读: ${_formatLastReadTime(book.lastReadTime!)}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),

              // 操作按钮
              IconButton(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline),
                tooltip: '删除书籍',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDefaultCover(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Icon(
          Icons.book_outlined,
          size: 32,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }

  String _formatLastReadTime(DateTime lastReadTime) {
    final now = DateTime.now();
    final difference = now.difference(lastReadTime);

    if (difference.inDays > 0) {
      return '${difference.inDays}天前';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}小时前';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}分钟前';
    } else {
      return '刚刚';
    }
  }
}

