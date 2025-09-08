import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as path;
import 'dart:io';
import '../models/book.dart';
import 'reading_page.dart';

class BookshelfPage extends StatefulWidget {
  const BookshelfPage({super.key});

  @override
  State<BookshelfPage> createState() => _BookshelfPageState();
}

class _BookshelfPageState extends State<BookshelfPage> {
  List<Book> _books = [];

  @override
  void initState() {
    super.initState();
    _loadBooks();
  }

  void _loadBooks() {
    // 从本地存储加载书籍数据
    setState(() {
      _books = [];
    });
  }

  Future<void> _importBook() async {
    try {
      // 获取本地存储路径
      final prefs = await SharedPreferences.getInstance();
      String localStoragePath = prefs.getString('local_storage_path') ?? '';

      if (localStoragePath.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('请先在设置中配置本地存储路径'),
            behavior: SnackBarBehavior.floating,
          ),
        );
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
              final booksDir = Directory(path.join(localStoragePath, 'books'));
              if (!await booksDir.exists()) {
                await booksDir.create(recursive: true);
              }

              // 生成唯一的文件名
              final timestamp = DateTime.now().millisecondsSinceEpoch;
              final fileName = '${timestamp}_${file.name}';
              final targetPath = path.join(booksDir.path, fileName);

              // 复制文件到本地存储路径
              final sourceFile = File(file.path!);
              final targetFile = File(targetPath);

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

              setState(() {
                _books.add(book);
              });

              successCount++;
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
            content: Text('导入失败: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _openBook(Book book) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ReadingPage(book: book),
      ),
    );
  }

  void _deleteBook(Book book) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除书籍'),
        content: Text('确定要删除《${book.title}》吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              setState(() {
                _books.removeWhere((b) => b.id == book.id);
              });
              Navigator.pop(context);
            },
            child: const Text('删除'),
          ),
        ],
      ),
    );
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
        ],
      ),
      body: _books.isEmpty
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
                    '书架空空如也',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '点击右上角的 + 号导入书籍',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _importBook,
                    icon: const Icon(Icons.add),
                    label: const Text('导入书籍'),
                  ),
                ],
              ),
            )
          : LayoutBuilder(
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
                  itemCount: _books.length,
                  itemBuilder: (context, index) {
                    final book = _books[index];
                    return BookCard(
                      book: book,
                      onTap: () => _openBook(book),
                      onDelete: () => _deleteBook(book),
                    );
                  },
                );
              },
            ),
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
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 3,
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceVariant,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outline.withOpacity(0.2),
                      width: 1,
                    ),
                  ),
                  child: book.coverPath != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.asset(
                            book.coverPath!,
                            fit: BoxFit.cover,
                          ),
                        )
                      : Center(
                          child: Icon(
                            Icons.book,
                            size: 32,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 6),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      book.title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      book.author,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.outline,
                            fontSize: 11,
                          ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '第${book.currentChapter}章',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontSize: 10,
                                ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'delete') {
                              onDelete();
                            }
                          },
                          itemBuilder: (context) => [
                            const PopupMenuItem(
                              value: 'delete',
                              child: Row(
                                children: [
                                  Icon(Icons.delete_outline, size: 16),
                                  SizedBox(width: 8),
                                  Text('删除'),
                                ],
                              ),
                            ),
                          ],
                          child: Icon(
                            Icons.more_vert,
                            size: 14,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
