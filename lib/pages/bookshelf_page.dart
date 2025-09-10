import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as path;
import 'dart:io';
import '../models/book.dart';
import '../services/storage_service.dart';
import '../services/book_service.dart';
import 'reading_page.dart';

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

        for (var file in result.files) {
          if (file.path != null) {
            try {
              // 创建书籍存储目录
              final booksDirPath = await _storageService.createBooksDirectory();
              final booksDir = Directory(booksDirPath);

              // 生成唯一的文件名
              final timestamp = DateTime.now().millisecondsSinceEpoch;
              final fileName = '${timestamp}_${file.name}';
              final targetPath = path.join(booksDir.path, fileName);

              // 复制文件到本地存储路径
              final sourceFile = File(file.path!);

              try {
                await sourceFile.copy(targetPath);
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

              final book = Book(
                id: timestamp.toString(),
                title: file.name.split('.').first,
                author: '未知作者',
                coverPath: null,
                filePath: targetPath,
                lastReadPosition: 0,
                totalChapters: 0,
                currentChapter: 1,
              );

              // 使用BookService保存书籍
              final success = await _bookService.addBook(book);
              if (success) {
                setState(() {
                  _books.add(book);
                });
                successCount++;
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

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('成功导入 $successCount 本书籍到本地存储'),
              behavior: SnackBarBehavior.floating,
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
        content: Text('确定要删除《${book.title}》吗？\n\n此操作不可撤销。'),
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
            leading: const Icon(Icons.search),
            title: const Text('搜索书籍'),
            onTap: () {
              Navigator.pop(context);
              // 搜索框已经在UI中显示
            },
          ),
          ListTile(
            leading: const Icon(Icons.refresh),
            title: const Text('刷新书架'),
            onTap: () {
              Navigator.pop(context);
              _loadBooks();
            },
          ),
          ListTile(
            leading: const Icon(Icons.cleaning_services),
            title: const Text('清理无效书籍'),
            onTap: () {
              Navigator.pop(context);
              _cleanupInvalidBooks();
            },
          ),
          ListTile(
            leading: const Icon(Icons.backup),
            title: const Text('导出书籍数据'),
            onTap: () {
              Navigator.pop(context);
              _exportBooksData();
            },
          ),
          ListTile(
            leading: const Icon(Icons.upload),
            title: const Text('导入书籍数据'),
            onTap: () {
              Navigator.pop(context);
              _importBooksData();
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

  Future<void> _exportBooksData() async {
    try {
      final filePath = await _bookService.exportBooksData();
      if (filePath != null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('书籍数据已导出到: $filePath'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception('导出失败');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('导出失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _importBooksData() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        allowMultiple: false,
      );

      if (result != null && result.files.isNotEmpty) {
        final filePath = result.files.first.path;
        if (filePath != null) {
          final success = await _bookService.importBooksData(filePath);
          if (success) {
            await _loadBooks(); // 重新加载书籍列表
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('书籍数据导入成功'),
                  backgroundColor: Colors.green,
                ),
              );
            }
          } else {
            throw Exception('导入失败');
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('导入失败: $e'),
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
            onPressed: _importBook,
            icon: const Icon(Icons.add),
            tooltip: '导入书籍',
          ),
          if (_books.isNotEmpty)
            IconButton(
              onPressed: () => _showBooksMenu(context),
              icon: const Icon(Icons.more_vert),
              tooltip: '更多选项',
            ),
        ],
      ),
      body: Column(
        children: [
          // 搜索框
          if (_books.isNotEmpty || _isSearching)
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
                : _displayedBooks.isEmpty
                    ? Center(
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
                      )
                    : _buildBooksGrid(),
          ),
        ],
      ),
    );
  }

  Widget _buildBooksGrid() {
    return LayoutBuilder(
      builder: (context, constraints) {
        // 根据屏幕宽度动态计算列数
        final screenWidth = constraints.maxWidth;
        int crossAxisCount;
        double childAspectRatio;
        double crossAxisSpacing;
        double mainAxisSpacing;

        if (screenWidth > 1200) {
          // 超大屏幕：6列
          crossAxisCount = 6;
          childAspectRatio = 0.65;
          crossAxisSpacing = 12;
          mainAxisSpacing = 12;
        } else if (screenWidth > 900) {
          // 大屏幕：5列
          crossAxisCount = 5;
          childAspectRatio = 0.65;
          crossAxisSpacing = 12;
          mainAxisSpacing = 12;
        } else if (screenWidth > 600) {
          // 中等屏幕：4列
          crossAxisCount = 4;
          childAspectRatio = 0.7;
          crossAxisSpacing = 14;
          mainAxisSpacing = 14;
        } else if (screenWidth > 400) {
          // 小屏幕：3列
          crossAxisCount = 3;
          childAspectRatio = 0.7;
          crossAxisSpacing = 16;
          mainAxisSpacing = 16;
        } else {
          // 手机屏幕：2列
          crossAxisCount = 2;
          childAspectRatio = 0.7;
          crossAxisSpacing = 16;
          mainAxisSpacing = 16;
        }

        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            childAspectRatio: childAspectRatio,
            crossAxisSpacing: crossAxisSpacing,
            mainAxisSpacing: mainAxisSpacing,
          ),
          itemCount: _displayedBooks.length,
          itemBuilder: (context, index) {
            final book = _displayedBooks[index];
            return BookCard(
              book: book,
              onTap: () => _openBook(book),
              onDelete: () => _deleteBook(book),
            );
          },
        );
      },
    );
  }
}

class BookCard extends StatelessWidget {
  final Book book;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const BookCard({
    super.key,
    required this.book,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 书籍封面
              Expanded(
                flex: 3,
                child: Container(
                  width: double.infinity,
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
              ),

              const SizedBox(height: 8),

              // 书籍标题
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      book.title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const SizedBox(height: 4),

                    // 作者
                    Text(
                      book.author,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const Spacer(),

                    // 阅读进度
                    if (book.lastReadPosition > 0)
                      LinearProgressIndicator(
                        value: book.lastReadPosition / 1000, // 假设总长度为1000
                        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          Theme.of(context).colorScheme.primary,
                        ),
                      ),
                  ],
                ),
              ),

              // 操作按钮
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline),
                    iconSize: 18,
                    tooltip: '删除书籍',
                  ),
                ],
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
          size: 40,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
