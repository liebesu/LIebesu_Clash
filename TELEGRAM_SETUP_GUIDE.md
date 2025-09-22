# 📱 Telegram 机器人完整设置指南

## 🎯 目标
为 LIebesu_Clash 设置自动化 Telegram 通知，当构建完成时自动发送消息到你的 Telegram。

## ✅ 已完成的步骤

### 1. 创建 Telegram 机器人 ✅
- **机器人名称**: `@liebesu_clash_bot`
- **机器人令牌**: `8426858985:AAFoVEt57PBQjHYhOhOMqL6HyG40Nt6o2XQ`
- **状态**: 已创建并配置到 GitHub Secrets

### 2. 获取你的 Chat ID ✅
- **你的用户名**: @laofuqiazhiyisuan
- **你的姓名**: 老夫掐指一算
- **Chat ID**: `640370311`
- **状态**: 已配置到 GitHub Secrets

### 3. GitHub Secrets 配置 ✅
```
TELEGRAM_BOT_TOKEN = 8426858985:AAFoVEt57PBQjHYhOhOMqL6HyG40Nt6o2XQ
TELEGRAM_CHAT_ID = 640370311
```

## 🔧 修复的问题

### 问题 1: Chat ID 未传递
**错误**: `Bad Request: chat not found`
**原因**: GitHub Actions 工作流中缺少 `TELEGRAM_CHAT_ID` 环境变量
**解决**: 已在所有工作流中添加 `TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}`

### 问题 2: 错误的下载链接
**错误**: 下载链接指向旧仓库 `clash-verge-rev/clash-verge-rev`
**原因**: `DOWNLOAD_URL` 环境变量使用了错误的仓库地址
**解决**: 已更新为 `https://github.com/liebesu/LIebesu_Clash/releases/download/autobuild`

## 📋 如何使用 Telegram 机器人

### 与机器人交互
1. 在 Telegram 中搜索 `@liebesu_clash_bot`
2. 点击 "START" 或发送 `/start`
3. 机器人现在已经知道你的 Chat ID，可以给你发送通知

### 接收通知类型
- **自动构建完成**: 每日构建或手动触发构建完成后
- **正式版本发布**: 推送版本标签后的正式发布
- **构建失败**: 如果构建过程出现错误

### 通知内容包括
- 📦 版本信息 (如: LIebesu_Clash v2.4.3+autobuild.123)
- 🔗 直接下载链接
- 📊 支持平台的安装包
- 📝 更新日志和发布说明
- ⏱️ 构建时间和统计信息

## 🚀 下次构建测试

当前修复已提交，下次构建时：
1. ✅ Telegram 机器人会收到正确的 Chat ID
2. ✅ 下载链接会指向正确的 LIebesu_Clash 仓库
3. ✅ 你会收到包含以下信息的消息：

```
🎉 LIebesu_Clash v2.4.3+autobuild.123 滚动更新版发布

🐞 修复问题
- 修复 Telegram 通知配置
- 添加全局节点测速功能
- Windows 文件名包含构建号

下载地址

Windows (不再支持Win7)
正常版本(推荐)
- 64位(常用) | ARM64(不常用)

内置Webview2版
- 64位 | ARM64

macOS
- Apple M芯片 | Intel芯片

Created at Mon Sep 22 15:30:00 CST 2025.
```

## 🛠️ 故障排除

### 如果仍然收不到通知
1. **检查机器人状态**:
   ```
   向 @liebesu_clash_bot 发送任意消息
   如果收到回复，说明机器人正常
   ```

2. **检查 GitHub Secrets**:
   ```bash
   gh secret list --repo liebesu/LIebesu_Clash
   # 应该看到 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID
   ```

3. **手动测试**:
   ```bash
   curl -X POST "https://api.telegram.org/bot8426858985:AAFoVEt57PBQjHYhOhOMqL6HyG40Nt6o2XQ/sendMessage" \
        -H "Content-Type: application/json" \
        -d '{"chat_id":"640370311","text":"测试消息"}'
   ```

### 如果想要创建频道通知
1. 创建 Telegram 频道
2. 将 `@liebesu_clash_bot` 添加为管理员
3. 获取频道 Chat ID (以 -100 开头)
4. 更新 GitHub Secret `TELEGRAM_CHAT_ID`

### 如果想要禁用通知
1. 删除 GitHub Secrets 中的 `TELEGRAM_BOT_TOKEN`
2. 或者在工作流中注释掉 Telegram 通知步骤

## 🎉 完成！

现在你的 LIebesu_Clash 项目拥有完整的 Telegram 自动化通知系统：
- ✅ 自动构建通知
- ✅ 版本发布通知  
- ✅ 错误报告通知
- ✅ 直接下载链接
- ✅ 详细的构建信息

下次构建完成后，你就会在 Telegram 收到通知了！🚀
