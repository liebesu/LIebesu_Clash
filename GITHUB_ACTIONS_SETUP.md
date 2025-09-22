# GitHub Actions 设置指南

## 🚀 启动自动化构建

### 1. 启用 GitHub Actions

1. 访问新仓库: https://github.com/liebesu/LIebesu_Clash
2. 点击 **Actions** 标签页
3. 如果看到 "Actions aren't enabled for this repository"，点击 **"I understand my workflows, go ahead and enable them"**

### 2. 可用的工作流

#### 📦 自动构建 (autobuild.yml)
- **触发条件**: 每天UTC 04:00自动执行，或手动触发
- **构建平台**: Windows (x64/ARM64), macOS (Intel/Apple Silicon)
- **输出**: 自动发布到 `autobuild` 标签

#### 🧪 测试构建 (test-build.yml)
- **触发条件**: 手动触发，推送到特定分支
- **用途**: 功能测试和开发验证

#### 🛠️ 开发构建 (dev.yml)
- **触发条件**: 手动触发
- **用途**: 开发版本测试

#### 🎯 正式发布 (release.yml)
- **触发条件**: 推送版本标签 (如 v2.4.3)
- **用途**: 正式版本发布

### 3. 手动触发构建

#### 触发自动构建
1. 转到 **Actions** → **Auto Build**
2. 点击 **"Run workflow"**
3. 选择分支 `main`
4. 点击 **"Run workflow"** 按钮

#### 触发测试构建
1. 转到 **Actions** → **LIebesu_Clash - 测试构建**
2. 点击 **"Run workflow"**
3. 选择要构建的平台
4. 点击 **"Run workflow"** 按钮

### 4. 构建产物下载

#### 自动构建版本
- 访问 **Releases** 页面
- 查找 `autobuild` 标签的预发布版本
- 下载对应平台的安装包

#### 测试构建版本
- 转到 **Actions** 页面
- 点击对应的构建任务
- 在 **Artifacts** 部分下载构建产物

### 5. 文件命名规则

构建完成后的文件将使用以下命名格式：

#### Windows
- `LIebesu_Clash_2.4.3_x64-setup.exe`
- `LIebesu_Clash_2.4.3_arm64-setup.exe`
- `LIebesu_Clash_2.4.3_x64_fixed_webview2-setup.exe`

#### macOS
- `LIebesu_Clash_2.4.3_aarch64_123.dmg` (包含构建号)
- `LIebesu_Clash_2.4.3_x64_123.dmg`

### 6. 修复脚本

每个 macOS DMG 包都会包含以下修复脚本：
- `fix-macos-app.sh` - 综合修复脚本
- `refresh-launchpad.sh` - 启动台刷新脚本

### 7. 版本更新

#### 更新版本号
1. 编辑 `package.json` 中的 `version` 字段
2. 编辑 `src-tauri/tauri.conf.json` 中的 `version` 字段
3. 提交更改并推送

#### 发布新版本
1. 创建版本标签: `git tag v2.4.4`
2. 推送标签: `git push origin v2.4.4`
3. 自动触发正式发布构建

### 8. 故障排除

#### 构建失败
1. 检查 Actions 页面的错误日志
2. 确保所有必需的文件都已提交
3. 检查 Rust 和 Node.js 版本兼容性

#### macOS 签名问题
- 当前使用 ad-hoc 签名（开发者签名）
- 如需正式签名，需要配置 Apple 开发者证书

#### Windows 签名问题
- 当前未配置代码签名
- 用户可能需要添加到杀毒软件白名单

### 9. 自定义配置

#### 修改构建频率
编辑 `.github/workflows/autobuild.yml` 中的 cron 表达式：
```yaml
schedule:
  - cron: "0 4 * * *"  # 每天 UTC 04:00
```

#### 添加新平台
在工作流的 `matrix` 部分添加新的构建目标。

## 🎉 完成！

设置完成后，LIebesu_Clash 将拥有完全自动化的构建和发布流程！
