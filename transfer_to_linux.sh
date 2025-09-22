#!/bin/bash

# 项目传输到Linux主机脚本
# 使用方法: ./transfer_to_linux.sh user@your-linux-host:/path/to/destination

if [ $# -eq 0 ]; then
    echo "使用方法: $0 user@host:/path/to/destination"
    echo "例如: $0 ubuntu@192.168.1.100:/home/ubuntu/"
    exit 1
fi

DESTINATION=$1
PROJECT_NAME="LIebesu_Clash"

echo "📦 准备传输项目到 Linux 主机..."
echo "目标: $DESTINATION"

# 创建临时目录并复制项目文件
TEMP_DIR="/tmp/${PROJECT_NAME}_$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📋 复制项目文件..."

# 复制必要的文件和目录
cp -r src/ "$TEMP_DIR/"
cp -r src-tauri/ "$TEMP_DIR/"
cp -r public/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  public 目录不存在，跳过"
cp package.json "$TEMP_DIR/"
cp pnpm-lock.yaml "$TEMP_DIR/" 2>/dev/null || echo "⚠️  pnpm-lock.yaml 不存在，跳过"
cp yarn.lock "$TEMP_DIR/" 2>/dev/null || echo "⚠️  yarn.lock 不存在，跳过"
cp package-lock.json "$TEMP_DIR/" 2>/dev/null || echo "⚠️  package-lock.json 不存在，跳过"
cp vite.config.mts "$TEMP_DIR/" 2>/dev/null || echo "⚠️  vite.config.mts 不存在，跳过"
cp tsconfig.json "$TEMP_DIR/" 2>/dev/null || echo "⚠️  tsconfig.json 不存在，跳过"
cp tailwind.config.js "$TEMP_DIR/" 2>/dev/null || echo "⚠️  tailwind.config.js 不存在，跳过"
cp *.md "$TEMP_DIR/" 2>/dev/null || echo "⚠️  README 文件不存在，跳过"

# 复制编译脚本
cp linux_build_test.sh "$TEMP_DIR/"
cp rust_check_only.sh "$TEMP_DIR/"

echo "🗜️  创建压缩包..."
cd /tmp
tar -czf "${PROJECT_NAME}.tar.gz" -C "$TEMP_DIR" .

echo "📤 传输到 Linux 主机..."
scp "${PROJECT_NAME}.tar.gz" "$DESTINATION"

# 创建远程解压和编译命令
REMOTE_COMMANDS="
cd \$(dirname $DESTINATION)
tar -xzf ${PROJECT_NAME}.tar.gz -C ${PROJECT_NAME}_build || mkdir ${PROJECT_NAME}_build && tar -xzf ${PROJECT_NAME}.tar.gz -C ${PROJECT_NAME}_build
cd ${PROJECT_NAME}_build
echo '📁 项目文件已解压到: \$(pwd)'
echo '🚀 现在可以运行以下命令进行编译测试:'
echo '  ./rust_check_only.sh        # 快速Rust语法检查'
echo '  ./linux_build_test.sh       # 完整编译测试'
echo ''
echo '📋 或者手动运行:'
echo '  cd src-tauri && cargo check  # 检查Rust代码'
echo '  pnpm install && pnpm run web:build  # 编译前端'
"

echo "🔗 连接到远程主机并解压..."
ssh ${DESTINATION%:*} "$REMOTE_COMMANDS"

# 清理临时文件
rm -rf "$TEMP_DIR"
rm "/tmp/${PROJECT_NAME}.tar.gz"

echo "✅ 传输完成！"
echo ""
echo "下一步:"
echo "1. SSH 连接到你的 Linux 主机"
echo "2. 进入项目目录"
echo "3. 运行 ./rust_check_only.sh 进行快速检查"
echo "4. 或运行 ./linux_build_test.sh 进行完整测试"
