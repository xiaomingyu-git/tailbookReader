import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';

class PermissionGuidePage extends StatelessWidget {
  final String? selectedPath;
  final VoidCallback? onRetry;
  final VoidCallback? onSkip;

  const PermissionGuidePage({
    super.key,
    this.selectedPath,
    this.onRetry,
    this.onSkip,
  });

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

              // 图标和标题
              const Icon(
                Icons.security,
                size: 80,
                color: Colors.orange,
              ),
              const SizedBox(height: 24),

              const Text(
                '需要文件访问权限',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),

              Text(
                '为了存储您的电子书，Book Reader 需要访问您选择的文件夹。\n请按照以下步骤授予权限：',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),

              // 权限申请步骤
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      _buildStepCard(
                        step: 1,
                        title: '打开系统偏好设置',
                        description: '点击苹果菜单 → 系统偏好设置',
                        icon: Icons.settings,
                      ),
                      const SizedBox(height: 16),

                      _buildStepCard(
                        step: 2,
                        title: '选择安全性与隐私',
                        description: '在系统偏好设置中找到并点击"安全性与隐私"',
                        icon: Icons.security,
                      ),
                      const SizedBox(height: 16),

                      _buildStepCard(
                        step: 3,
                        title: '进入隐私设置',
                        description: '点击"隐私"标签页',
                        icon: Icons.privacy_tip,
                      ),
                      const SizedBox(height: 16),

                      _buildStepCard(
                        step: 4,
                        title: '选择文件和文件夹',
                        description: '在左侧列表中选择"文件和文件夹"',
                        icon: Icons.folder,
                      ),
                      const SizedBox(height: 16),

                      _buildStepCard(
                        step: 5,
                        title: '授权 Book Reader',
                        description: '找到"Book Reader"应用并勾选"文件夹访问"权限',
                        icon: Icons.check_circle,
                        isHighlighted: true,
                      ),
                      const SizedBox(height: 24),

                      // 选中的路径显示
                      if (selectedPath != null) ...[
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.blue[50],
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.blue[200]!),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.info_outline, color: Colors.blue),
                                  SizedBox(width: 8),
                                  Text(
                                    '您选择的路径：',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              SelectableText(
                                selectedPath!,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],

                      // 提示信息
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.amber[50],
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.amber[200]!),
                        ),
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.lightbulb_outline, color: Colors.amber),
                                SizedBox(width: 8),
                                Text(
                                  '重要提示',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.amber,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 8),
                            Text(
                              '• 设置完权限后，请返回应用并重新选择存储路径\n'
                              '• 建议选择文档文件夹或桌面文件夹\n'
                              '• 如果仍然无法访问，请尝试选择其他文件夹',
                              style: TextStyle(color: Colors.amber),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 按钮区域
              Column(
                children: [
                  // 打开系统偏好设置按钮
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton.icon(
                      onPressed: () => _openSystemPreferences(),
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('打开系统偏好设置'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 重试按钮
                  if (onRetry != null)
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh),
                        label: const Text('设置完成后重试'),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),

                  if (onRetry != null) const SizedBox(height: 16),

                  // 跳过按钮
                  if (onSkip != null)
                    TextButton(
                      onPressed: onSkip,
                      child: const Text('稍后设置'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepCard({
    required int step,
    required String title,
    required String description,
    required IconData icon,
    bool isHighlighted = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isHighlighted ? Colors.green[50] : Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isHighlighted ? Colors.green[200]! : Colors.grey[200]!,
          width: isHighlighted ? 2 : 1,
        ),
      ),
      child: Row(
        children: [
          // 步骤编号
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isHighlighted ? Colors.green : Colors.blue,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                step.toString(),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),

          // 图标
          Icon(
            icon,
            color: isHighlighted ? Colors.green : Colors.blue,
            size: 24,
          ),
          const SizedBox(width: 12),

          // 内容
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: isHighlighted ? Colors.green[700] : Colors.grey[800],
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: TextStyle(
                    color: isHighlighted ? Colors.green[600] : Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _openSystemPreferences() {
    // 尝试打开macOS系统偏好设置
    try {
      Process.run('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Files']);
    } catch (e) {
      // 如果无法直接打开，显示手动操作提示
      // 这里可以添加一个对话框提示用户手动打开
      print('无法打开系统偏好设置: $e');
    }
  }
}
