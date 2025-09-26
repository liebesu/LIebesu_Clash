# 🖥️ LIebesu_Clash Windows 11 本地编译指南

## 📋 概述

本指南提供了在 Windows 11 系统上编译 LIebesu_Clash 项目的完整解决方案，包含自动化脚本和详细的手动步骤说明。

## 🚀 快速开始（推荐）

### 方案一：全自动安装和编译

```bash
# 1. 下载项目
git clone https://github.com/liebesu/LIebesu_Clash.git
cd LIebesu_Clash

# 2. 一键安装开发环境（如果是新系统）
setup_dev_environment_windows11.bat

# 3. 一键编译
build_windows11.bat
```

### 方案二：快速编译（已配置环境）

```bash
# 如果开发环境已配置好，使用快速编译
build_quick_windows11.bat
```

## 📦 提供的批处理脚本

### 1. `setup_dev_environment_windows11.bat`
**功能**：自动安装所有必需的开发工具
- 🛠️ **自动检测和安装**：Node.js, Rust, Git, Visual Studio Build Tools
- 📦 **包管理器**：自动安装 pnpm
- ⚙️ **环境配置**：自动配置路径和环境变量
- 🔍 **验证安装**：完成后验证所有工具是否正确安装

**使用方法**：
```bash
# 以管理员身份运行
setup_dev_environment_windows11.bat
```

### 2. `build_windows11.bat`
**功能**：完整的编译流程
- 🔍 **环境检查**：验证所有必需工具
- 📦 **依赖安装**：自动安装项目依赖
- ⚙️ **环境配置**：设置编译环境变量
- 🛠️ **项目编译**：执行完整编译流程
- 📝 **详细日志**：记录完整的编译过程

**特性**：
- ✅ 全面的错误处理和恢复机制
- 📊 详细的编译统计和结果展示
- 🔧 自动重试机制（标准编译失败时尝试快速编译）
- 📁 自动整理编译产物到 `dist` 目录

### 3. `build_quick_windows11.bat`
**功能**：简化的快速编译
- ⚡ **快速模式**：适用于已配置好环境的开发者
- 🎯 **精简流程**：只执行必要的编译步骤
- ⏱️ **省时高效**：5-15分钟完成编译

## 🛠️ 系统要求

### 最低要求
- **操作系统**：Windows 10 版本 1903 或 Windows 11
- **内存**：8 GB RAM（推荐 16 GB）
- **存储空间**：至少 10 GB 可用空间
- **网络**：稳定的互联网连接（下载依赖）

### 必需软件（脚本会自动安装）
- **Node.js**：v18.0.0 或更高版本（推荐 LTS）
- **Rust**：最新稳定版
- **Git**：2.30.0 或更高版本
- **Visual Studio Build Tools 2022**：包含 MSVC 编译器
- **pnpm**：最新版本

## 📝 手动安装步骤（可选）

如果自动脚本无法使用，可以按以下步骤手动安装：

### 1. 安装 Git
```bash
# 下载并安装 Git
https://git-scm.com/download/win
```

### 2. 安装 Node.js
```bash
# 下载并安装 Node.js LTS
https://nodejs.org/
```

### 3. 安装 pnpm
```bash
npm install -g pnpm
```

### 4. 安装 Rust
```bash
# 下载并安装 Rust
https://rustup.rs/

# 添加 Windows MSVC 目标
rustup target add x86_64-pc-windows-msvc
```

### 5. 安装 Visual Studio Build Tools
```bash
# 下载并安装 Visual Studio Build Tools 2022
https://visualstudio.microsoft.com/visual-cpp-build-tools/

# 确保选择 "C++ 生成工具" 工作负载
```

### 6. 手动编译
```bash
# 设置环境变量
set NODE_OPTIONS=--max_old_space_size=8192
set RUST_BACKTRACE=1

# 安装依赖
pnpm install

# 预构建
pnpm run prebuild x86_64-pc-windows-msvc

# 编译
pnpm run build
```

## 📊 编译输出

### 编译产物位置
```
dist/                           # 最终编译产物
├── LIebesu_Clash_setup.exe    # NSIS 安装包
└── LIebesu_Clash.msi          # MSI 安装包（如果启用）

src-tauri/target/release/bundle/  # 原始编译输出
├── nsis/                       # NSIS 安装包
├── msi/                        # MSI 安装包
└── appimage/                   # AppImage（Linux）
```

### 日志文件
```
build_log.txt                  # 完整编译日志
build_error.txt               # 错误日志
logs/                         # 运行时日志目录
├── app.log                   # 应用日志
├── speed_test.log           # 测速日志
└── speed_test_debug.log     # 测速调试日志
```

## 🔧 常见问题解决

### 编译失败
```bash
# 1. 清理并重新安装依赖
rmdir /s /q node_modules
pnpm install

# 2. 清理 Rust 缓存
cargo clean

# 3. 重新运行编译脚本
build_windows11.bat
```

### 权限问题
```bash
# 以管理员身份运行命令提示符
# 右键点击"命令提示符" -> "以管理员身份运行"
```

### 网络问题
```bash
# 设置 npm 镜像（中国用户）
npm config set registry https://registry.npmmirror.com/
pnpm config set registry https://registry.npmmirror.com/

# 设置 Rust 镜像
set RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
set RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
```

### Visual Studio Build Tools 问题
```bash
# 手动设置 MSVC 环境
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

# 或者
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
```

## 📋 编译选项

### 快速编译模式
```bash
# 使用快速编译配置（减少优化，加快编译速度）
pnpm run build:fast
```

### 调试模式
```bash
# 编译调试版本
pnpm run dev
```

### 自定义配置
编辑 `src-tauri/tauri.conf.json` 来自定义编译选项：
```json
{
  "build": {
    "beforeBuildCommand": "pnpm run web:build",
    "beforeDevCommand": "pnpm run web:dev",
    "devPath": "http://localhost:3000",
    "distDir": "../dist"
  }
}
```

## 🎯 性能优化建议

### 编译性能
- 💾 **增加内存**：推荐 16GB+ RAM
- 🗂️ **SSD 存储**：使用 SSD 硬盘
- 🔧 **多核 CPU**：Rust 编译可以利用多核
- 🌐 **稳定网络**：确保依赖下载不中断

### 编译时间预估
- **首次编译**：20-45 分钟
- **增量编译**：3-10 分钟
- **快速模式**：5-15 分钟

## 📞 技术支持

### 获取帮助
1. **查看日志**：`build_log.txt` 和 `build_error.txt`
2. **GitHub Issues**：https://github.com/liebesu/LIebesu_Clash/issues
3. **文档参考**：项目根目录下的各种 README 文件

### 报告问题时请提供
- Windows 版本信息
- 完整的错误日志
- 编译命令和参数
- 系统配置信息

---

**📅 最后更新**：2025年9月  
**🏷️ 版本**：Windows 11 增强版  
**✅ 测试状态**：已在 Windows 11 上验证通过
