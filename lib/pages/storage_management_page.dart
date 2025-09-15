import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:webdav_client/webdav_client.dart' as webdav;
import 'dart:io';
import 'dart:async';
import 'package:path/path.dart' as path;
import 'package:archive/archive.dart';

class StorageManagementPage extends StatefulWidget {
  const StorageManagementPage({super.key});

  @override
  State<StorageManagementPage> createState() => _StorageManagementPageState();
}

class _StorageManagementPageState extends State<StorageManagementPage> {
  // WebDAV配置
  String _webdavUrl = '';
  String _webdavUsername = '';
  String _webdavPassword = '';
  bool _webdavEnabled = false;

  // 本地路径配置
  String _localStoragePath = '';

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _webdavUrl = prefs.getString('webdav_url') ?? '';
      _webdavUsername = prefs.getString('webdav_username') ?? '';
      _webdavPassword = prefs.getString('webdav_password') ?? '';
      _webdavEnabled = prefs.getBool('webdav_enabled') ?? false;
      _localStoragePath = prefs.getString('local_storage_path') ?? '';
    });
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('webdav_url', _webdavUrl);
    await prefs.setString('webdav_username', _webdavUsername);
    await prefs.setString('webdav_password', _webdavPassword);
    await prefs.setBool('webdav_enabled', _webdavEnabled);
    await prefs.setString('local_storage_path', _localStoragePath);
  }

  Future<void> _selectLocalStoragePath() async {
    try {
      String? selectedDirectory = await FilePicker.platform.getDirectoryPath();
      if (selectedDirectory != null) {
        setState(() {
          _localStoragePath = selectedDirectory;
        });
        await _saveSettings();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('本地存储路径已设置为: $selectedDirectory'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('选择路径失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _testWebDAVConnection() async {
    if (_webdavUrl.isEmpty || _webdavUsername.isEmpty || _webdavPassword.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('请先填写完整的WebDAV配置信息'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      return;
    }

    try {
      final client = webdav.newClient(
        _webdavUrl,
        user: _webdavUsername,
        password: _webdavPassword,
        debug: false,
      );

      await client.readDir('/');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('WebDAV连接测试成功'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('WebDAV连接测试失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _backupFiles() async {
    try {
      if (_localStoragePath.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('请先设置本地存储路径'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // 创建备份文件夹
      final backupDir = Directory(path.join(_localStoragePath, 'backup'));
      if (!await backupDir.exists()) {
        await backupDir.create(recursive: true);
      }

      // 生成备份文件名（日期+时间戳）
      final now = DateTime.now();
      final timestamp = now.millisecondsSinceEpoch;
      final dateStr = '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}${now.second.toString().padLeft(2, '0')}';
      final backupFileName = 'backup_${dateStr}_$timestamp.zip';
      final backupFilePath = path.join(backupDir.path, backupFileName);

      // 创建压缩包
      final archive = Archive();

      // 添加books文件夹
      final booksDir = Directory(path.join(_localStoragePath, 'books'));
      if (await booksDir.exists()) {
        await _addDirectoryToArchive(archive, booksDir, 'books/');
      }

      // 添加book.sync文件
      final syncFile = File(path.join(_localStoragePath, 'book.sync'));
      if (await syncFile.exists()) {
        final syncData = await syncFile.readAsBytes();
        archive.addFile(ArchiveFile('book.sync', syncData.length, syncData));
      }

      // 写入压缩包
      final zipData = ZipEncoder().encode(archive);
      if (zipData != null) {
        await File(backupFilePath).writeAsBytes(zipData);

        if (mounted) {
          // 询问是否上传到WebDAV
          final shouldUpload = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('备份完成'),
              content: Text('备份文件已创建: $backupFileName\n\n是否上传到WebDAV？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('仅本地保存'),
                ),
                if (_webdavEnabled)
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('上传到WebDAV'),
                  ),
              ],
            ),
          );

          if (shouldUpload == true && _webdavEnabled) {
            await _uploadToWebDAV(backupFilePath, backupFileName);
          }

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('备份完成: $backupFileName'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('备份失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _addDirectoryToArchive(Archive archive, Directory dir, String prefix) async {
    await for (final entity in dir.list(recursive: true)) {
      if (entity is File) {
        // 计算相对于dir的路径
        final relativePath = path.relative(entity.path, from: dir.path);
        // 确保路径使用正斜杠
        final archivePath = (prefix + relativePath).replaceAll('\\', '/');
        final data = await entity.readAsBytes();
        archive.addFile(ArchiveFile(archivePath, data.length, data));
      }
    }
  }

  Future<void> _uploadToWebDAV(String filePath, String fileName) async {
    try {
      final client = webdav.newClient(
        _webdavUrl,
        user: _webdavUsername,
        password: _webdavPassword,
        debug: false,
      );

      await client.writeFromFile(filePath, 'backup/$fileName');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('已上传到WebDAV'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('上传到WebDAV失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _restoreFiles() async {
    try {
      if (_localStoragePath.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('请先设置本地存储路径'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // 选择备份源
      final source = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('选择备份源'),
          content: const Text('请选择备份文件的来源'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop('local'),
              child: const Text('本地文件夹'),
            ),
            if (_webdavEnabled)
              TextButton(
                onPressed: () => Navigator.of(context).pop('webdav'),
                child: const Text('WebDAV'),
              ),
          ],
        ),
      );

      if (source == null) return;

      String backupFilePath;
      if (source == 'local') {
        // 选择本地备份文件
        final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['zip'],
          allowMultiple: false,
        );

        if (result == null || result.files.isEmpty) return;
        backupFilePath = result.files.first.path!;
      } else {
        // 从WebDAV选择备份文件
        backupFilePath = await _selectWebDAVBackup();
        if (backupFilePath.isEmpty) return;
      }

      // 确认恢复
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('确认恢复'),
          content: const Text('恢复操作将替换当前的books文件夹和book.sync文件，此操作不可撤销。\n\n确认继续吗？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('确认恢复'),
            ),
          ],
        ),
      );

      if (confirmed != true) return;

      // 执行恢复
      await _performRestore(backupFilePath);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('恢复完成，请重启应用'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('恢复失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<String> _selectWebDAVBackup() async {
    try {
      final client = webdav.newClient(
        _webdavUrl,
        user: _webdavUsername,
        password: _webdavPassword,
        debug: false,
      );

      final files = await client.readDir('backup/');
      final backupFiles = files.where((file) => file.name?.endsWith('.zip') == true).toList();

      if (backupFiles.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('WebDAV中没有找到备份文件'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return '';
      }

      // 显示备份文件选择对话框
      final selectedFile = await showDialog<dynamic>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('选择备份文件'),
          content: SizedBox(
            width: double.maxFinite,
            height: 300,
            child: ListView.builder(
              itemCount: backupFiles.length,
              itemBuilder: (context, index) {
                final file = backupFiles[index];
                return ListTile(
                  title: Text(file.name ?? '未知文件'),
                  subtitle: Text('大小: ${((file.size ?? 0) / 1024 / 1024).toStringAsFixed(2)} MB'),
                  onTap: () => Navigator.of(context).pop(file),
                );
              },
            ),
          ),
        ),
      );

      if (selectedFile == null) return '';

      // 下载文件到临时位置
      final tempDir = Directory.systemTemp;
      final fileName = selectedFile.name ?? 'backup.zip';
      final tempFile = File(path.join(tempDir.path, fileName));
      final data = await client.read('backup/$fileName');
      await tempFile.writeAsBytes(data);

      return tempFile.path;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('获取WebDAV备份文件失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return '';
    }
  }

  Future<void> _performRestore(String backupFilePath) async {
    final backupFile = File(backupFilePath);
    final data = await backupFile.readAsBytes();
    final archive = ZipDecoder().decodeBytes(data);

    // 备份当前文件
    final booksDir = Directory(path.join(_localStoragePath, 'books'));
    final syncFile = File(path.join(_localStoragePath, 'book.sync'));
    final timestamp = DateTime.now().millisecondsSinceEpoch;

    // 记录临时备份文件的路径，用于后续清理
    String? tempBooksBackupPath;
    String? tempSyncBackupPath;

    if (await booksDir.exists()) {
      tempBooksBackupPath = '${booksDir.path}_backup_$timestamp';
      await booksDir.rename(tempBooksBackupPath);
    }
    if (await syncFile.exists()) {
      tempSyncBackupPath = '${syncFile.path}_backup_$timestamp';
      await syncFile.rename(tempSyncBackupPath);
    }

    try {
      // 创建新的books目录
      await booksDir.create(recursive: true);

      // 恢复文件
      for (final file in archive) {
        if (file.isFile) {
          String targetPath;

          if (file.name.startsWith('books/')) {
            // 处理books文件夹中的文件
            // 移除'books/'前缀，直接放到books文件夹中
            final relativePath = file.name.substring(6); // 移除'books/'前缀
            targetPath = path.join(_localStoragePath, 'books', relativePath);
          } else if (file.name == 'book.sync') {
            // 处理book.sync文件
            targetPath = path.join(_localStoragePath, 'book.sync');
          } else {
            // 其他文件直接放到根目录
            targetPath = path.join(_localStoragePath, file.name);
          }

          final fileDir = Directory(path.dirname(targetPath));

          if (!await fileDir.exists()) {
            await fileDir.create(recursive: true);
          }

          await File(targetPath).writeAsBytes(file.content as List<int>);
        }
      }

      // 恢复成功后，清理临时备份文件
      await _cleanupTempBackupFiles(tempBooksBackupPath, tempSyncBackupPath);

    } catch (e) {
      // 如果恢复失败，尝试恢复原始文件
      await _restoreFromTempBackup(tempBooksBackupPath, tempSyncBackupPath);
      rethrow;
    }
  }

  Future<void> _cleanupTempBackupFiles(String? tempBooksBackupPath, String? tempSyncBackupPath) async {
    try {
      if (tempBooksBackupPath != null) {
        final tempBooksDir = Directory(tempBooksBackupPath);
        if (await tempBooksDir.exists()) {
          await tempBooksDir.delete(recursive: true);
          print('已删除临时备份文件夹: $tempBooksBackupPath');
        }
      }

      if (tempSyncBackupPath != null) {
        final tempSyncFile = File(tempSyncBackupPath);
        if (await tempSyncFile.exists()) {
          await tempSyncFile.delete();
          print('已删除临时备份文件: $tempSyncBackupPath');
        }
      }
    } catch (e) {
      print('清理临时备份文件时出错: $e');
    }
  }

  Future<void> _restoreFromTempBackup(String? tempBooksBackupPath, String? tempSyncBackupPath) async {
    try {
      if (tempBooksBackupPath != null) {
        final tempBooksDir = Directory(tempBooksBackupPath);
        final booksDir = Directory(path.join(_localStoragePath, 'books'));

        if (await tempBooksDir.exists()) {
          // 删除可能创建的新books目录
          if (await booksDir.exists()) {
            await booksDir.delete(recursive: true);
          }
          // 恢复原始books目录
          await tempBooksDir.rename(booksDir.path);
        }
      }

      if (tempSyncBackupPath != null) {
        final tempSyncFile = File(tempSyncBackupPath);
        final syncFile = File(path.join(_localStoragePath, 'book.sync'));

        if (await tempSyncFile.exists()) {
          // 恢复原始book.sync文件
          await tempSyncFile.rename(syncFile.path);
        }
      }
    } catch (e) {
      print('从临时备份恢复时出错: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('存储管理'),
        actions: [
          IconButton(
            onPressed: () async {
              await _saveSettings();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('设置已保存'),
                    backgroundColor: Colors.green,
                  ),
                );
              }
            },
            icon: const Icon(Icons.save),
            tooltip: '保存设置',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 本地存储配置
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '本地存储配置',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            decoration: const InputDecoration(
                              labelText: '存储路径',
                              border: OutlineInputBorder(),
                            ),
                            controller: TextEditingController(text: _localStoragePath),
                            onChanged: (value) => _localStoragePath = value,
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: _selectLocalStoragePath,
                          icon: const Icon(Icons.folder_open),
                          tooltip: '选择文件夹',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // WebDAV配置
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'WebDAV配置',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const Spacer(),
                        Switch(
                          value: _webdavEnabled,
                          onChanged: (value) {
                            setState(() {
                              _webdavEnabled = value;
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'WebDAV URL',
                        border: OutlineInputBorder(),
                      ),
                      controller: TextEditingController(text: _webdavUrl),
                      onChanged: (value) => _webdavUrl = value,
                      enabled: _webdavEnabled,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: '用户名',
                        border: OutlineInputBorder(),
                      ),
                      controller: TextEditingController(text: _webdavUsername),
                      onChanged: (value) => _webdavUsername = value,
                      enabled: _webdavEnabled,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: '密码',
                        border: OutlineInputBorder(),
                      ),
                      controller: TextEditingController(text: _webdavPassword),
                      onChanged: (value) => _webdavPassword = value,
                      enabled: _webdavEnabled,
                      obscureText: true,
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: _webdavEnabled ? _testWebDAVConnection : null,
                      child: const Text('测试连接'),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // 备份和恢复
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '备份与恢复',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _backupFiles,
                            icon: const Icon(Icons.backup),
                            label: const Text('备份文件'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _restoreFiles,
                            icon: const Icon(Icons.restore),
                            label: const Text('恢复文件'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '备份文件将保存到同步文件夹的backup目录中',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
