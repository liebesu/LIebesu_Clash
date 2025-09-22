#!/bin/bash

# 快速 Rust 编译检查脚本 - 只检查语法和类型错误
# 不需要完整编译，速度很快

set -e

echo "🦀 快速 Rust 编译检查"
echo "===================="

cd src-tauri

echo "🔍 检查基本语法..."
cargo check 2>&1 | head -50

echo
echo "🎯 检查特定模块..."

# 检查全局测速模块
echo "📡 检查全局测速模块..."
if cargo check --lib 2>&1 | grep -i "global_speed_test" | grep -i error; then
    echo "❌ 全局测速模块有错误"
    cargo check --lib 2>&1 | grep -A5 -B5 "global_speed_test"
else
    echo "✅ 全局测速模块编译通过"
fi

echo
# 检查备份恢复模块  
echo "💾 检查备份恢复模块..."
if cargo check --lib 2>&1 | grep -i "backup_restore" | grep -i error; then
    echo "❌ 备份恢复模块有错误"
    cargo check --lib 2>&1 | grep -A5 -B5 "backup_restore"
else
    echo "✅ 备份恢复模块编译通过"
fi

echo
echo "📋 依赖检查..."
echo "检查 fastrand 依赖: $(grep fastrand Cargo.toml || echo '未找到')"
echo "检查 futures-util 依赖: $(grep futures-util Cargo.toml || echo '未找到')"

echo
echo "🏁 快速检查完成!"

# 如果没有致命错误，显示成功信息
if cargo check --quiet 2>/dev/null; then
    echo "🎉 所有模块编译检查通过！"
    echo "可以进行完整构建了。"
else
    echo "⚠️  仍有编译错误，请查看上面的详细信息。"
fi
