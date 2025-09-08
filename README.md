# Book Reader

一个基于 Flutter 开发的跨平台小说阅读应用，支持 Windows、macOS 和 Android 平台。

## 功能特性

- 📚 **书架管理** - 导入和管理你的电子书
- 📖 **阅读体验** - 舒适的阅读界面，支持多种字体和主题
- ⚙️ **个性化设置** - 自定义阅读偏好和外观
- 🌙 **深色模式** - 支持明暗主题切换
- 📱 **跨平台** - 支持 Windows、macOS 和 Android

## 技术栈

- **Flutter** - 跨平台 UI 框架
- **Material Design 3** - 现代化设计语言
- **Dart** - 编程语言

## 项目结构

```
lib/
├── main.dart                 # 应用入口
├── models/                   # 数据模型
│   └── book.dart            # 书籍模型
├── pages/                   # 页面
│   ├── home_page.dart       # 主页面
│   ├── bookshelf_page.dart  # 书架页面
│   ├── reading_page.dart    # 阅读页面
│   └── settings_page.dart   # 设置页面
├── widgets/                 # 自定义组件
├── services/                # 服务层
└── utils/                   # 工具类
```

## 安装和运行

### 前提条件

- Flutter SDK (3.0.0 或更高版本)
- Dart SDK
- 对应平台的开发环境

### 安装依赖

```bash
flutter pub get
```

### 运行应用

```bash
# 运行在 Android 设备/模拟器
flutter run

# 运行在 Windows
flutter run -d windows

# 运行在 macOS
flutter run -d macos
```

### 构建发布版本

```bash
# Android APK
flutter build apk

# Windows 可执行文件
flutter build windows

# macOS 应用
flutter build macos
```

## 主要功能

### 书架页面
- 查看已导入的书籍
- 导入新的电子书文件
- 删除不需要的书籍
- 显示阅读进度

### 阅读页面
- 全屏阅读模式
- 字体大小和行间距调节
- 背景颜色和文字颜色自定义
- 章节导航
- 阅读进度记录

### 设置页面
- 深色/浅色主题切换
- 默认字体设置
- 自动滚动配置
- 屏幕常亮设置
- 缓存管理

## 支持的格式

- TXT 文本文件
- EPUB 电子书
- PDF 文档

## 开发计划

- [ ] 支持更多电子书格式
- [ ] 添加书签功能
- [ ] 实现阅读统计
- [ ] 添加云同步功能
- [ ] 支持听书功能

## 贡献

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。

## 许可证

MIT License
