# macOS 启动问题修复指南

## 🔍 问题分析

LIebesu_Clash 在 macOS 上安装后无法启动的问题主要由以下原因导致：

1. **Gatekeeper 隔离属性** - macOS 自动为下载的应用添加隔离标记
2. **代码签名问题** - 应用程序签名缺失或无效
3. **权限设置错误** - 可执行文件缺少执行权限
4. **Launch Services 未注册** - 系统未正确识别应用程序

## 🛠️ 修复方案

### 方案1：使用自动修复脚本

1. **下载增强修复脚本**
   ```bash
   # 在项目根目录执行
   chmod +x scripts/enhanced-macos-fix.sh
   ./scripts/enhanced-macos-fix.sh
   ```

2. **或者使用简化修复脚本（随DMG一起分发）**
   ```bash
   chmod +x fix-startup.sh
   ./fix-startup.sh
   ```

### 方案2：手动修复

```bash
# 1. 移除隔离属性
sudo xattr -cr "/Applications/LIebesu_Clash.app"

# 2. 重新签名应用程序
codesign --force --deep --sign - "/Applications/LIebesu_Clash.app"

# 3. 注册到 Launch Services
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/LIebesu_Clash.app"

# 4. 刷新系统界面
killall Dock
defaults write com.apple.dock ResetLaunchPad -bool true

# 5. 启动应用
open "/Applications/LIebesu_Clash.app"
```

### 方案3：系统设置方法

1. **打开系统偏好设置**
   - 系统偏好设置 → 安全性与隐私 → 通用
   - 如果看到 LIebesu_Clash 相关提示，点击"仍要打开"

2. **临时禁用 Gatekeeper（不推荐）**
   ```bash
   sudo spctl --master-disable
   # 使用后记得重新启用
   sudo spctl --master-enable
   ```

## 🔧 GitHub Actions 构建修复

### 构建流程优化

1. **内存限制增加**
   - 从 4GB 增加到 8GB：`NODE_OPTIONS: "--max_old_space_size=8192"`

2. **增强的 macOS 后处理**
   ```yaml
   - name: Enhanced macOS Post-Build Processing
     if: matrix.os == 'macos-latest'
     run: |
       # 自动移除隔离属性
       # 重新签名应用程序
       # 修复 Info.plist
       # 注册 Launch Services
       # 创建修复脚本
   ```

3. **签名策略改进**
   - 支持真实证书和 ad-hoc 签名
   - 自动回退机制
   - 公证流程（如果有证书）

### 构建产物改进

1. **DMG 文件**
   - 移除隔离属性
   - 包含修复脚本

2. **应用程序包**
   - 正确的权限设置
   - 有效的代码签名
   - 完整的 Info.plist

## 📋 技术细节

### Tauri 配置优化

```json
{
  "bundle": {
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": "-",
      "entitlements": "packages/macos/entitlements.plist",
      "dmg": {
        "background": "images/background.png",
        "appPosition": { "x": 180, "y": 170 },
        "applicationFolderPosition": { "x": 480, "y": 170 }
      }
    }
  }
}
```

### 构建脚本改进

```json
{
  "scripts": {
    "postbuild": "node -e \"if (process.platform === 'darwin') { /* 错误处理的构建后脚本 */ }\""
  }
}
```

## 🔄 持续集成修复

### 自动构建 (autobuild.yml)
- ✅ 增强的 macOS 后处理
- ✅ 内存优化
- ✅ 错误恢复机制

### 发布构建 (release-enhanced.yml)
- ✅ 公证支持
- ✅ 多签名策略
- ✅ 增强的用户文档

### 新增文件
- `scripts/enhanced-macos-fix.sh` - 增强修复脚本
- `MACOS_STARTUP_FIX.md` - 修复指南
- `.github/workflows/release-enhanced.yml` - 增强发布流程

## 🎯 预期效果

### 构建改进
- 🔧 自动修复 macOS 启动问题
- 💾 减少内存不足导致的构建失败
- 📱 改善 Launchpad 图标显示

### 用户体验
- ✅ 一键修复脚本
- 📋 详细的故障排除指南
- 🛡️ 更好的安全性和兼容性

### 兼容性
- 🍎 支持 macOS 10.15+
- 🔧 Intel 和 Apple Silicon 架构
- 🔐 ad-hoc 和真实证书签名

## 🚀 部署说明

1. **提交修复代码**
   ```bash
   git add .
   git commit -m "fix: 修复macOS应用启动问题并增强构建流程"
   git push origin main
   ```

2. **触发构建**
   - 推送到 main 分支自动触发 autobuild
   - 创建标签触发 release 构建

3. **验证修复**
   - 下载构建的 DMG
   - 测试应用启动
   - 验证修复脚本

## 📞 技术支持

如果问题仍然存在：

1. 查看 GitHub Actions 构建日志
2. 运行诊断命令：
   ```bash
   codesign -dv --verbose=4 "/Applications/LIebesu_Clash.app"
   spctl -a -vv "/Applications/LIebesu_Clash.app"
   ```
3. 检查系统日志：Console.app
4. 在项目 GitHub 页面提交 Issue
