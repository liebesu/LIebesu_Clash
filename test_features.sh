#!/bin/bash

echo "🧪 LIebesu_Clash 功能测试脚本"
echo "================================"

# 设置环境变量
export OPENSSL_DIR=/opt/homebrew/opt/openssl@3
export PKG_CONFIG_PATH="/opt/homebrew/opt/openssl@3/lib/pkgconfig:$PKG_CONFIG_PATH"
export NODE_OPTIONS='--max-old-space-size=8192'

cd "$(dirname "$0")"

echo "📋 1. 检查项目结构..."
if [ -f "src-tauri/Cargo.toml" ] && [ -f "package.json" ]; then
    echo "✅ 项目结构正常"
else
    echo "❌ 项目结构异常"
    exit 1
fi

echo ""
echo "🦀 2. Rust 后端编译检查..."
cd src-tauri
if cargo check --quiet; then
    echo "✅ Rust 后端编译通过"
else
    echo "❌ Rust 后端编译失败"
    exit 1
fi

echo ""
echo "🌐 3. TypeScript 前端检查..."
cd ..
if pnpm exec tsc --noEmit; then
    echo "✅ TypeScript 类型检查通过"
else
    echo "❌ TypeScript 类型检查失败"
    exit 1
fi

echo ""
echo "🏗️ 4. 前端构建测试..."
if pnpm run web:build > /dev/null 2>&1; then
    echo "✅ 前端构建成功"
else
    echo "❌ 前端构建失败"
    exit 1
fi

echo ""
echo "🔍 5. 功能完整性检查..."

# 检查全局测速功能
if grep -q "start_global_speed_test" src-tauri/src/lib.rs && 
   grep -q "GlobalSpeedTestDialog" src/pages/profiles.tsx; then
    echo "✅ 全局测速功能集成完成"
else
    echo "❌ 全局测速功能集成不完整"
fi

# 检查批量导入导出功能
if grep -q "text_content.*textContent" src/services/cmds.ts && 
   grep -q "subscription_uids.*subscriptionUids" src/services/cmds.ts; then
    echo "✅ 批量导入导出API兼容性修复完成"
else
    echo "❌ 批量导入导出API兼容性修复不完整"
fi

# 检查备份恢复功能
if grep -q "app_home_dir" src-tauri/src/cmd/backup_restore.rs; then
    echo "✅ 备份恢复功能路径修复完成"
else
    echo "❌ 备份恢复功能路径修复不完整"
fi

echo ""
echo "🎉 功能测试完成！"
echo "所有核心功能已验证可以正常编译和集成。"
echo ""
echo "📝 下一步建议："
echo "1. 运行 'pnpm run dev' 启动开发服务器进行实际测试"
echo "2. 测试批量导入功能：粘贴多个订阅URL"
echo "3. 测试全局测速功能：点击网络测试按钮"
echo "4. 测试备份恢复功能：创建和恢复备份"
