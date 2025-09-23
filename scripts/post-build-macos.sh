#!/bin/bash

# macOS 构建后处理脚本
# 用于处理应用程序签名、权限设置和 Launch Services 注册

set -e

BUNDLE_DIR="$1"
if [ -z "$BUNDLE_DIR" ]; then
    echo "❌ 错误: 未指定 bundle 目录"
    echo "用法: $0 <bundle_directory>"
    exit 1
fi

echo "🍎 macOS 构建后处理开始..."
echo "Bundle 目录: $BUNDLE_DIR"

# 查找应用程序包和 DMG 文件
# 修复路径查找逻辑，支持不同的构建目标架构
if [ -d "$BUNDLE_DIR" ]; then
    APP_PATH=$(find "$BUNDLE_DIR" -name "*.app" -type d | head -1)
else
    # 如果传入的目录不存在，尝试查找所有可能的目标架构路径
    for arch in "x86_64-apple-darwin" "aarch64-apple-darwin"; do
        ARCH_BUNDLE_DIR="src-tauri/target/$arch/release/bundle/macos"
        if [ -d "$ARCH_BUNDLE_DIR" ]; then
            APP_PATH=$(find "$ARCH_BUNDLE_DIR" -name "*.app" -type d | head -1)
            BUNDLE_DIR="$ARCH_BUNDLE_DIR"
            break
        fi
    done
fi

# 查找 DMG 文件
if [ -n "$APP_PATH" ]; then
    DMG_PATH=$(find "$(dirname "$BUNDLE_DIR")/dmg" -name "*.dmg" -type f 2>/dev/null | head -1)
    if [ -z "$DMG_PATH" ]; then
        # 如果在 dmg 子目录中没找到，在父目录中查找
        DMG_PATH=$(find "$(dirname "$BUNDLE_DIR")" -name "*.dmg" -type f 2>/dev/null | head -1)
    fi
fi

echo "应用程序路径: $APP_PATH"
echo "DMG 路径: $DMG_PATH"

if [ -n "$APP_PATH" ]; then
    echo "🔧 处理应用程序包..."
    
    # 移除扩展属性（隔离标记）
    echo "移除隔离标记..."
    xattr -cr "$APP_PATH" || true
    
    # 重新签名应用程序（使用临时签名）
    echo "重新签名应用程序..."
    codesign --force --deep --sign - "$APP_PATH" || true
    
    # 验证签名
    echo "验证签名..."
    codesign --verify --verbose "$APP_PATH" || true
    
    # 注册应用程序到 Launch Services
    echo "注册到 Launch Services..."
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH" || true
    
    # 强制重建 Launch Services 数据库
    echo "重建 Launch Services 数据库..."
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user || true
    
    # 更新应用程序修改时间
    echo "更新应用程序时间戳..."
    touch "$APP_PATH" || true
    
    # 设置正确的文件权限
    echo "设置文件权限..."
    chmod -R 755 "$APP_PATH" || true
    
    echo "✅ 应用程序处理完成"
else
    echo "⚠️  未找到应用程序包"
fi

if [ -n "$DMG_PATH" ]; then
    echo "🔧 处理 DMG 文件..."
    
    # 移除 DMG 的扩展属性
    echo "移除 DMG 隔离标记..."
    xattr -cr "$DMG_PATH" || true
    
    echo "✅ DMG 处理完成"
else
    echo "⚠️  未找到 DMG 文件"
fi

echo "🎉 macOS 构建后处理完成！"