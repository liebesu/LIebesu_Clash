# LIebesu_Clash

LIebesu_Clash 是一个独立的 Clash 客户端，基于 Clash Verge Rev 开发，但完全独立运行。

## 🚀 主要特性

- **完全独立**: 可与原版 Clash Verge 共存，不会产生冲突
- **独立配置**: 使用独立的配置目录和数据存储
- **全新标识**: 使用独立的应用标识符和深度链接协议
- **自定义图标**: 使用专属的应用图标
- **独立自启动**: 使用独立的自启动配置

## 📁 配置目录

LIebesu_Clash 使用以下独立目录存储配置和数据：

### Windows

```
%LOCALAPPDATA%\io.github.liebesu.liebesu-clash\
```

### macOS

```
~/Library/Application Support/io.github.liebesu.liebesu-clash/
```

### Linux

```
~/.local/share/io.github.liebesu.liebesu-clash/
```

## 🔧 技术细节

### 应用标识符

- 生产环境: `io.github.liebesu.liebesu-clash`
- 开发环境: `io.github.liebesu.liebesu-clash.dev`

### 深度链接协议

- 协议名: `liebesu-clash://`

### IPC 通信

- Unix: `liebesu-mihomo.sock`
- Windows: `\\.\pipe\liebesu-mihomo`

### 自启动配置

- Windows: `LIebesu_Clash.lnk`

## 🛠️ 与原版的区别

| 项目       | 原版 Clash Verge                            | LIebesu_Clash                     |
| ---------- | ------------------------------------------- | --------------------------------- |
| 应用标识符 | `io.github.clash-verge-rev.clash-verge-rev` | `io.github.liebesu.liebesu-clash` |
| 配置目录   | `clash-verge-rev`                           | `liebesu-clash`                   |
| 深度链接   | `clash-verge://`                            | `liebesu-clash://`                |
| IPC 管道   | `verge-mihomo`                              | `liebesu-mihomo`                  |
| 自启动名称 | `Clash Verge.lnk`                           | `LIebesu_Clash.lnk`               |
| 备份目录   | `clash-verge-rev-backup`                    | `liebesu-clash-backup`            |

## 📦 安装说明

1. 下载对应平台的安装包
2. 安装 LIebesu_Clash
3. 首次运行时会自动创建独立的配置目录
4. 可与原版 Clash Verge 同时使用，不会相互干扰

## 🔄 数据迁移

如需从原版 Clash Verge 迁移数据：

1. 找到原版配置目录
2. 复制配置文件到 LIebesu_Clash 配置目录
3. 重启应用即可

## ⚠️ 注意事项

- LIebesu_Clash 与原版 Clash Verge 完全独立
- 两者可同时运行，但建议避免同时启用系统代理
- 配置文件格式兼容，可手动迁移
- 自启动设置互不影响

## 🐛 问题报告

如遇到问题，请提供以下信息：

- 操作系统版本
- LIebesu_Clash 版本
- 错误日志（位于配置目录的 `logs` 文件夹）

## 📄 许可证

GNU General Public License v3.0
