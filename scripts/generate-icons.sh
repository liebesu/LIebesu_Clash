#!/bin/bash

# 图标生成脚本
# 基于 green.png 生成所有需要的图标尺寸和格式

set -e

echo "🎨 开始生成 LIebesu_Clash 图标..."

# 检查是否安装了 ImageMagick
if ! command -v magick &> /dev/null && ! command -v convert &> /dev/null; then
    echo "❌ 错误: 需要安装 ImageMagick"
    echo "macOS: brew install imagemagick"
    echo "Ubuntu: sudo apt-get install imagemagick"
    exit 1
fi

# 使用 ImageMagick 的命令
MAGICK_CMD="magick"
if ! command -v magick &> /dev/null; then
    MAGICK_CMD="convert"
fi

SOURCE_IMAGE="green.png"
ICONS_DIR="src-tauri/icons"
ASSETS_DIR="src/assets/image"

# 检查源图片
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "❌ 错误: 找不到源图片 $SOURCE_IMAGE"
    exit 1
fi

echo "📂 创建图标目录..."
mkdir -p "$ICONS_DIR"
mkdir -p "$ASSETS_DIR"

echo "🔄 生成应用程序图标..."

# 生成各种尺寸的 PNG 图标
declare -a sizes=("16" "32" "48" "64" "128" "256" "512" "1024")

for size in "${sizes[@]}"; do
    echo "  生成 ${size}x${size}.png..."
    $MAGICK_CMD "$SOURCE_IMAGE" -resize "${size}x${size}" -quality 100 "$ICONS_DIR/${size}x${size}.png"
done

# 生成特殊尺寸
echo "  生成 128x128@2x.png..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "256x256" -quality 100 "$ICONS_DIR/128x128@2x.png"

echo "  生成主图标 icon.png..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "512x512" -quality 100 "$ICONS_DIR/icon.png"

# 生成 Windows Store 图标
echo "🪟 生成 Windows Store 图标..."
declare -a windows_sizes=(
    "30:Square30x30Logo.png"
    "44:Square44x44Logo.png" 
    "71:Square71x71Logo.png"
    "89:Square89x89Logo.png"
    "107:Square107x107Logo.png"
    "142:Square142x142Logo.png"
    "150:Square150x150Logo.png"
    "284:Square284x284Logo.png"
    "310:Square310x310Logo.png"
    "50:StoreLogo.png"
)

for entry in "${windows_sizes[@]}"; do
    size="${entry%%:*}"
    filename="${entry##*:}"
    echo "  生成 $filename (${size}x${size})..."
    $MAGICK_CMD "$SOURCE_IMAGE" -resize "${size}x${size}" -quality 100 "$ICONS_DIR/$filename"
done

# 生成 ICO 文件 (Windows)
echo "🪟 生成 Windows ICO 文件..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "256x256" "$ICONS_DIR/icon.ico"

# 生成系统托盘图标
echo "  生成系统托盘图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -quality 100 "$ICONS_DIR/tray-icon.ico"

# 生成单色托盘图标 (可选，如果需要的话)
echo "  生成单色托盘图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -colorspace Gray -quality 100 "$ICONS_DIR/tray-icon-mono.ico"

# 生成系统代理状态图标
echo "  生成系统代理状态图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -modulate 100,150,100 -quality 100 "$ICONS_DIR/tray-icon-sys.ico"
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -modulate 100,150,100 -colorspace Gray -quality 100 "$ICONS_DIR/tray-icon-sys-mono.ico"

# 生成 TUN 模式图标
echo "  生成 TUN 模式图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -modulate 100,100,120 -quality 100 "$ICONS_DIR/tray-icon-tun.ico"
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -modulate 100,100,120 -colorspace Gray -quality 100 "$ICONS_DIR/tray-icon-tun-mono.ico"

# 生成新版本的系统托盘图标
echo "  生成新版本系统托盘图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -brightness-contrast 10x10 -quality 100 "$ICONS_DIR/tray-icon-sys-mono-new.ico"
$MAGICK_CMD "$SOURCE_IMAGE" -resize "32x32" -brightness-contrast 10x10 -quality 100 "$ICONS_DIR/tray-icon-tun-mono-new.ico"

# 生成 macOS ICNS 文件
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 生成 macOS ICNS 文件..."
    
    # 创建临时目录
    TEMP_ICONSET="temp_iconset.iconset"
    mkdir -p "$TEMP_ICONSET"
    
    # 生成各种尺寸用于 ICNS
    declare -a icns_sizes=(
        "16:icon_16x16.png"
        "32:icon_16x16@2x.png"
        "32:icon_32x32.png" 
        "64:icon_32x32@2x.png"
        "128:icon_128x128.png"
        "256:icon_128x128@2x.png"
        "256:icon_256x256.png"
        "512:icon_256x256@2x.png"
        "512:icon_512x512.png"
        "1024:icon_512x512@2x.png"
    )
    
    for entry in "${icns_sizes[@]}"; do
        size="${entry%%:*}"
        filename="${entry##*:}"
        echo "  生成 ICNS 组件: $filename (${size}x${size})..."
        $MAGICK_CMD "$SOURCE_IMAGE" -resize "${size}x${size}" -quality 100 "$TEMP_ICONSET/$filename"
    done
    
    # 生成 ICNS 文件
    echo "  合并为 icon.icns..."
    iconutil -c icns "$TEMP_ICONSET" -o "$ICONS_DIR/icon.icns"
    
    # 清理临时文件
    rm -rf "$TEMP_ICONSET"
fi

# 生成前端资源图标
echo "🌐 生成前端资源图标..."

# 生成 logo.svg (简单的 SVG 包装)
echo "  生成 logo.svg..."
cat > "$ICONS_DIR/logo.svg" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .logo-bg { fill: #4CAF50; }
      .logo-text { fill: white; font-family: Arial, sans-serif; font-weight: bold; }
    </style>
  </defs>
  <rect class="logo-bg" width="512" height="512" rx="64"/>
  <text class="logo-text" x="256" y="280" text-anchor="middle" font-size="120">LC</text>
  <text class="logo-text" x="256" y="350" text-anchor="middle" font-size="32">LIebesu Clash</text>
</svg>
EOF

# 复制到前端资源目录
echo "  复制到前端资源目录..."
cp "$ICONS_DIR/logo.svg" "$ASSETS_DIR/logo.svg"
$MAGICK_CMD "$SOURCE_IMAGE" -resize "64x64" -quality 100 "$ASSETS_DIR/logo.ico"

# 生成深色和浅色主题图标
echo "  生成主题图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "64x64" -quality 100 "$ASSETS_DIR/icon_light.svg.png"
$MAGICK_CMD "$SOURCE_IMAGE" -resize "64x64" -negate -quality 100 "$ASSETS_DIR/icon_dark.svg.png"

# 更新根目录的图标
echo "📝 更新根目录图标..."
$MAGICK_CMD "$SOURCE_IMAGE" -resize "94x94" -quality 100 "icons94.png"

echo "✅ 图标生成完成！"
echo ""
echo "📋 生成的文件："
echo "  - 应用程序图标: $ICONS_DIR/"
echo "  - 前端资源: $ASSETS_DIR/"
echo "  - 根目录图标: icons94.png"
echo ""
echo "🚀 接下来请运行构建来测试新图标！"
