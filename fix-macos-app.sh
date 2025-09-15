#!/bin/bash

# macOS应用修复脚本 - 让个人编译版本像官方一样运行
# 用法: ./fix-macos-app.sh [应用路径]

set -e

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
    echo "=== 查找 Clash Verge 应用 ==="
    # 尝试在常见位置找到应用
    POSSIBLE_PATHS=(
        "/Applications/Clash Verge.app"
        "$(find /Applications -name "*Clash*" -name "*.app" 2>/dev/null | head -1)"
        "$(find ~/Downloads -name "*Clash*" -name "*.app" 2>/dev/null | head -1)"
        "$(find ~/Desktop -name "*Clash*" -name "*.app" 2>/dev/null | head -1)"
    )
    
    for path in "${POSSIBLE_PATHS[@]}"; do
        if [ -d "$path" ]; then
            APP_PATH="$path"
            break
        fi
    done
fi

if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到 Clash Verge 应用"
    echo "请手动指定应用路径: ./fix-macos-app.sh '/path/to/Clash Verge.app'"
    exit 1
fi

echo "=== 修复 macOS 应用: $APP_PATH ==="

# 1. 移除隔离属性
echo "🔧 移除隔离属性..."
sudo xattr -cr "$APP_PATH" 2>/dev/null || true

# 2. 重新进行ad-hoc签名
echo "🔧 重新签名应用..."
sudo codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || true

# 3. 验证签名状态
echo "🔍 验证签名状态:"
codesign --verify --verbose "$APP_PATH" 2>/dev/null || echo "签名验证完成"

# 4. 检查权限
echo "🔍 检查应用权限:"
ls -la "$APP_PATH" | head -5

echo ""
echo "✅ 修复完成！现在应该可以正常启动 Clash Verge 了"
echo "💡 如果仍有问题，请在终端运行:"
echo "   open '$APP_PATH'"
