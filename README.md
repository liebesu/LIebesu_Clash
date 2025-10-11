# LIebesu_Clash

<div align="center">

![LIebesu_Clash](./icons94.png)

**LIebesu_Clash - Independent Clash Client**

基于 Clash Verge Rev 的独立 Clash 客户端，完全独立运行，可与原版共存。

[下载](#-下载) • [功能](#-功能特性) • [安装](#-安装说明) • [文档](#-文档)

[![GitHub release](https://img.shields.io/github/v/release/liebesu/LIebesu_Clash?style=flat-square)](https://github.com/liebesu/LIebesu_Clash/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/liebesu/LIebesu_Clash/total?style=flat-square)](https://github.com/liebesu/LIebesu_Clash/releases)
[![License](https://img.shields.io/github/license/liebesu/LIebesu_Clash?style=flat-square)](LICENSE)

</div>

## 🎯 项目特色

**LIebesu_Clash** 是一个完全独立的 Clash 客户端，基于优秀的 Clash Verge Rev 项目开发，但进行了全面的独立化改造：

### 🔥 核心优势

- **完全独立**: 与原版 Clash Verge 完全隔离，可同时安装使用
- **无冲突共存**: 独立的配置目录、进程通信、系统注册
- **全新标识**: 专属的应用图标、名称和标识符
- **增强功能**: 新增批量导入/导出、订阅测试等实用功能
- **持续更新**: 独立的开发和发布周期

### ✨ 功能特性

#### 🚀 新增功能

- **批量订阅管理**: 支持批量导入/导出订阅链接，支持多种格式
- **订阅测试工具**: 全量节点测速、稳定性分析、质量排序
- **智能预览**: 导入前预览，避免重复和错误
- **版本显示**: 界面显示应用版本和构建号

#### 📊 核心功能

- **Clash 内核**: 支持 Clash Premium 和 Clash.Meta
- **规则管理**: 支持规则集订阅和自定义规则
- **代理管理**: 完整的代理配置和策略管理
- **系统代理**: 智能系统代理切换
- **流量统计**: 实时流量监控和统计
- **日志查看**: 详细的连接日志和调试信息

## 📦 下载

### 最新版本

前往 [Releases](https://github.com/liebesu/LIebesu_Clash/releases) 页面下载最新版本。

### 平台支持

| 平台    | 架构                  | 状态        |
| ------- | --------------------- | ----------- |
| Windows | x64 / ARM64           | ✅ 支持     |
| macOS   | Intel / Apple Silicon | ✅ 支持     |
| Linux   | x64 / ARM64 / ARMv7   | ❌ 暂不支持 |

### 自动构建

每日自动构建版本包含最新功能和修复，可在 [Actions](https://github.com/liebesu/LIebesu_Clash/actions) 页面下载。

## 🛠️ 安装说明

### Windows

1. 下载 `LIebesu_Clash_x.x.x_x64-setup.exe`
2. 运行安装程序
3. 首次启动会自动创建独立配置目录

### macOS

1. 下载 `LIebesu_Clash_x.x.x_aarch64.dmg` (Apple Silicon) 或 `LIebesu_Clash_x.x.x_x64.dmg` (Intel)
2. 打开 DMG 文件，将应用拖拽到 Applications 文件夹
3. 如遇到安装问题，运行 DMG 中的 `fix-macos-app.sh` 脚本
4. 如启动台不显示图标，运行 `refresh-launchpad.sh` 脚本

## 🔧 与原版的区别

| 项目     | 原版 Clash Verge | LIebesu_Clash     |
| -------- | ---------------- | ----------------- |
| 应用名称 | Clash Verge Rev  | LIebesu_Clash     |
| 配置目录 | clash-verge-rev  | liebesu-clash     |
| 应用标识 | clash-verge-rev  | liebesu-clash     |
| 深度链接 | clash-verge://   | liebesu-clash://  |
| 自启动名 | Clash Verge.lnk  | LIebesu_Clash.lnk |

## 📚 文档

- [安装指南](./LIEBESU_CLASH_README.md) - 详细的安装和配置说明
- [功能说明](#-功能特性) - 各功能的使用方法
- [故障排除](#-故障排除) - 常见问题解决方案

## 🐛 故障排除

### macOS 相关问题

#### 应用无法打开/提示已损坏

```bash
# 运行修复脚本（包含在 DMG 中）
./fix-macos-app.sh
```

#### 启动台不显示图标

```bash
# 运行启动台刷新脚本（包含在 DMG 中）
./refresh-launchpad.sh
```

### Windows 相关问题

#### 杀毒软件误报

- 添加应用目录到杀毒软件白名单
- 下载官方签名版本

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/liebesu/LIebesu_Clash.git

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

## 📄 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。

## 🙏 致谢

感谢 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 项目提供的优秀基础。

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=liebesu/LIebesu_Clash&type=Date)](https://star-history.com/#liebesu/LIebesu_Clash&Date)

---

<div align="center">
Made with ❤️ by LIebesu
</div>
