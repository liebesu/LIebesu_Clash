#!/bin/bash

# LIebesu_Clash macOS 应用修复脚本
# 此脚本用于修复 macOS 上的应用安装和启动问题

set -e

APP_NAME="LIebesu_Clash.app"
APP_PATH="/Applications/$APP_NAME"

echo "🔧 LIebesu_Clash macOS 修复脚本"
echo "================================"

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到应用程序: $APP_PATH"
    echo "请先安装 LIebesu_Clash.dmg"
    exit 1
fi

echo "✅ 找到应用程序: $APP_PATH"

# 移除隔离属性
echo "🧹 移除隔离属性..."
sudo xattr -cr "$APP_PATH" 2>/dev/null || {
    echo "⚠️  需要管理员权限来移除隔离属性"
    echo "请输入密码："
    sudo xattr -cr "$APP_PATH"
}

# 重新签名应用
echo "✍️  重新签名应用..."
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
    echo "⚠️  重新签名失败，但应用可能仍然可以运行"
}

# 验证签名
echo "🔍 验证签名..."
codesign --verify --verbose "$APP_PATH" 2>/dev/null && {
    echo "✅ 签名验证成功"
} || {
    echo "⚠️  签名验证失败，但应用可能仍然可以运行"
}

# 设置正确的权限
echo "🔐 设置应用权限..."
chmod -R 755 "$APP_PATH"

# 尝试启动应用
echo "🚀 尝试启动应用..."
open "$APP_PATH" && {
    echo "✅ 应用启动成功！"
    echo ""
    echo "如果应用仍然无法正常运行，请尝试以下步骤："
    echo "1. 打开 系统偏好设置 > 安全性与隐私 > 通用"
    echo "2. 点击 '仍要打开' 按钮（如果看到 LIebesu_Clash 相关提示）"
    echo "3. 或者在终端中运行: sudo spctl --master-disable"
    echo "   （这会禁用 Gatekeeper，请谨慎使用）"
} || {
    echo "❌ 应用启动失败"
    echo ""
    echo "请尝试以下解决方案："
    echo "1. 打开 系统偏好设置 > 安全性与隐私 > 通用"
    echo "2. 允许从任何来源下载的应用程序运行"
    echo "3. 或者在终端中运行:"
    echo "   sudo spctl --add '$APP_PATH'"
    echo "   sudo spctl --enable --label 'LIebesu_Clash'"
}

echo ""
echo "🔧 修复脚本执行完成"