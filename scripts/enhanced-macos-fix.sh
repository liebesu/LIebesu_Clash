#!/bin/bash

# LIebesu_Clash Enhanced macOS Fix Script
# 增强版 macOS 应用启动修复脚本

set -e

echo "🍎 LIebesu_Clash Enhanced macOS Fix Script"
echo "============================================="

# 应用程序路径检测
APP_PATHS=(
    "/Applications/LIebesu_Clash.app"
    "$HOME/Applications/LIebesu_Clash.app"
    "./LIebesu_Clash.app"
    "../LIebesu_Clash.app"
)

APP_PATH=""
for path in "${APP_PATHS[@]}"; do
    if [ -d "$path" ]; then
        APP_PATH="$path"
        echo "✅ 找到应用程序: $APP_PATH"
        break
    fi
done

if [ -z "$APP_PATH" ]; then
    echo "❌ 未找到 LIebesu_Clash.app"
    echo "请确保应用程序在以下位置之一："
    printf '%s\n' "${APP_PATHS[@]}"
    exit 1
fi

# 创建修复函数
fix_permissions() {
    echo "🔐 修复文件权限..."
    chmod -R 755 "$APP_PATH"
    
    # 确保可执行文件有执行权限
    if [ -d "$APP_PATH/Contents/MacOS" ]; then
        chmod +x "$APP_PATH/Contents/MacOS/"* 2>/dev/null || true
    fi
    
    echo "✅ 权限修复完成"
}

remove_quarantine() {
    echo "🧹 移除隔离属性..."
    
    # 移除应用程序的隔离属性
    xattr -cr "$APP_PATH" 2>/dev/null || {
        echo "⚠️  需要管理员权限来移除隔离属性"
        sudo xattr -cr "$APP_PATH"
    }
    
    # 检查是否还有隔离属性
    if xattr -l "$APP_PATH" | grep -q "com.apple.quarantine"; then
        echo "⚠️  隔离属性仍然存在，尝试强制移除..."
        sudo xattr -d com.apple.quarantine "$APP_PATH" 2>/dev/null || true
    fi
    
    echo "✅ 隔离属性移除完成"
}

resign_app() {
    echo "✍️  重新签名应用程序..."
    
    # 尝试使用开发者证书签名（如果可用）
    if security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
        echo "发现开发者证书，尝试使用真实签名..."
        IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | awk '{print $2}')
        codesign --force --deep --sign "$IDENTITY" "$APP_PATH" 2>/dev/null || {
            echo "真实签名失败，使用ad-hoc签名..."
            codesign --force --deep --sign - "$APP_PATH"
        }
    else
        echo "使用ad-hoc签名..."
        codesign --force --deep --sign - "$APP_PATH"
    fi
    
    echo "✅ 应用程序签名完成"
}

verify_signature() {
    echo "🔍 验证签名..."
    
    if codesign --verify --verbose=2 "$APP_PATH" 2>/dev/null; then
        echo "✅ 签名验证成功"
        return 0
    else
        echo "⚠️  签名验证失败，但应用程序可能仍然可以运行"
        return 1
    fi
}

fix_info_plist() {
    echo "📝 检查和修复 Info.plist..."
    
    INFO_PLIST="$APP_PATH/Contents/Info.plist"
    if [ ! -f "$INFO_PLIST" ]; then
        echo "❌ 未找到 Info.plist 文件"
        return 1
    fi
    
    # 对齐 CFBundleExecutable 到实际二进制
    ACTUAL_EXEC="$(basename "$(ls \"$APP_PATH/Contents/MacOS\" | head -1)")"
    echo "实际二进制: $ACTUAL_EXEC"
    plutil -replace CFBundleExecutable -string "$ACTUAL_EXEC" "$INFO_PLIST" 2>/dev/null || true
    
    # 启用高分辨率（保持，不改最低系统版本）
    plutil -replace NSHighResolutionCapable -bool true "$INFO_PLIST" 2>/dev/null || true
    
    echo "✅ Info.plist 检查完成"
}

register_launch_services() {
    echo "📱 注册到 Launch Services..."
    
    # 强制注册应用程序
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"
    
    # 重建 Launch Services 数据库
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
    
    echo "✅ Launch Services 注册完成"
}

refresh_ui() {
    echo "🔄 刷新系统界面..."
    
    # 重启 Dock
    killall Dock 2>/dev/null || true
    
    # 清理 Launchpad 缓存
    defaults write com.apple.dock ResetLaunchPad -bool true
    
    # 清理 Launchpad 数据库
    rm -rf ~/Library/Application\ Support/Dock/*.db 2>/dev/null || true
    
    # 强制刷新 Finder
    killall Finder 2>/dev/null || true
    
    echo "✅ 界面刷新完成"
}

test_app_launch() {
    echo "🚀 测试应用程序启动..."
    
    # 尝试启动应用程序
    if open "$APP_PATH"; then
        echo "✅ 应用程序启动成功！"
        return 0
    else
        echo "❌ 应用程序启动失败"
        return 1
    fi
}

create_permanent_fix() {
    echo "💾 创建永久修复脚本..."
    
    SCRIPT_PATH="$HOME/Desktop/LIebesu_Clash_Permanent_Fix.sh"
    
    cat > "$SCRIPT_PATH" << 'EOF'
#!/bin/bash
# LIebesu_Clash 永久修复脚本

APP_PATH="/Applications/LIebesu_Clash.app"

if [ -d "$APP_PATH" ]; then
    echo "修复 LIebesu_Clash..."
    xattr -cr "$APP_PATH" 2>/dev/null || sudo xattr -cr "$APP_PATH"
    codesign --force --deep --sign - "$APP_PATH"
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"
    echo "修复完成，启动应用..."
    open "$APP_PATH"
else
    echo "未找到应用程序"
fi
EOF
    
    chmod +x "$SCRIPT_PATH"
    echo "✅ 永久修复脚本已创建: $SCRIPT_PATH"
}

# 主修复流程
echo "开始修复流程..."

# 1. 修复权限
fix_permissions

# 2. 移除隔离属性
remove_quarantine

# 3. 重新签名
resign_app

# 4. 验证签名
verify_signature || true

# 5. 修复 Info.plist
fix_info_plist

# 6. 注册 Launch Services
register_launch_services

# 7. 刷新界面
refresh_ui

# 8. 创建永久修复脚本
create_permanent_fix

# 等待系统处理
echo "⏳ 等待系统处理..."
sleep 3

# 9. 测试启动
echo ""
echo "🎉 修复流程完成！"
echo ""

if test_app_launch; then
    echo "🎊 恭喜！LIebesu_Clash 现在应该可以正常运行了。"
else
    echo "📋 如果应用程序仍然无法启动，请尝试以下步骤："
    echo ""
    echo "1. 打开 系统偏好设置 > 安全性与隐私 > 通用"
    echo "2. 如果看到关于 LIebesu_Clash 的提示，点击 '仍要打开'"
    echo "3. 或者运行永久修复脚本: $HOME/Desktop/LIebesu_Clash_Permanent_Fix.sh"
    echo "4. 如果问题仍然存在，尝试禁用 Gatekeeper（不推荐）："
    echo "   sudo spctl --master-disable"
    echo "   记得之后重新启用: sudo spctl --master-enable"
fi

echo ""
echo "📞 如需更多帮助，请访问项目GitHub页面或查看文档。"
