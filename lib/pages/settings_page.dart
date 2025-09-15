import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    });
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dark_mode', _isDarkMode);
    await prefs.setBool('auto_scroll', _autoScroll);
    await prefs.setDouble('scroll_speed', _scrollSpeed);
    await prefs.setBool('keep_screen_on', _keepScreenOn);
    await prefs.setString('default_font', _defaultFont);
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

          // 数据管理
          _buildSectionHeader('数据管理'),
          _buildListTile(
            title: '清除缓存',
            subtitle: '删除所有缓存数据',
            icon: Icons.delete_sweep,
            onTap: _clearCache,
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
