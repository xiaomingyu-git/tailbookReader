import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webdav_client/webdav_client.dart';
import 'package:http/http.dart' as http;
import 'dart:io';
import 'dart:convert';
import 'dart:async';
import '../services/storage_service.dart';
import 'permission_guide_page.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _isDarkMode = false;
  bool _autoScroll = false;
  double _scrollSpeed = 1.0;
  bool _keepScreenOn = false;
  String _defaultFont = '系统默认';

  // WebDAV配置
  String _webdavUrl = '';
  String _webdavUsername = '';
  String _webdavPassword = '';
  bool _webdavEnabled = false;

  // 本地路径配置
  String _localStoragePath = '';
  final StorageService _storageService = StorageService.instance;

  final List<String> _fontOptions = [
    '系统默认',
    '思源黑体',
    '微软雅黑',
    '宋体',
    '楷体',
  ];

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _isDarkMode = prefs.getBool('dark_mode') ?? false;
      _autoScroll = prefs.getBool('auto_scroll') ?? false;
      _scrollSpeed = prefs.getDouble('scroll_speed') ?? 1.0;
      _keepScreenOn = prefs.getBool('keep_screen_on') ?? false;
      _defaultFont = prefs.getString('default_font') ?? '系统默认';

      // WebDAV配置
      _webdavUrl = prefs.getString('webdav_url') ?? '';
      _webdavUsername = prefs.getString('webdav_username') ?? '';
      _webdavPassword = prefs.getString('webdav_password') ?? '';
      _webdavEnabled = prefs.getBool('webdav_enabled') ?? false;
    });

    // 从存储服务获取路径
    try {
      final path = await _storageService.getStoragePath();
      setState(() {
        _localStoragePath = path ?? '';
      });
    } catch (e) {
      print('获取存储路径失败: $e');
    }
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dark_mode', _isDarkMode);
    await prefs.setBool('auto_scroll', _autoScroll);
    await prefs.setDouble('scroll_speed', _scrollSpeed);
    await prefs.setBool('keep_screen_on', _keepScreenOn);
    await prefs.setString('default_font', _defaultFont);

    // WebDAV配置
    await prefs.setString('webdav_url', _webdavUrl);
    await prefs.setString('webdav_username', _webdavUsername);
    await prefs.setString('webdav_password', _webdavPassword);
    await prefs.setBool('webdav_enabled', _webdavEnabled);
  }

  void _showAboutDialog() {
    showAboutDialog(
      context: context,
      applicationName: 'Book Reader',
      applicationVersion: '1.0.0',
      applicationIcon: const Icon(
        Icons.library_books,
        size: 48,
      ),
      children: [
        const Text('一个简洁优雅的跨平台小说阅读应用'),
        const SizedBox(height: 8),
        const Text('支持 Windows、macOS 和 Android 平台'),
        const SizedBox(height: 8),
        const Text('基于 Flutter 和 Material Design 3 构建'),
      ],
    );
  }

  void _clearCache() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('清除缓存'),
        content: const Text('确定要清除所有缓存数据吗？这将删除所有导入的书籍和阅读记录。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              // TODO: 实现清除缓存逻辑
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('缓存已清除'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            child: const Text('清除'),
          ),
        ],
      ),
    );
  }

  Future<void> _testWebDAVConnection() async {
    if (_webdavUrl.isEmpty || _webdavUsername.isEmpty || _webdavPassword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('请先填写完整的WebDAV配置信息'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    // 在配置对话框内显示测试结果，不关闭对话框
    _showWebDAVTestResultInDialog();
  }

  void _showWebDAVTestResultInDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('正在测试连接...'),
            ],
          ),
          content: const Text('请稍候，正在测试WebDAV连接...'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
          ],
        ),
      ),
    );

    // 异步执行测试
    _performWebDAVTest().then((result) {
      // 关闭加载对话框
      Navigator.pop(context);

      // 显示结果对话框
      _showWebDAVTestResult(result['success'], result['message']);
    });
  }

  Future<Map<String, dynamic>> _performWebDAVTest() async {
    try {
      // 清理URL格式
      String cleanUrl = _webdavUrl.trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://$cleanUrl';
      }
      if (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      }

      print('尝试连接WebDAV: $cleanUrl');
      print('用户名: $_webdavUsername');

      // 先尝试基本的网络连接测试
      try {
        final uri = Uri.parse(cleanUrl);
        final host = uri.host;
        print('正在解析主机: $host');

        // 尝试解析主机名，添加超时
        final addresses = await InternetAddress.lookup(host).timeout(
          const Duration(seconds: 10),
          onTimeout: () {
            throw TimeoutException('DNS解析超时', const Duration(seconds: 10));
          },
        );

        if (addresses.isEmpty) {
          return {
            'success': false,
            'message': '无法解析主机名: $host\n\n可能的原因：\n1. 网络连接问题\n2. DNS服务器问题\n3. WebDAV服务器地址错误\n\n建议：\n• 检查网络连接\n• 尝试更换DNS服务器(8.8.8.8)\n• 确认WebDAV服务器地址正确',
          };
        }
        print('主机解析成功: ${addresses.first.address}');
      } catch (e) {
        print('网络连接测试失败: $e');
        String errorMessage = '网络连接失败\n\n错误详情: $e\n\n解决建议：\n';

        if (e.toString().contains('Failed host lookup')) {
          errorMessage += '• DNS解析失败，请检查网络连接\n';
          errorMessage += '• 尝试更换DNS服务器(8.8.8.8)\n';
          errorMessage += '• 检查WebDAV服务器地址是否正确\n';
        } else if (e.toString().contains('TimeoutException')) {
          errorMessage += '• 连接超时，请检查网络速度\n';
          errorMessage += '• 检查防火墙设置\n';
          errorMessage += '• 尝试使用其他网络环境\n';
        } else {
          errorMessage += '• 检查网络连接是否正常\n';
          errorMessage += '• 检查WebDAV服务器地址是否正确\n';
          errorMessage += '• 检查防火墙设置\n';
        }

        return {
          'success': false,
          'message': errorMessage,
        };
      }

      // 尝试WebDAV连接
      try {
        final client = newClient(
          cleanUrl,
          user: _webdavUsername,
          password: _webdavPassword,
          debug: true,
        );

        // 方法1: 尝试ping
        try {
          await client.ping().timeout(const Duration(seconds: 15));
          return {
            'success': true,
            'message': 'WebDAV连接测试成功！\n服务器响应正常',
          };
        } catch (e) {
          print('ping失败: $e');

          // 方法2: 使用原生HTTP测试
          try {
            final httpResult = await _testWebDAVWithHttp(cleanUrl, _webdavUsername, _webdavPassword);
            if (httpResult['success']) {
              return {
                'success': true,
                'message': 'WebDAV连接测试成功！\n${httpResult['message']}',
              };
            } else {
              return {
                'success': false,
                'message': 'WebDAV连接失败\n\n${httpResult['message']}\n\n请检查：\n• 用户名和密码是否正确\n• 服务器是否支持WebDAV协议\n• 账户是否有WebDAV访问权限',
              };
            }
          } catch (e2) {
            print('HTTP测试失败: $e2');
            return {
              'success': false,
              'message': 'WebDAV连接失败\n\n所有测试方法都失败\n\n错误详情: $e2\n\n可能的原因：\n• 服务器不支持WebDAV协议\n• 认证信息错误\n• 网络连接不稳定\n• 服务器配置问题',
            };
          }
        }
      } catch (e) {
        print('WebDAV客户端创建失败: $e');
        return {
          'success': false,
          'message': 'WebDAV客户端创建失败\n\n错误详情: $e\n\n请检查WebDAV服务器地址格式是否正确',
        };
      }
    } catch (e) {
      print('WebDAV连接异常: $e');
      return {
        'success': false,
        'message': '连接异常: $e\n\n请检查网络连接和服务器配置',
      };
    }
  }

  void _showWebDAVTestResult(bool success, String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              success ? Icons.check_circle : Icons.error,
              color: success ? Colors.green : Colors.red,
              size: 24,
            ),
            const SizedBox(width: 8),
            Text(success ? '连接成功' : '连接失败'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              success
                ? 'WebDAV服务器连接测试成功！'
                : 'WebDAV服务器连接测试失败！',
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: success ? Colors.green.shade50 : Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: success ? Colors.green.shade200 : Colors.red.shade200,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '详细信息:',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: success ? Colors.green.shade800 : Colors.red.shade800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message,
                    style: TextStyle(
                      fontSize: 12,
                      color: success ? Colors.green.shade700 : Colors.red.shade700,
                    ),
                  ),
                ],
              ),
            ),
            if (!success) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '💡 解决建议:',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    SizedBox(height: 4),
                    Text(
                      '• 检查WebDAV服务器地址是否正确\n'
                      '• 确认用户名和密码是否正确\n'
                      '• 检查网络连接是否正常\n'
                      '• 确认服务器是否支持WebDAV协议\n'
                      '• 检查防火墙设置是否阻止了连接',
                      style: TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('确定'),
          ),
          if (!success)
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                // 延迟一下再显示配置对话框
                Future.delayed(const Duration(milliseconds: 200), () {
                  _showWebDAVConfigDialog();
                });
              },
              child: const Text('重新配置'),
            ),
        ],
      ),
    );
  }

  Future<Map<String, dynamic>> _testWebDAVWithHttp(String url, String username, String password) async {
    try {
      // 创建基本认证头
      final credentials = base64Encode(utf8.encode('$username:$password'));
      final headers = {
        'Authorization': 'Basic $credentials',
        'Content-Type': 'application/xml',
        'Depth': '0',
      };

      // 尝试PROPFIND请求
      final request = http.Request(
        'PROPFIND',
        Uri.parse(url),
      );
      request.headers.addAll(headers);
      request.body = '''<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:allprop/>
</D:propfind>''';

      final response = await request.send().timeout(const Duration(seconds: 15));
      final responseBody = await response.stream.bytesToString();

      print('HTTP响应状态: ${response.statusCode}');
      print('HTTP响应头: ${response.headers}');
      print('HTTP响应体: $responseBody');

      if (response.statusCode == 200 || response.statusCode == 207) {
        return {
          'success': true,
          'message': 'HTTP连接成功 (状态码: ${response.statusCode})\n服务器支持WebDAV协议',
        };
      } else if (response.statusCode == 401) {
        return {
          'success': false,
          'message': '认证失败 (状态码: 401)\n\n请检查：\n• 用户名是否正确\n• 密码是否正确\n• 是否使用了应用密码（坚果云需要）',
        };
      } else if (response.statusCode == 403) {
        return {
          'success': false,
          'message': '访问被拒绝 (状态码: 403)\n\n可能的原因：\n• 账户没有WebDAV访问权限\n• 服务器配置限制\n• 需要特殊权限',
        };
      } else if (response.statusCode == 404) {
        return {
          'success': false,
          'message': 'WebDAV服务未找到 (状态码: 404)\n\n请检查：\n• URL路径是否正确\n• 服务器是否支持WebDAV\n• 路径是否包含 /dav/ 或 /webdav/',
        };
      } else if (response.statusCode >= 500) {
        return {
          'success': false,
          'message': '服务器错误 (状态码: ${response.statusCode})\n\n服务器内部错误，请稍后重试',
        };
      } else {
        return {
          'success': false,
          'message': 'HTTP请求失败 (状态码: ${response.statusCode})\n\n响应内容: $responseBody',
        };
      }
    } catch (e) {
      print('HTTP测试异常: $e');

      // 根据错误类型提供更友好的提示
      String friendlyMessage;
      if (e.toString().contains('Operation not permitted')) {
        friendlyMessage = 'macOS应用沙盒限制网络访问\n\n解决方案：\n'
            '1. 重启应用以应用新的权限设置\n'
            '2. 检查系统偏好设置中的网络权限\n'
            '3. 如果问题持续，请重新编译应用\n'
            '4. 尝试在终端中运行应用';
      } else if (e.toString().contains('Connection failed') || e.toString().contains('Failed host lookup')) {
        friendlyMessage = '网络连接失败\n\n可能的原因：\n'
            '1. 网络连接不稳定\n'
            '2. DNS解析失败\n'
            '3. 服务器地址错误\n'
            '4. 防火墙阻止连接\n\n'
            '建议：\n'
            '• 检查网络连接\n'
            '• 尝试更换DNS服务器(8.8.8.8)\n'
            '• 检查WebDAV服务器地址';
      } else if (e.toString().contains('timeout') || e.toString().contains('TimeoutException')) {
        friendlyMessage = '连接超时\n\n可能的原因：\n'
            '1. 网络速度慢\n'
            '2. 服务器响应慢\n'
            '3. 防火墙设置\n'
            '4. 网络不稳定\n\n'
            '建议：\n'
            '• 检查网络速度\n'
            '• 尝试使用其他网络\n'
            '• 检查防火墙设置';
      } else if (e.toString().contains('HandshakeException')) {
        friendlyMessage = 'SSL/TLS握手失败\n\n可能的原因：\n'
            '1. 证书问题\n'
            '2. 协议版本不匹配\n'
            '3. 服务器配置问题\n\n'
            '建议：\n'
            '• 检查服务器SSL证书\n'
            '• 尝试使用http://而不是https://\n'
            '• 联系服务器管理员';
      } else {
        friendlyMessage = '网络连接异常\n\n错误详情: $e\n\n建议：\n'
            '• 检查网络连接\n'
            '• 检查WebDAV服务器配置\n'
            '• 尝试使用其他网络环境';
      }

      return {
        'success': false,
        'message': friendlyMessage,
      };
    }
  }

  Future<void> _selectLocalStoragePath() async {
    try {
      final selectedDirectory = await _storageService.selectStoragePath();

      if (selectedDirectory != null) {
        setState(() {
          _localStoragePath = selectedDirectory;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('本地存储路径已设置为: $selectedDirectory'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (e is StoragePathException) {
        _showPermissionGuideDialog(e);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('选择路径失败: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _showPermissionGuideDialog(StoragePathException exception) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => PermissionGuidePage(
          selectedPath: exception.path,
          onRetry: () {
            Navigator.of(context).pop();
            _selectLocalStoragePath();
          },
          onSkip: () {
            Navigator.of(context).pop();
          },
        ),
      ),
    );
  }

  Future<void> _showPathDebugInfo() async {
    try {
      final debugInfo = await _storageService.getPathDebugInfo();

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('路径调试信息'),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: debugInfo.entries.map((entry) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 120,
                          child: Text(
                            '${entry.key}:',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                        Expanded(
                          child: SelectableText(
                            entry.value,
                            style: const TextStyle(fontFamily: 'monospace'),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('关闭'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('获取调试信息失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showWebDAVConfigDialog() {
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('WebDAV配置'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile(
                  title: const Text('启用WebDAV'),
                  subtitle: const Text('启用后将同步书籍到WebDAV服务器'),
                  value: _webdavEnabled,
                  onChanged: (value) {
                    setDialogState(() {
                      _webdavEnabled = value;
                    });
                  },
                ),
                const SizedBox(height: 16),
                const Text(
                  'WebDAV服务器地址',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'https://dav.jianguoyun.com/dav/',
                    border: OutlineInputBorder(),
                    helperText: '支持http://和https://协议\n常见服务商：\n• 坚果云: https://dav.jianguoyun.com/dav/\n• Nextcloud: https://your-domain.com/remote.php/dav/\n• OwnCloud: https://your-domain.com/remote.php/webdav/',
                  ),
                  controller: TextEditingController(text: _webdavUrl),
                  onChanged: (value) {
                    _webdavUrl = value;
                  },
                ),
                const SizedBox(height: 16),
                const Text(
                  '用户名',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                TextField(
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    helperText: 'WebDAV服务器的登录用户名',
                  ),
                  controller: TextEditingController(text: _webdavUsername),
                  onChanged: (value) {
                    _webdavUsername = value;
                  },
                ),
                const SizedBox(height: 16),
                const Text(
                  '密码',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                TextField(
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    helperText: 'WebDAV服务器的登录密码',
                  ),
                  obscureText: true,
                  controller: TextEditingController(text: _webdavPassword),
                  onChanged: (value) {
                    _webdavPassword = value;
                  },
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '💡 配置提示',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      SizedBox(height: 8),
                      Text(
                        '• 确保WebDAV服务器已启用\n'
                        '• 检查防火墙是否允许访问\n'
                        '• 常见服务商：Nextcloud、OwnCloud、坚果云等\n'
                        '• 如果连接失败，请检查URL格式和认证信息',
                        style: TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () async {
                await _saveSettings();
                Navigator.pop(context);
              },
              child: const Text('保存'),
            ),
            ElevatedButton(
              onPressed: _testWebDAVConnection,
              child: const Text('测试连接'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
      ),
      body: ListView(
        children: [
          // 外观设置
          _buildSectionHeader('外观'),
          _buildSwitchTile(
            title: '深色模式',
            subtitle: '使用深色主题',
            value: _isDarkMode,
            onChanged: (value) {
              setState(() {
                _isDarkMode = value;
              });
              _saveSettings();
            },
            icon: Icons.dark_mode,
          ),

          _buildListTile(
            title: '默认字体',
            subtitle: _defaultFont,
            icon: Icons.font_download,
            onTap: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('选择字体'),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: _fontOptions.map((font) {
                      return RadioListTile<String>(
                        title: Text(font),
                        value: font,
                        groupValue: _defaultFont,
                        onChanged: (value) {
                          setState(() {
                            _defaultFont = value!;
                          });
                          _saveSettings();
                          Navigator.pop(context);
                        },
                      );
                    }).toList(),
                  ),
                ),
              );
            },
          ),

          const Divider(),

          // 阅读设置
          _buildSectionHeader('阅读'),
          _buildSwitchTile(
            title: '自动滚动',
            subtitle: '阅读时自动滚动页面',
            value: _autoScroll,
            onChanged: (value) {
              setState(() {
                _autoScroll = value;
              });
              _saveSettings();
            },
            icon: Icons.auto_awesome,
          ),

          _buildListTile(
            title: '滚动速度',
            subtitle: _scrollSpeed.toStringAsFixed(1),
            icon: Icons.speed,
            onTap: () {},
            trailing: SizedBox(
              width: 100,
              child: Slider(
                value: _scrollSpeed,
                min: 0.5,
                max: 3.0,
                divisions: 10,
                onChanged: (value) {
                  setState(() {
                    _scrollSpeed = value;
                  });
                  _saveSettings();
                },
              ),
            ),
          ),

          _buildSwitchTile(
            title: '保持屏幕常亮',
            subtitle: '阅读时防止屏幕自动关闭',
            value: _keepScreenOn,
            onChanged: (value) {
              setState(() {
                _keepScreenOn = value;
              });
              _saveSettings();
            },
            icon: Icons.screen_lock_portrait,
          ),

          const Divider(),

          // 存储设置
          _buildSectionHeader('存储'),
          _buildListTile(
            title: '本地存储路径',
            subtitle: _localStoragePath.isEmpty ? '未设置' : _localStoragePath,
            icon: Icons.folder,
            onTap: _selectLocalStoragePath,
          ),

          _buildListTile(
            title: '路径调试信息',
            subtitle: '查看路径处理详情',
            icon: Icons.bug_report,
            onTap: _showPathDebugInfo,
          ),

          _buildListTile(
            title: 'WebDAV配置',
            subtitle: _webdavEnabled ? '已启用' : '未启用',
            icon: Icons.cloud,
            onTap: _showWebDAVConfigDialog,
          ),

          _buildListTile(
            title: '清除缓存',
            subtitle: '删除所有缓存数据',
            icon: Icons.delete_sweep,
            onTap: _clearCache,
          ),

          _buildListTile(
            title: '存储空间',
            subtitle: '查看应用存储使用情况',
            icon: Icons.storage,
            onTap: () {
              // TODO: 实现存储空间查看
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('功能开发中'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
          ),

          const Divider(),

          // 关于
          _buildSectionHeader('关于'),
          _buildListTile(
            title: '关于应用',
            subtitle: '版本信息和应用介绍',
            icon: Icons.info,
            onTap: _showAboutDialog,
          ),

          _buildListTile(
            title: '帮助与反馈',
            subtitle: '获取帮助或提交反馈',
            icon: Icons.help,
            onTap: () {
              // TODO: 实现帮助页面
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('功能开发中'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
          ),

          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.bold,
            ),
      ),
    );
  }

  Widget _buildSwitchTile({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
    required IconData icon,
  }) {
    return ListTile(
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: Switch(
        value: value,
        onChanged: onChanged,
      ),
    );
  }

  Widget _buildListTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required VoidCallback onTap,
    Widget? trailing,
  }) {
    return ListTile(
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: trailing ?? const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
