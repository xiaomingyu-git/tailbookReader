import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_charset_detector/flutter_charset_detector.dart';
import '../models/book.dart';

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

        } catch (e) {
          // 如果自动检测失败，尝试手动检测常见编码
          String content = await _tryManualDecoding(bytes);
          setState(() {
            _bookContent = content;
            _isLoading = false;
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
        },
        onLineHeightChanged: (height) {
          setState(() {
            _lineHeight = height;
          });
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
            // 阅读内容
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SingleChildScrollView(
                  child: Text(
                    _bookContent,
                    style: TextStyle(
                      fontSize: _fontSize,
                      height: _lineHeight,
                      color: _textColor,
                    ),
                  ),
                ),
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
                            onPressed: () {
                              // TODO: 上一章
                            },
                            icon: const Icon(Icons.skip_previous),
                            tooltip: '上一章',
                          ),
                          IconButton(
                            onPressed: _showFontSettings,
                            icon: const Icon(Icons.text_fields),
                            tooltip: '字体设置',
                          ),
                          IconButton(
                            onPressed: () {
                              // TODO: 目录
                            },
                            icon: const Icon(Icons.list),
                            tooltip: '目录',
                          ),
                          IconButton(
                            onPressed: () {
                              // TODO: 下一章
                            },
                            icon: const Icon(Icons.skip_next),
                            tooltip: '下一章',
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
