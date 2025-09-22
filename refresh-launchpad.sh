#!/bin/bash

# LIebesu_Clash 启动台刷新脚本
# 专门用于解决启动台不显示应用图标的问题

echo "🔄 启动台刷新脚本"
echo "=================="

APP_NAME="LIebesu_Clash.app"
APP_PATH="/Applications/$APP_NAME"

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到应用程序: $APP_PATH"
    echo "请确保已将 LIebesu_Clash.app 拖拽到 Applications 文件夹"
    exit 1
fi

echo "✅ 找到应用程序: $APP_PATH"

# 方法1: 重置启动台
echo "🔄 方法1: 重置启动台..."
defaults write com.apple.dock ResetLaunchPad -bool true

# 方法2: 清除启动台数据库
echo "🔄 方法2: 清除启动台数据库..."
# 用户级别的数据库
rm -rf ~/Library/Application\ Support/Dock/*.db 2>/dev/null || true

# 系统级别的数据库（需要sudo权限）
echo "🔐 清理系统级启动台数据库（可能需要密码）..."
sudo rm -rf /private/var/folders/*/0/com.apple.dock.launchpad/db/db 2>/dev/null || {
    echo "⚠️  无法清理系统级数据库，但用户级清理已完成"
}

# 方法3: 重启Dock
echo "🔄 方法3: 重启Dock进程..."
killall Dock 2>/dev/null || {
    echo "⚠️  无法重启Dock，请手动重启"
}

# 等待Dock重启
echo "⏳ 等待Dock重启..."
sleep 5

# 方法4: 触摸应用以更新修改时间
echo "🔄 方法4: 更新应用时间戳..."
touch "$APP_PATH"

# 方法5: 重新注册应用
echo "🔄 方法5: 重新注册应用..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH" 2>/dev/null || {
    echo "⚠️  lsregister 命令失败，但这是正常的"
}

echo ""
echo "✅ 启动台刷新完成！"
echo ""
echo "📋 如果启动台中仍然看不到应用："
echo "1. 等待2-3分钟让系统完成索引"
echo "2. 打开启动台并向右滑动查看其他页面"
echo "3. 在启动台搜索框中输入 'LIebesu' 或 'Clash'"
echo "4. 注销并重新登录"
echo "5. 重启电脑"
echo "6. 直接从 /Applications 文件夹双击启动应用"
echo ""
echo "🔍 你也可以在Finder中按 Cmd+Space，然后搜索 'LIebesu_Clash'"
