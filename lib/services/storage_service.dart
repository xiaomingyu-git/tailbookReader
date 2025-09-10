import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as path;

/// 存储路径相关异常
class StoragePathException implements Exception {
  final String message;
  final String solution;
  final String? path;

  const StoragePathException(this.message, this.solution, [this.path]);

  @override
  String toString() => message;
}

class StorageService {
  static const String _storagePathKey = 'local_storage_path';
  static const String _storagePathValidatedKey = 'local_storage_path_validated';

  static StorageService? _instance;
  static StorageService get instance {
    _instance ??= StorageService._();
    return _instance!;
  }

  StorageService._();

  String? _cachedPath;
  bool? _cachedValidation;

  /// 标准化路径，处理相对路径
  String _normalizePath(String inputPath) {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(inputPath)) {
      return path.normalize(inputPath);
    }

    // 如果是相对路径，需要转换为绝对路径
    // 对于 /Documents/text 这样的路径，需要基于用户主目录
    if (inputPath.startsWith('/Documents/') || inputPath.startsWith('Documents/')) {
      final homeDir = Platform.environment['HOME'] ?? '';
      if (homeDir.isNotEmpty) {
        return path.normalize(path.join(homeDir, 'Documents', inputPath.replaceFirst(RegExp(r'^/?Documents/'), '')));
      }
    }

    // 对于其他相对路径，基于当前工作目录
    return path.normalize(path.absolute(inputPath));
  }

  /// 获取当前存储路径
  Future<String?> getStoragePath() async {
    if (_cachedPath != null) {
      return _cachedPath;
    }

    final prefs = await SharedPreferences.getInstance();
    final savedPath = prefs.getString(_storagePathKey);

    if (savedPath != null && savedPath.isNotEmpty) {
      // 标准化保存的路径
      final normalizedPath = _normalizePath(savedPath);
      _cachedPath = normalizedPath;
      return normalizedPath;
    }

    // 如果没有设置路径，尝试获取默认路径
    try {
      final directory = await getApplicationDocumentsDirectory();
      final defaultPath = directory.path;
      await setStoragePath(defaultPath);
      return defaultPath;
    } catch (e) {
      print('获取默认存储路径失败: $e');
      return null;
    }
  }

  /// 设置存储路径
  Future<bool> setStoragePath(String inputPath) async {
    try {
      // 标准化路径
      final normalizedPath = _normalizePath(inputPath);

      final prefs = await SharedPreferences.getInstance();
      // 保存原始路径，但使用标准化路径进行缓存
      await prefs.setString(_storagePathKey, inputPath);
      _cachedPath = normalizedPath;
      _cachedValidation = null; // 清除验证缓存
      return true;
    } catch (e) {
      print('保存存储路径失败: $e');
      return false;
    }
  }

  /// 验证存储路径是否有效且有权限
  Future<bool> validateStoragePath([String? path]) async {
    final rawPath = path ?? await getStoragePath();
    if (rawPath == null || rawPath.isEmpty) {
      return false;
    }

    // 标准化路径
    final targetPath = _normalizePath(rawPath);

    // 如果路径相同且已经验证过，直接返回缓存结果
    if (_cachedPath == targetPath && _cachedValidation != null) {
      return _cachedValidation!;
    }

    try {
      final directory = Directory(targetPath);

      // 检查目录是否存在
      if (!await directory.exists()) {
        // 尝试创建目录
        await directory.create(recursive: true);
      }

      // 测试写入权限
      final testFile = File('${directory.path}/.test_write_permission');
      await testFile.writeAsString('test');
      await testFile.delete();

      // 测试读取权限
      final testDir = Directory('${directory.path}/.test_read_permission');
      await testDir.create();
      await testDir.delete();

      _cachedPath = targetPath;
      _cachedValidation = true;

      // 保存验证状态
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_storagePathValidatedKey, true);

      return true;
    } catch (e) {
      print('存储路径验证失败: $e');
      _cachedPath = targetPath;
      _cachedValidation = false;

      // 保存验证状态
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_storagePathValidatedKey, false);

      return false;
    }
  }

  /// 检查是否已经验证过存储路径
  Future<bool> isStoragePathValidated() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_storagePathValidatedKey) ?? false;
  }

  /// 清除存储路径设置
  Future<void> clearStoragePath() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storagePathKey);
    await prefs.remove(_storagePathValidatedKey);
    _cachedPath = null;
    _cachedValidation = null;
  }

  /// 选择新的存储路径
  Future<String?> selectStoragePath() async {
    try {
      String? selectedDirectory = await FilePicker.platform.getDirectoryPath();

      if (selectedDirectory != null) {
        // 标准化选择的路径
        final normalizedPath = _normalizePath(selectedDirectory);

        // 验证新选择的路径
        final isValid = await validateStoragePath(normalizedPath);
        if (isValid) {
          await setStoragePath(selectedDirectory); // 保存原始路径
          return normalizedPath; // 返回标准化路径
        } else {
          // 如果验证失败，提供更详细的错误信息和解决方案
          throw StoragePathException(
            '选择的路径没有写入权限',
            '请按照以下步骤操作：\n\n'
            '1. 在macOS系统偏好设置中，选择"安全性与隐私"\n'
            '2. 点击"隐私"标签页\n'
            '3. 在左侧列表中选择"文件和文件夹"\n'
            '4. 找到"Book Reader"应用\n'
            '5. 勾选"文件夹访问"权限\n'
            '6. 重新选择存储路径\n\n'
            '或者尝试选择其他文件夹，如：\n'
            '• 文档文件夹\n'
            '• 桌面文件夹\n'
            '• 用户主目录下的其他文件夹',
            normalizedPath,
          );
        }
      }

      return null;
    } catch (e) {
      print('选择存储路径失败: $e');
      rethrow;
    }
  }

  /// 获取存储路径的错误信息
  String getStoragePathError(String path) {
    if (path.isEmpty) {
      return '存储路径未设置';
    }

    final directory = Directory(path);
    if (!directory.existsSync()) {
      return '存储路径不存在: $path';
    }

    return '存储路径没有写入权限: $path';
  }

  /// 创建书籍存储目录
  Future<String> createBooksDirectory() async {
    final storagePath = await getStoragePath();
    if (storagePath == null) {
      throw Exception('存储路径未设置');
    }

    final booksDir = Directory('$storagePath/books');
    if (!await booksDir.exists()) {
      await booksDir.create(recursive: true);
    }

    return booksDir.path;
  }

  /// 创建缓存目录
  Future<String> createCacheDirectory() async {
    final storagePath = await getStoragePath();
    if (storagePath == null) {
      throw Exception('存储路径未设置');
    }

    final cacheDir = Directory('$storagePath/cache');
    if (!await cacheDir.exists()) {
      await cacheDir.create(recursive: true);
    }

    return cacheDir.path;
  }

  /// 获取路径调试信息
  Future<Map<String, String>> getPathDebugInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final savedPath = prefs.getString(_storagePathKey);
    final normalizedPath = savedPath != null ? _normalizePath(savedPath) : null;

    return {
      '原始保存路径': savedPath ?? '未设置',
      '标准化路径': normalizedPath ?? '未设置',
      '缓存路径': _cachedPath ?? '未缓存',
      '用户主目录': Platform.environment['HOME'] ?? '未获取到',
      '当前工作目录': Directory.current.path,
    };
  }
}
