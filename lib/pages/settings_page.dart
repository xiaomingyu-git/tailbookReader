import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webdav_client/webdav_client.dart';
import 'package:http/http.dart' as http;
import 'dart:io';
import 'dart:convert';

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

      // 本地路径配置
      _localStoragePath = prefs.getString('local_storage_path') ?? '';

      // 如果没有设置本地路径，使用默认路径
      if (_localStoragePath.isEmpty) {
        _getDefaultStoragePath();
      }
    });
  }

  Future<void> _getDefaultStoragePath() async {
    try {
      final directory = await getApplicationDocumentsDirectory();
      setState(() {
        _localStoragePath = directory.path;
      });
      await _saveSettings();
    } catch (e) {
      print('获取默认存储路径失败: $e');
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

    // 本地路径配置
    await prefs.setString('local_storage_path', _localStoragePath);
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

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('正在测试连接...'),
          ],
        ),
      ),
    );

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

      final client = newClient(
        cleanUrl,
        user: _webdavUsername,
        password: _webdavPassword,
        debug: true,
      );

      // 尝试多种连接测试方法
      bool connected = false;
      String testResult = '';

      try {
        // 方法1: 尝试ping
        await client.ping();
        connected = true;
        testResult = 'ping测试成功';
      } catch (e) {
        print('ping失败: $e');
        testResult = 'ping失败: $e';

        try {
          // 方法2: 使用原生HTTP测试
          final httpResult = await _testWebDAVWithHttp(cleanUrl, _webdavUsername, _webdavPassword);
          if (httpResult['success']) {
            connected = true;
            testResult = 'HTTP测试成功: ${httpResult['message']}';
          } else {
            testResult = 'HTTP测试失败: ${httpResult['message']}';
          }
        } catch (e2) {
          print('HTTP测试失败: $e2');
          testResult = '所有测试方法都失败: $e2';
        }
      }

      Navigator.pop(context); // 关闭加载对话框

      // 延迟显示结果，确保对话框完全关闭
      await Future.delayed(const Duration(milliseconds: 300));

      if (connected) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('WebDAV连接测试成功！\n$testResult'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 5),
            margin: const EdgeInsets.all(16),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('WebDAV连接测试失败！\n$testResult'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
            margin: const EdgeInsets.all(16),
          ),
        );
      }
    } catch (e) {
      Navigator.pop(context); // 关闭加载对话框

      // 延迟显示结果，确保对话框完全关闭
      await Future.delayed(const Duration(milliseconds: 300));

      print('WebDAV连接异常: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('WebDAV连接测试异常: $e'),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
          margin: const EdgeInsets.all(16),
        ),
      );
    }
  }

  Future<Map<String, dynamic>> _testWebDAVWithHttp(String url, String username, String password) async {
    try {
      // 创建基本认证头
      final credentials = base64Encode(utf8.encode('$username:$password'));
      final headers = {
        'Authorization': 'Basic $credentials',
        'Content-Type': 'application/xml',
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

      final response = await request.send().timeout(const Duration(seconds: 10));
      final responseBody = await response.stream.bytesToString();

      print('HTTP响应状态: ${response.statusCode}');
      print('HTTP响应头: ${response.headers}');

      if (response.statusCode == 200 || response.statusCode == 207) {
        return {
          'success': true,
          'message': 'HTTP连接成功 (状态码: ${response.statusCode})',
        };
      } else if (response.statusCode == 401) {
        return {
          'success': false,
          'message': '认证失败，请检查用户名和密码',
        };
      } else if (response.statusCode == 404) {
        return {
          'success': false,
          'message': 'WebDAV服务未找到，请检查URL路径',
        };
      } else {
        return {
          'success': false,
          'message': 'HTTP请求失败 (状态码: ${response.statusCode})',
        };
      }
    } catch (e) {
      print('HTTP测试异常: $e');

      // 根据错误类型提供更友好的提示
      String friendlyMessage;
      if (e.toString().contains('Operation not permitted')) {
        friendlyMessage = 'macOS应用沙盒限制网络访问，请尝试：\n'
            '1. 重启应用以应用新的权限设置\n'
            '2. 检查系统偏好设置中的网络权限\n'
            '3. 如果问题持续，请重新编译应用';
      } else if (e.toString().contains('Connection failed')) {
        friendlyMessage = '连接失败，请检查：\n'
            '1. 网络连接是否正常\n'
            '2. WebDAV服务器地址是否正确\n'
            '3. 服务器是否可访问\n'
            '4. 防火墙是否阻止了连接';
      } else if (e.toString().contains('timeout')) {
        friendlyMessage = '连接超时，请检查：\n'
            '1. 网络速度\n'
            '2. 服务器响应时间\n'
            '3. 防火墙设置';
      } else {
        friendlyMessage = '网络连接异常: ${e.toString()}';
      }

      return {
        'success': false,
        'message': friendlyMessage,
      };
    }
  }

  Future<void> _selectLocalStoragePath() async {
    try {
      String? selectedDirectory = await FilePicker.platform.getDirectoryPath();

      if (selectedDirectory != null) {
        setState(() {
          _localStoragePath = selectedDirectory;
        });
        await _saveSettings();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('本地存储路径已设置为: $selectedDirectory'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('选择路径失败: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
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
                    hintText: 'https://example.com/webdav',
                    border: OutlineInputBorder(),
                    helperText: '支持http://和https://协议',
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
