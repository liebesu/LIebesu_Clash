#!/bin/bash

# LIebesu_Clash macOS 构建后处理脚本
# 确保应用正确注册到 macOS 系统并在 Launchpad 中显示

set -e

echo "🍎 LIebesu_Clash macOS 构建后处理"
echo "=================================="

# 获取构建输出目录
BUILD_DIR="${1:-src-tauri/target/release/bundle/macos}"
APP_NAME="LIebesu_Clash.app"
APP_PATH="$BUILD_DIR/$APP_NAME"

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到应用程序: $APP_PATH"
    exit 1
fi

echo "✅ 找到应用程序: $APP_PATH"

# 1. 确保应用有正确的权限
echo "🔐 设置应用权限..."
chmod -R 755 "$APP_PATH"
chmod +x "$APP_PATH/Contents/MacOS/liebesu-clash"

# 2. 移除隔离属性
echo "🧹 移除隔离属性..."
xattr -cr "$APP_PATH" 2>/dev/null || true

# 3. 重新签名应用（ad-hoc签名）
echo "✍️  重新签名应用..."
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
    echo "⚠️  重新签名失败，但继续处理..."
}

# 4. 验证签名
echo "🔍 验证签名..."
codesign --verify --verbose "$APP_PATH" 2>/dev/null && {
    echo "✅ 签名验证成功"
} || {
    echo "⚠️  签名验证失败，但应用可能仍然可以运行"
}

# 5. 确保 Info.plist 包含正确的元数据
echo "📝 检查应用元数据..."
INFO_PLIST="$APP_PATH/Contents/Info.plist"

# 检查并设置必要的键值
plutil -replace CFBundleDisplayName -string "LIebesu_Clash" "$INFO_PLIST" 2>/dev/null || true
plutil -replace CFBundleName -string "LIebesu_Clash" "$INFO_PLIST" 2>/dev/null || true
plutil -replace CFBundleIdentifier -string "io.github.liebesu.clash" "$INFO_PLIST" 2>/dev/null || true
plutil -replace CFBundleVersion -string "2.4.3" "$INFO_PLIST" 2>/dev/null || true
plutil -replace CFBundleShortVersionString -string "2.4.3" "$INFO_PLIST" 2>/dev/null || true

# 6. 确保应用图标正确设置
echo "🎨 检查应用图标..."
ICON_FILE="$APP_PATH/Contents/Resources/icon.icns"
if [ -f "$ICON_FILE" ]; then
    echo "✅ 应用图标存在"
else
    echo "⚠️  应用图标缺失，这可能导致 Launchpad 显示问题"
fi

# 7. 创建应用程序支持目录
echo "📁 创建应用程序支持目录..."
APP_SUPPORT_DIR="$HOME/Library/Application Support/io.github.liebesu.clash"
mkdir -p "$APP_SUPPORT_DIR" 2>/dev/null || true

# 8. 预注册应用程序到 Launch Services
echo "📝 预注册应用程序..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH" 2>/dev/null || {
    echo "⚠️  预注册失败，但应用可能仍然可以正常工作"
}

# 9. 创建 DMG 后处理
if [ -f "$BUILD_DIR"/*.dmg ]; then
    echo "💿 处理 DMG 文件..."
    DMG_FILE=$(ls "$BUILD_DIR"/*.dmg | head -1)
    echo "✅ DMG 文件: $DMG_FILE"
    
    # 确保 DMG 文件有正确的权限
    chmod 644 "$DMG_FILE"
fi

echo ""
echo "🎉 macOS 构建后处理完成！"
echo ""
echo "📱 安装说明："
echo "1. 双击 DMG 文件"
echo "2. 将 LIebesu_Clash.app 拖拽到 Applications 文件夹"
echo "3. 等待几秒钟让系统完成索引"
echo "4. 在 Launchpad 中查找 LIebesu_Clash"
echo ""
echo "🔧 如果 Launchpad 中仍然看不到应用："
echo "1. 等待 2-3 分钟让系统完成索引"
echo "2. 注销并重新登录"
echo "3. 或者运行: defaults write com.apple.dock ResetLaunchPad -bool true && killall Dock"
echo ""
echo "✅ 应用程序已准备就绪！"
