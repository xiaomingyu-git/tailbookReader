import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/storage_service.dart';
import 'permission_guide_page.dart';
import 'dart:io';

class StorageSetupPage extends StatefulWidget {
  const StorageSetupPage({super.key});

  @override
  State<StorageSetupPage> createState() => _StorageSetupPageState();
}

class _StorageSetupPageState extends State<StorageSetupPage> {
  final StorageService _storageService = StorageService.instance;
  bool _isLoading = false;
  String? _currentPath;
  String? _errorMessage;
  bool _isValidating = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentPath();
  }

  Future<void> _loadCurrentPath() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final path = await _storageService.getStoragePath();
      setState(() {
        _currentPath = path;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = '加载存储路径失败: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _selectStoragePath() async {
    setState(() {
      _isValidating = true;
      _errorMessage = null;
    });

    try {
      final selectedPath = await _storageService.selectStoragePath();
      if (selectedPath != null) {
        setState(() {
          _currentPath = selectedPath;
          _errorMessage = null;
        });

        // 显示成功消息
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('存储路径设置成功: $selectedPath'),
              backgroundColor: Colors.green,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }
    } catch (e) {
      setState(() {
        if (e is StoragePathException) {
          _errorMessage = e.message;
          _showPermissionGuideDialog(e);
        } else {
          _errorMessage = e.toString();
        }
      });
    } finally {
      setState(() {
        _isValidating = false;
      });
    }
  }

  Future<void> _validateCurrentPath() async {
    if (_currentPath == null) return;

    setState(() {
      _isValidating = true;
      _errorMessage = null;
    });

    try {
      final isValid = await _storageService.validateStoragePath(_currentPath);
      if (isValid) {
        setState(() {
          _errorMessage = null;
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('存储路径验证成功！'),
              backgroundColor: Colors.green,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      } else {
        setState(() {
          _errorMessage = _storageService.getStoragePathError(_currentPath!);
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = '验证失败: $e';
      });
    } finally {
      setState(() {
        _isValidating = false;
      });
    }
  }

  void _proceedToApp() {
    Navigator.of(context).pushReplacementNamed('/home');
  }

  void _showPermissionGuideDialog(StoragePathException exception) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => PermissionGuidePage(
          selectedPath: exception.path,
          onRetry: () {
            Navigator.of(context).pop();
            _selectStoragePath();
          },
          onSkip: () {
            Navigator.of(context).pop();
          },
        ),
      ),
    );
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),

              // 标题和图标
              const Icon(
                Icons.folder_open,
                size: 80,
                color: Colors.deepPurple,
              ),
              const SizedBox(height: 24),

              const Text(
                '设置存储路径',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),

              const Text(
                '请选择一个文件夹来存储您的电子书和缓存文件。\n这个路径需要有读写权限。',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),

              // 当前路径显示
              if (_isLoading)
                const Center(
                  child: CircularProgressIndicator(),
                )
              else if (_currentPath != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _errorMessage == null ? Colors.green : Colors.red,
                      width: 2,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _errorMessage == null ? Icons.check_circle : Icons.error,
                            color: _errorMessage == null ? Colors.green : Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            '当前存储路径:',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        _currentPath!,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // 错误信息
                if (_errorMessage != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red[200]!),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline, color: Colors.red[700]),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: TextStyle(color: Colors.red[700]),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],

              const Spacer(),

              // 按钮区域
              Column(
                children: [
                  // 选择路径按钮
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton.icon(
                      onPressed: _isValidating ? null : _selectStoragePath,
                      icon: _isValidating
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.folder_open),
                      label: Text(_isValidating ? '验证中...' : '选择存储路径'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 验证当前路径按钮
                  if (_currentPath != null)
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: _isValidating ? null : _validateCurrentPath,
                        icon: _isValidating
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.verified_user),
                        label: Text(_isValidating ? '验证中...' : '验证当前路径'),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),

                  // 继续按钮
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton.icon(
                      onPressed: _currentPath != null && _errorMessage == null
                          ? _proceedToApp
                          : null,
                      icon: const Icon(Icons.arrow_forward),
                      label: const Text('继续使用应用'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              // 帮助信息
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info_outline, color: Colors.blue[700]),
                        const SizedBox(width: 8),
                        Text(
                          '帮助信息',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue[700],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '• 建议选择应用专用文件夹或文档文件夹\n'
                      '• 确保选择的文件夹有读写权限\n'
                      '• 存储路径用于保存导入的电子书和缓存文件\n'
                      '• 可以随时在设置中更改存储路径',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.blue[700],
                      ),
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
