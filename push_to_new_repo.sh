#!/bin/bash

# LIebesu_Clash 推送到新仓库脚本

echo "🚀 推送 LIebesu_Clash 到新的 GitHub 仓库"
echo "============================================"

# 确保我们在正确的分支
echo "📍 当前分支:"
git branch --show-current

# 推送主分支
echo "📤 推送 main 分支到新仓库..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ 成功推送到新仓库！"
    echo ""
    echo "🔗 仓库地址: https://github.com/liebesu/LIebesu_Clash"
    echo ""
    echo "📋 下一步操作:"
    echo "1. 访问 https://github.com/liebesu/LIebesu_Clash"
    echo "2. 转到 Actions 标签页"
    echo "3. 启用 GitHub Actions"
    echo "4. 运行 'LIebesu_Clash - 测试构建' 工作流"
else
    echo "❌ 推送失败，请检查:"
    echo "1. GitHub 仓库是否已创建"
    echo "2. 仓库名称是否为 'LIebesu_Clash'"
    echo "3. 是否有推送权限"
fi

echo ""
echo "🔧 GitHub Actions 工作流:"
echo "- autobuild.yml: 每日自动构建"
echo "- test-build.yml: 手动测试构建"
echo "- dev.yml: 开发测试构建"
echo "- release.yml: 正式版本发布"
