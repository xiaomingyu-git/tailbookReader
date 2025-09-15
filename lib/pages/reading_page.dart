import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_charset_detector/flutter_charset_detector.dart';
import '../models/book.dart';
import '../services/book_service.dart';

// 章节信息
class ChapterInfo {
  final String title;
  final int startPageIndex;
  final int endPageIndex;

  ChapterInfo({
    required this.title,
    required this.startPageIndex,
    required this.endPageIndex,
  });
}

// 书签信息
class Bookmark {
  final String id;
  final String title;
  final int pageIndex;
  final String content;
  final DateTime createdAt;

  Bookmark({
    required this.id,
    required this.title,
    required this.pageIndex,
    required this.content,
    required this.createdAt,
  });
}

class ReadingPage extends StatefulWidget {
  final Book book;

  const ReadingPage({super.key, required this.book});

  @override
  State<ReadingPage> createState() => _ReadingPageState();
}

class _ReadingPageState extends State<ReadingPage> {
  Book? _currentBook;
  bool _showControls = true;
  bool _isFullScreen = false;
  double _fontSize = 16.0;
  double _lineHeight = 1.5;
  Color _backgroundColor = Colors.white;
  Color _textColor = Colors.black;
  String _bookContent = '';
  bool _isLoading = true;

  // 分页相关
  List<String> _pages = [];
  int _currentPageIndex = 0;
  int _totalPages = 0;
  double _pageHeight = 0;
  double _pageWidth = 0;
  final PageController _pageController = PageController();

  // 章节相关
  List<ChapterInfo> _chapters = [];
  int _currentChapterIndex = 0;

  // 阅读统计
  DateTime? _readingStartTime;
  int _totalReadingTime = 0; // 秒

  // 书签
  List<Bookmark> _bookmarks = [];

  // 阅读设置持久化
  bool _isNightMode = false;

  // 服务
  final BookService _bookService = BookService.instance;

  final List<Color> _backgroundColors = [
    Colors.white,
    Colors.grey[100]!,
    Colors.grey[200]!,
    Colors.amber[50]!,
    Colors.blue[50]!,
    Colors.green[50]!,
  ];

  final List<Color> _textColors = [
    Colors.black,
    Colors.grey[800]!,
    Colors.brown[800]!,
    Colors.blue[900]!,
    Colors.green[900]!,
  ];

  @override
  void initState() {
    super.initState();
    _loadCurrentBook();
    _loadReadingSettings();
    _readingStartTime = DateTime.now();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentBook() async {
    setState(() {
      _currentBook = widget.book;
      _isLoading = true;
    });

    await _loadBookContent();
  }

  Future<void> _loadBookContent() async {
    try {
      final file = File(_currentBook!.filePath);
      if (await file.exists()) {
        // 读取文件字节
        final bytes = await file.readAsBytes();
        final uint8List = Uint8List.fromList(bytes);

        try {
          // 使用专业的编码检测库自动检测并解码
          DecodingResult result = await CharsetDetector.autoDecode(uint8List);

          setState(() {
            _bookContent = result.string;
            _isLoading = false;
          });

          // 可选：在控制台显示检测到的编码
          print('检测到的编码: ${result.charset}');

          // 加载完成后进行分页
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _paginateContent();
          });

        } catch (e) {
          // 如果自动检测失败，尝试手动检测常见编码
          String content = await _tryManualDecoding(bytes);
          setState(() {
            _bookContent = content;
            _isLoading = false;
          });

          // 加载完成后进行分页
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _paginateContent();
          });
        }
      } else {
        setState(() {
          _bookContent = '文件不存在或无法读取';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _bookContent = '读取文件时出错: $e';
        _isLoading = false;
      });
    }
  }

  // 手动尝试常见编码格式
  Future<String> _tryManualDecoding(List<int> bytes) async {
    // 常见的中文编码格式列表
    final encodings = [
      {'name': 'UTF-8', 'decoder': (List<int> bytes) => utf8.decode(bytes, allowMalformed: true)},
      {'name': 'GBK', 'decoder': (List<int> bytes) => _decodeGBK(bytes)},
      {'name': 'GB2312', 'decoder': (List<int> bytes) => _decodeGB2312(bytes)},
      {'name': 'Big5', 'decoder': (List<int> bytes) => _decodeBig5(bytes)},
      {'name': 'Latin1', 'decoder': (List<int> bytes) => latin1.decode(bytes)},
    ];

    for (var encoding in encodings) {
      try {
        final decoder = encoding['decoder'] as String Function(List<int>);
        String content = decoder(bytes);
        if (content.isNotEmpty && !_containsGarbledText(content)) {
          print('手动检测成功，使用编码: ${encoding['name']}');
          return content;
        }
      } catch (e) {
        continue;
      }
    }

    // 如果所有编码都失败，返回UTF-8解码结果（允许乱码）
    try {
      return utf8.decode(bytes, allowMalformed: true);
    } catch (e) {
      return '无法读取文件内容，请检查文件编码格式';
    }
  }

  // 检查文本是否包含乱码
  bool _containsGarbledText(String text) {
    // 检查是否包含常见的乱码字符
    final garbledPatterns = [
      '', // 替换字符
      '锘', // BOM标记
      'ï»¿', // UTF-8 BOM
    ];

    for (String pattern in garbledPatterns) {
      if (text.contains(pattern)) {
        return true;
      }
    }

    // 检查是否包含过多的非ASCII字符（可能是乱码）
    int nonAsciiCount = 0;
    for (int i = 0; i < text.length && i < 1000; i++) {
      if (text.codeUnitAt(i) > 127) {
        nonAsciiCount++;
      }
    }

    // 如果前1000个字符中超过80%是非ASCII字符，可能是乱码
    return nonAsciiCount > 800;
  }

  // GBK解码（简化版本）
  String _decodeGBK(List<int> bytes) {
    try {
      // 创建一个简单的GBK到UTF-8的映射表（这里只是示例）
      // 在实际项目中，建议使用专门的编码库
      String result = '';
      for (int i = 0; i < bytes.length; i++) {
        int byte = bytes[i];
        if (byte < 128) {
          // ASCII字符
          result += String.fromCharCode(byte);
        } else if (byte >= 0x81 && byte <= 0xFE && i + 1 < bytes.length) {
          // GBK双字节字符
          int byte2 = bytes[i + 1];
          if (byte2 >= 0x40 && byte2 <= 0xFE) {
            // 简单的GBK到UTF-8转换（这里只是示例）
            // 实际项目中需要完整的GBK编码表
            result += '?'; // 暂时用?代替
            i++; // 跳过下一个字节
          } else {
            result += String.fromCharCode(byte);
          }
        } else {
          result += String.fromCharCode(byte);
        }
      }
      return result;
    } catch (e) {
      return '无法解码GBK内容';
    }
  }

  // GB2312解码（简化版本）
  String _decodeGB2312(List<int> bytes) {
    return _decodeGBK(bytes); // GB2312是GBK的子集，使用相同的解码方法
  }

  // Big5解码（简化版本）
  String _decodeBig5(List<int> bytes) {
    return _decodeGBK(bytes); // 简化处理，实际项目中需要专门的Big5解码
  }

  // 分页内容
  void _paginateContent() {
    if (_bookContent.isEmpty) return;

    // 清理文本内容
    String cleanContent = _bookContent
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .replaceAll(RegExp(r'\n\s*\n'), '\n\n')
        .trim();

    // 使用TextPainter计算分页
    _calculatePages(cleanContent);
  }

  // 计算分页
  void _calculatePages(String content) {
    if (content.isEmpty) return;

    final pages = <String>[];
    final textStyle = TextStyle(
      fontSize: _fontSize,
      height: _lineHeight,
      color: _textColor,
    );

    // 获取可用空间大小
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;
    final screenHeight = mediaQuery.size.height;
    final appBarHeight = AppBar().preferredSize.height;
    final statusBarHeight = mediaQuery.padding.top;
    final bottomPadding = mediaQuery.padding.bottom;

    _pageWidth = screenWidth - 32; // 减去左右边距
    _pageHeight = screenHeight - appBarHeight - statusBarHeight - bottomPadding - 32; // 减去上下边距

    // 缓存TextPainter以提高性能
    final textPainter = TextPainter(
      text: TextSpan(text: '', style: textStyle),
      textDirection: TextDirection.ltr,
      maxLines: null,
    );

    // 按段落分割内容
    final paragraphs = content.split('\n\n');
    String currentPage = '';

    for (String paragraph in paragraphs) {
      if (paragraph.trim().isEmpty) continue;

      // 检查添加这个段落是否会超出页面
      String testPage = currentPage.isEmpty ? paragraph : '$currentPage\n\n$paragraph';
      if (_getTextHeightOptimized(testPage, textPainter) > _pageHeight) {
        // 当前段落会超出页面，保存当前页面
        if (currentPage.isNotEmpty) {
          pages.add(currentPage);
          currentPage = paragraph;
        } else {
          // 单个段落就超出页面，需要进一步分割
          final splitParagraph = _splitLongParagraphOptimized(paragraph, textPainter);
          pages.addAll(splitParagraph);
        }
      } else {
        // 可以添加到当前页面
        currentPage = testPage;
      }
    }

    // 添加最后一页
    if (currentPage.isNotEmpty) {
      pages.add(currentPage);
    }

    setState(() {
      _pages = pages;
      _totalPages = pages.length;
      _currentPageIndex = 0;
    });

    // 识别章节
    _identifyChapters();

    // 跳转到上次阅读位置
    if (_currentBook!.lastReadPosition > 0) {
      final targetPage = ((_currentBook!.lastReadPosition / 1000) * _totalPages).round() - 1;
      _jumpToPosition(targetPage.clamp(0, _totalPages - 1));
    }
  }

  // 分割过长的段落（优化版本）
  List<String> _splitLongParagraphOptimized(String paragraph, TextPainter textPainter) {
    final pages = <String>[];
    final words = paragraph.split('');
    String currentPage = '';

    for (String word in words) {
      String testPage = currentPage + word;
      if (_getTextHeightOptimized(testPage, textPainter) > _pageHeight) {
        if (currentPage.isNotEmpty) {
          pages.add(currentPage);
          currentPage = word;
        } else {
          // 单个字符就超出页面，强制添加
          pages.add(word);
        }
      } else {
        currentPage = testPage;
      }
    }

    if (currentPage.isNotEmpty) {
      pages.add(currentPage);
    }

    return pages;
  }

  // 计算文本高度（优化版本）
  double _getTextHeightOptimized(String text, TextPainter textPainter) {
    textPainter.text = TextSpan(text: text, style: TextStyle(
      fontSize: _fontSize,
      height: _lineHeight,
      color: _textColor,
    ));
    textPainter.layout(maxWidth: _pageWidth);
    return textPainter.size.height;
  }

  // 分割过长的段落（原版本，保留作为备用）
  List<String> _splitLongParagraph(String paragraph, TextStyle textStyle) {
    final pages = <String>[];
    final words = paragraph.split('');
    String currentPage = '';

    for (String word in words) {
      String testPage = currentPage + word;
      if (_getTextHeight(testPage, textStyle) > _pageHeight) {
        if (currentPage.isNotEmpty) {
          pages.add(currentPage);
          currentPage = word;
        } else {
          // 单个字符就超出页面，强制添加
          pages.add(word);
        }
      } else {
        currentPage = testPage;
      }
    }

    if (currentPage.isNotEmpty) {
      pages.add(currentPage);
    }

    return pages;
  }

  // 计算文本高度（原版本，保留作为备用）
  double _getTextHeight(String text, TextStyle textStyle) {
    final textPainter = TextPainter(
      text: TextSpan(text: text, style: textStyle),
      textDirection: TextDirection.ltr,
      maxLines: null,
    );
    textPainter.layout(maxWidth: _pageWidth);
    return textPainter.size.height;
  }

  // 跳转到指定位置
  void _jumpToPosition(int position) {
    if (position >= 0 && position < _totalPages) {
      _currentPageIndex = position;
      _pageController.animateToPage(
        position,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  // 上一页
  void _previousPage() {
    if (_currentPageIndex > 0) {
      _currentPageIndex--;
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      _saveReadingProgress();
    }
  }

  // 下一页
  void _nextPage() {
    if (_currentPageIndex < _totalPages - 1) {
      _currentPageIndex++;
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      _saveReadingProgress();
    }
  }

  // 保存阅读进度
  Future<void> _saveReadingProgress() async {
    if (_currentBook != null && _totalPages > 0) {
      final progress = (_currentPageIndex + 1) / _totalPages;
      final updatedBook = _currentBook!.copyWith(
        lastReadPosition: (progress * 1000).round(), // 转换为0-1000的整数
        lastReadTime: DateTime.now(),
      );

      try {
        await _bookService.updateBook(updatedBook);
        setState(() {
          _currentBook = updatedBook;
        });
        print('保存阅读进度: ${(progress * 100).toInt()}%');
      } catch (e) {
        print('保存阅读进度失败: $e');
      }
    }
  }

  // 加载阅读设置
  Future<void> _loadReadingSettings() async {
    // TODO: 从SharedPreferences加载用户设置
    // 这里可以加载字体大小、行间距、主题等设置
  }

  // 保存阅读设置
  Future<void> _saveReadingSettings() async {
    // TODO: 保存用户设置到SharedPreferences
  }

  // 识别章节
  void _identifyChapters() {
    _chapters.clear();
    final chapterPattern = RegExp(r'第[一二三四五六七八九十百千万\d]+章[：:]?\s*(.+)');

    for (int i = 0; i < _pages.length; i++) {
      final page = _pages[i];
      final lines = page.split('\n');

      for (final line in lines) {
        final match = chapterPattern.firstMatch(line.trim());
        if (match != null) {
          final chapterTitle = match.group(1)?.trim() ?? line.trim();
          _chapters.add(ChapterInfo(
            title: chapterTitle,
            startPageIndex: i,
            endPageIndex: i, // 暂时设为当前页，后续会更新
          ));
          break;
        }
      }
    }

    // 更新章节的结束页索引
    for (int i = 0; i < _chapters.length - 1; i++) {
      _chapters[i] = ChapterInfo(
        title: _chapters[i].title,
        startPageIndex: _chapters[i].startPageIndex,
        endPageIndex: _chapters[i + 1].startPageIndex - 1,
      );
    }

    // 最后一个章节
    if (_chapters.isNotEmpty) {
      final lastChapter = _chapters.last;
      _chapters[_chapters.length - 1] = ChapterInfo(
        title: lastChapter.title,
        startPageIndex: lastChapter.startPageIndex,
        endPageIndex: _totalPages - 1,
      );
    }

    // 更新当前章节索引
    _updateCurrentChapterIndex();
  }

  // 更新当前章节索引
  void _updateCurrentChapterIndex() {
    for (int i = 0; i < _chapters.length; i++) {
      if (_currentPageIndex >= _chapters[i].startPageIndex &&
          _currentPageIndex <= _chapters[i].endPageIndex) {
        _currentChapterIndex = i;
        break;
      }
    }
  }

  // 添加书签
  void _addBookmark() {
    if (_pages.isNotEmpty && _currentPageIndex < _pages.length) {
      final bookmark = Bookmark(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        title: '书签 ${_bookmarks.length + 1}',
        pageIndex: _currentPageIndex,
        content: _pages[_currentPageIndex].substring(0,
            _pages[_currentPageIndex].length > 50 ? 50 : _pages[_currentPageIndex].length),
        createdAt: DateTime.now(),
      );

      setState(() {
        _bookmarks.add(bookmark);
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('书签已添加')),
      );
    }
  }

  // 删除书签
  void _deleteBookmark(String bookmarkId) {
    setState(() {
      _bookmarks.removeWhere((bookmark) => bookmark.id == bookmarkId);
    });
  }

  // 跳转到书签
  void _jumpToBookmark(Bookmark bookmark) {
    _jumpToPosition(bookmark.pageIndex);
  }

  // 显示章节列表
  void _showChapterList() {
    showModalBottomSheet(
      context: context,
      builder: (context) => ChapterListBottomSheet(
        chapters: _chapters,
        currentChapterIndex: _currentChapterIndex,
        onChapterSelected: (chapter) {
          Navigator.pop(context);
          _jumpToPosition(chapter.startPageIndex);
        },
      ),
    );
  }

  // 显示书签列表
  void _showBookmarkList() {
    showModalBottomSheet(
      context: context,
      builder: (context) => BookmarkListBottomSheet(
        bookmarks: _bookmarks,
        onBookmarkSelected: (bookmark) {
          Navigator.pop(context);
          _jumpToBookmark(bookmark);
        },
        onBookmarkDeleted: _deleteBookmark,
      ),
    );
  }

  // 切换夜间模式
  void _toggleNightMode() {
    setState(() {
      _isNightMode = !_isNightMode;
      if (_isNightMode) {
        _backgroundColor = Colors.grey[900]!;
        _textColor = Colors.grey[100]!;
      } else {
        _backgroundColor = Colors.white;
        _textColor = Colors.black;
      }
    });
    _saveReadingSettings();
  }

  // 获取阅读统计
  String _getReadingStats() {
    if (_readingStartTime == null) return '';

    final now = DateTime.now();
    final readingTime = now.difference(_readingStartTime!).inSeconds + _totalReadingTime;
    final hours = readingTime ~/ 3600;
    final minutes = (readingTime % 3600) ~/ 60;

    if (_totalPages > 0) {
      final progress = (_currentPageIndex + 1) / _totalPages;
      final estimatedTotalTime = readingTime / progress;
      final remainingTime = (estimatedTotalTime - readingTime).round();
      final remainingHours = remainingTime ~/ 3600;
      final remainingMinutes = (remainingTime % 3600) ~/ 60;

      return '已读 ${hours}h${minutes}m | 预计剩余 ${remainingHours}h${remainingMinutes}m';
    }

    return '已读 ${hours}h${minutes}m';
  }

  void _toggleControls() {
    setState(() {
      _showControls = !_showControls;
    });
  }

  void _toggleFullScreen() {
    setState(() {
      _isFullScreen = !_isFullScreen;
    });

    if (_isFullScreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
  }

  void _showFontSettings() {
    showModalBottomSheet(
      context: context,
      builder: (context) => FontSettingsBottomSheet(
        fontSize: _fontSize,
        lineHeight: _lineHeight,
        backgroundColor: _backgroundColor,
        textColor: _textColor,
        backgroundColors: _backgroundColors,
        textColors: _textColors,
        onFontSizeChanged: (size) {
          setState(() {
            _fontSize = size;
          });
          _paginateContent(); // 重新分页
        },
        onLineHeightChanged: (height) {
          setState(() {
            _lineHeight = height;
          });
          _paginateContent(); // 重新分页
        },
        onBackgroundColorChanged: (color) {
          setState(() {
            _backgroundColor = color;
          });
        },
        onTextColorChanged: (color) {
          setState(() {
            _textColor = color;
          });
        },
      ),
    );
  }

  // 显示页面跳转对话框
  void _showPageJumpDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('跳转页面'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('当前页面: ${_currentPageIndex + 1} / $_totalPages'),
            const SizedBox(height: 16),
            TextField(
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: '跳转到页面',
                hintText: '输入页码 (1-$_totalPages)',
                border: const OutlineInputBorder(),
              ),
              onSubmitted: (value) {
                final pageNumber = int.tryParse(value);
                if (pageNumber != null && pageNumber >= 1 && pageNumber <= _totalPages) {
                  _jumpToPosition(pageNumber - 1);
                  Navigator.of(context).pop();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('请输入1到$_totalPages之间的页码'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              final controller = TextEditingController();
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('跳转到页面'),
                  content: TextField(
                    controller: controller,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: '页码',
                      hintText: '1-$_totalPages',
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('取消'),
                    ),
                    TextButton(
                      onPressed: () {
                        final pageNumber = int.tryParse(controller.text);
                        if (pageNumber != null && pageNumber >= 1 && pageNumber <= _totalPages) {
                          _jumpToPosition(pageNumber - 1);
                          Navigator.of(context).pop();
                          Navigator.of(context).pop();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('请输入1到$_totalPages之间的页码'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      },
                      child: const Text('跳转'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('跳转'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_currentBook == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('阅读'),
        ),
        body: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.menu_book_outlined,
                size: 80,
                color: Colors.grey,
              ),
              SizedBox(height: 16),
              Text(
                '暂无阅读内容',
                style: TextStyle(
                  fontSize: 18,
                  color: Colors.grey,
                ),
              ),
              SizedBox(height: 8),
              Text(
                '请从书架选择一本书开始阅读',
                style: TextStyle(
                  color: Colors.grey,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: Text(_currentBook!.title),
        ),
        body: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('正在加载书籍内容...'),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: _isFullScreen ? null : AppBar(
        title: Text(_currentBook!.title),
        actions: [
          IconButton(
            onPressed: _showFontSettings,
            icon: const Icon(Icons.text_fields),
            tooltip: '字体设置',
          ),
          IconButton(
            onPressed: _toggleFullScreen,
            icon: const Icon(Icons.fullscreen),
            tooltip: '全屏阅读',
          ),
        ],
      ),
      body: GestureDetector(
        onTap: _toggleControls,
        child: Stack(
          children: [
            // 阅读内容 - 使用PageView实现分页
            SafeArea(
              child: _pages.isNotEmpty
                  ? PageView.builder(
                      controller: _pageController,
                      onPageChanged: (index) {
                        setState(() {
                          _currentPageIndex = index;
                        });
                        _updateCurrentChapterIndex();
                        _saveReadingProgress();
                      },
                      itemCount: _totalPages,
                      itemBuilder: (context, index) {
                        return Padding(
                          padding: const EdgeInsets.all(16),
                          child: SingleChildScrollView(
                            child: Text(
                              _pages[index],
                              style: TextStyle(
                                fontSize: _fontSize,
                                height: _lineHeight,
                                color: _textColor,
                              ),
                            ),
                          ),
                        );
                      },
                    )
                  : const Center(
                      child: Text(
                        '暂无内容',
                        style: TextStyle(fontSize: 16, color: Colors.grey),
                      ),
                    ),
            ),

            // 阅读进度条
            if (_totalPages > 0 && _showControls)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  height: 4,
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  child: LinearProgressIndicator(
                    value: _totalPages > 0 ? (_currentPageIndex + 1) / _totalPages : 0,
                    backgroundColor: Colors.grey[300],
                    valueColor: AlwaysStoppedAnimation<Color>(
                      Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              ),

            // 页面指示器和章节信息
            if (_totalPages > 0 && _showControls)
              Positioned(
                top: 16,
                right: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // 页面指示器
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '${_currentPageIndex + 1} / $_totalPages',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    // 章节信息
                    if (_chapters.isNotEmpty && _currentChapterIndex < _chapters.length)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          _chapters[_currentChapterIndex].title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    const SizedBox(height: 8),
                    // 阅读统计
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        _getReadingStats(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // 控制栏
            if (_showControls && !_isFullScreen)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  color: Theme.of(context).colorScheme.surface,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          IconButton(
                            onPressed: _currentPageIndex > 0 ? _previousPage : null,
                            icon: const Icon(Icons.chevron_left),
                            tooltip: '上一页',
                          ),
                          IconButton(
                            onPressed: _showChapterList,
                            icon: const Icon(Icons.menu_book),
                            tooltip: '章节列表',
                          ),
                          IconButton(
                            onPressed: _addBookmark,
                            icon: const Icon(Icons.bookmark_add),
                            tooltip: '添加书签',
                          ),
                          IconButton(
                            onPressed: _showBookmarkList,
                            icon: const Icon(Icons.bookmarks),
                            tooltip: '书签列表',
                          ),
                          IconButton(
                            onPressed: _showFontSettings,
                            icon: const Icon(Icons.text_fields),
                            tooltip: '字体设置',
                          ),
                          IconButton(
                            onPressed: _toggleNightMode,
                            icon: Icon(_isNightMode ? Icons.light_mode : Icons.dark_mode),
                            tooltip: _isNightMode ? '日间模式' : '夜间模式',
                          ),
                          IconButton(
                            onPressed: _currentPageIndex < _totalPages - 1 ? _nextPage : null,
                            icon: const Icon(Icons.chevron_right),
                            tooltip: '下一页',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

}

// 章节列表底部弹窗
class ChapterListBottomSheet extends StatelessWidget {
  final List<ChapterInfo> chapters;
  final int currentChapterIndex;
  final ValueChanged<ChapterInfo> onChapterSelected;

  const ChapterListBottomSheet({
    super.key,
    required this.chapters,
    required this.currentChapterIndex,
    required this.onChapterSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '章节列表 (${chapters.length}章)',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.builder(
              itemCount: chapters.length,
              itemBuilder: (context, index) {
                final chapter = chapters[index];
                final isCurrentChapter = index == currentChapterIndex;

                return ListTile(
                  title: Text(
                    chapter.title,
                    style: TextStyle(
                      fontWeight: isCurrentChapter ? FontWeight.bold : FontWeight.normal,
                      color: isCurrentChapter ? Theme.of(context).colorScheme.primary : null,
                    ),
                  ),
                  subtitle: Text('第 ${index + 1} 章'),
                  trailing: isCurrentChapter ? const Icon(Icons.play_arrow) : null,
                  onTap: () => onChapterSelected(chapter),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// 书签列表底部弹窗
class BookmarkListBottomSheet extends StatelessWidget {
  final List<Bookmark> bookmarks;
  final ValueChanged<Bookmark> onBookmarkSelected;
  final ValueChanged<String> onBookmarkDeleted;

  const BookmarkListBottomSheet({
    super.key,
    required this.bookmarks,
    required this.onBookmarkSelected,
    required this.onBookmarkDeleted,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '书签列表 (${bookmarks.length}个)',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          Expanded(
            child: bookmarks.isEmpty
                ? const Center(
                    child: Text(
                      '暂无书签',
                      style: TextStyle(color: Colors.grey),
                    ),
                  )
                : ListView.builder(
                    itemCount: bookmarks.length,
                    itemBuilder: (context, index) {
                      final bookmark = bookmarks[index];

                      return ListTile(
                        title: Text(bookmark.title),
                        subtitle: Text(
                          bookmark.content,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => onBookmarkDeleted(bookmark.id),
                        ),
                        onTap: () => onBookmarkSelected(bookmark),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class FontSettingsBottomSheet extends StatelessWidget {
  final double fontSize;
  final double lineHeight;
  final Color backgroundColor;
  final Color textColor;
  final List<Color> backgroundColors;
  final List<Color> textColors;
  final ValueChanged<double> onFontSizeChanged;
  final ValueChanged<double> onLineHeightChanged;
  final ValueChanged<Color> onBackgroundColorChanged;
  final ValueChanged<Color> onTextColorChanged;

  const FontSettingsBottomSheet({
    super.key,
    required this.fontSize,
    required this.lineHeight,
    required this.backgroundColor,
    required this.textColor,
    required this.backgroundColors,
    required this.textColors,
    required this.onFontSizeChanged,
    required this.onLineHeightChanged,
    required this.onBackgroundColorChanged,
    required this.onTextColorChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '阅读设置',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),

          // 字体大小
          Text(
            '字体大小',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Slider(
            value: fontSize,
            min: 12,
            max: 24,
            divisions: 12,
            label: fontSize.round().toString(),
            onChanged: onFontSizeChanged,
          ),

          const SizedBox(height: 16),

          // 行间距
          Text(
            '行间距',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Slider(
            value: lineHeight,
            min: 1.0,
            max: 2.5,
            divisions: 15,
            label: lineHeight.toStringAsFixed(1),
            onChanged: onLineHeightChanged,
          ),

          const SizedBox(height: 16),

          // 背景颜色
          Text(
            '背景颜色',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: backgroundColors.map((color) {
              return GestureDetector(
                onTap: () => onBackgroundColorChanged(color),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: backgroundColor == color
                        ? Border.all(color: Theme.of(context).colorScheme.primary, width: 3)
                        : null,
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 16),

          // 文字颜色
          Text(
            '文字颜色',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: textColors.map((color) {
              return GestureDetector(
                onTap: () => onTextColorChanged(color),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: textColor == color
                        ? Border.all(color: Theme.of(context).colorScheme.primary, width: 3)
                        : null,
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
