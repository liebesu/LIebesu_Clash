#!/bin/bash

# LIebesu_Clash Linux编译测试脚本
# 使用方法: 将此脚本和项目代码上传到Linux主机，然后运行此脚本

set -e  # 遇到错误时退出

echo "🚀 开始 LIebesu_Clash Linux 编译测试"
echo "=================================="

# 检查系统信息
echo "📋 系统信息:"
uname -a
echo

# 检查必要的工具
echo "🔍 检查必要工具..."

# 检查 Git
if ! command -v git &> /dev/null; then
    echo "❌ Git 未安装，请先安装 Git"
    exit 1
fi
echo "✅ Git: $(git --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请安装 Node.js 18+ 版本:"
    echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 安装 pnpm..."
    npm install -g pnpm
fi
echo "✅ pnpm: $(pnpm --version)"

# 检查 Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust 未安装"
    echo "请安装 Rust:"
    echo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "source ~/.cargo/env"
    exit 1
fi
echo "✅ Rust: $(rustc --version)"
echo "✅ Cargo: $(cargo --version)"

# 检查必要的系统依赖 (Ubuntu/Debian)
echo "📦 检查系统依赖..."
if command -v apt &> /dev/null; then
    echo "检测到 Ubuntu/Debian 系统"
    
    # 检查必要的库
    MISSING_DEPS=()
    
    if ! dpkg -l | grep -q libwebkit2gtk-4.0-dev; then
        MISSING_DEPS+=("libwebkit2gtk-4.0-dev")
    fi
    
    if ! dpkg -l | grep -q build-essential; then
        MISSING_DEPS+=("build-essential")
    fi
    
    if ! dpkg -l | grep -q curl; then
        MISSING_DEPS+=("curl")
    fi
    
    if ! dpkg -l | grep -q wget; then
        MISSING_DEPS+=("wget")
    fi
    
    if ! dpkg -l | grep -q libssl-dev; then
        MISSING_DEPS+=("libssl-dev")
    fi
    
    if ! dpkg -l | grep -q libgtk-3-dev; then
        MISSING_DEPS+=("libgtk-3-dev")
    fi
    
    if ! dpkg -l | grep -q libayatana-appindicator3-dev; then
        MISSING_DEPS+=("libayatana-appindicator3-dev")
    fi
    
    if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
        echo "❌ 缺少以下系统依赖:"
        printf '%s\n' "${MISSING_DEPS[@]}"
        echo
        echo "请运行以下命令安装:"
        echo "sudo apt update"
        echo "sudo apt install ${MISSING_DEPS[*]}"
        exit 1
    fi
    
    echo "✅ 所有系统依赖都已安装"
fi

echo
echo "🏗️  开始编译..."
echo "=================="

# 进入项目目录
if [ ! -f "package.json" ]; then
    echo "❌ 未找到 package.json，请确保在项目根目录运行此脚本"
    exit 1
fi

# 安装前端依赖
echo "📦 安装前端依赖..."
pnpm install

# 编译前端
echo "🔨 编译前端..."
pnpm run web:build

# 编译 Tauri (只编译，不打包)
echo "🦀 编译 Rust 后端..."
cd src-tauri
cargo check --release

echo
echo "🎯 测试特定功能编译..."
echo "========================"

# 测试全局测速功能编译
echo "🧪 测试全局测速功能..."
cargo check --release --bin liebesu-clash 2>&1 | grep -E "(error|warning).*global_speed_test" || echo "✅ 全局测速功能编译通过"

# 测试备份恢复功能编译
echo "🧪 测试备份恢复功能..."
cargo check --release --bin liebesu-clash 2>&1 | grep -E "(error|warning).*backup_restore" || echo "✅ 备份恢复功能编译通过"

echo
echo "🏁 编译测试完成!"
echo "================"

echo "如果没有错误信息，说明所有修复都有效。"
echo "如果要进行完整构建，请运行:"
echo "pnpm tauri build"

echo
echo "📊 编译统计:"
echo "- Rust 依赖数量: $(cargo tree --depth 0 | wc -l)"
echo "- 前端依赖数量: $(ls node_modules | wc -l)"

echo
echo "🎉 测试完成！"
