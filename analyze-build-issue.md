# GitHub Actions Windows 构建问题分析

## 🔍 **发现的关键问题**

### 1. **配置文件标识符不一致** ✅ 已修复

| 文件 | 原标识符 | 修复后标识符 | 状态 |
|------|---------|-------------|------|
| `tauri.conf.json` | `io.github.liebesu.clash` | ✅ 正确 | 已正确 |
| `tauri.personal.conf.json` | `io.github.liebesu.clash` | ✅ 正确 | 已正确 |
| `tauri.windows.conf.json` | `io.github.clash-verge-rev.clash-verge-rev` | `io.github.liebesu.clash` | ✅ 已修复 |
| `webview2.x64.json` | `io.github.liebesu.clash` | ✅ 正确 | 已正确 |
| `webview2.arm64.json` | `io.github.liebesu.clash` | ✅ 正确 | 已正确 |
| `webview2.x86.json` | `io.github.liebesu.clash` | ✅ 正确 | 已正确 |

### 2. **GitHub Actions 构建流程问题** ⚠️

#### **问题A：普通版本构建** (`windows-personal.yml`)
- **正确使用**：`--config src-tauri/tauri.personal.conf.json`
- **配置内容**：包含正确的 `identifier` 和 `productName`
- **状态**：✅ 应该正常

#### **问题B：内置WebView2版本构建** (`release.yml`, `autobuild.yml`)
```yaml
# 问题流程：
- name: Download WebView2 Runtime
  run: |
    # 下载 WebView2 运行时
    invoke-webrequest -uri https://github.com/westinyang/WebView2RuntimeArchive/releases/download/109.0.1518.78/Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.${{ matrix.arch }}.cab
    # 解压到 src-tauri
    Expand .\Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.${{ matrix.arch }}.cab -F:* ./src-tauri
    # ❌ 删除正确的配置文件
    Remove-Item .\src-tauri\tauri.windows.conf.json
    # ❌ 用 webview2 配置文件替换
    Rename-Item .\src-tauri\webview2.${{ matrix.arch }}.json tauri.windows.conf.json

- name: Tauri build
  # 使用被替换的配置文件构建
```

**结果**：构建时使用的是 `webview2.$arch.json` 的内容，但文件名是 `tauri.windows.conf.json`

#### **问题C：配置文件内容差异**

| 配置项 | `tauri.windows.conf.json` | `webview2.x64.json` |
|--------|--------------------------|---------------------|
| `identifier` | ✅ `io.github.liebesu.clash` | ✅ `io.github.liebesu.clash` |
| `webviewInstallMode.type` | `embedBootstrapper` | `fixedRuntime` |
| `webviewInstallMode.path` | ❌ 无 | ✅ `./Microsoft.WebView2...` |
| `updater.active` | ❌ 无 | ✅ `true` |
| `updater.endpoints` | ❌ 空数组 | ✅ 有更新服务器 |

## 🎯 **根本原因分析**

### **为什么应用程序文件找不到？**

1. **构建过程正常**：所有配置文件现在都有正确的 `identifier`
2. **安装包名称可能错误**：
   - 期望：`Liebesu_Clash.exe`
   - 实际可能：`clash-verge.exe` 或其他名称

3. **安装路径可能错误**：
   - 期望：`C:\Program Files\Liebesu_Clash\`
   - 实际可能：`C:\Program Files\Clash Verge Rev\` 或其他

4. **NSIS 安装脚本**：
   - 使用了自定义的 `./packages/windows/installer.nsi`
   - 脚本中的变量可能仍在使用旧的产品名称

## 🛠️ **修复策略**

### **短期修复（立即生效）**
1. ✅ 已修复所有配置文件的 `identifier`
2. ✅ 确认 GitHub Actions 配置正确
3. ⚠️ 需要检查 NSIS 安装脚本中的产品名称

### **长期修复（彻底解决）**
1. 统一所有构建流程的配置文件管理
2. 确保所有变体（普通版、WebView2内置版）使用相同的产品信息
3. 改进构建后的文件名验证

## 📋 **下一步操作**

### **立即执行**：
1. 检查 `src-tauri/packages/windows/installer.nsi` 脚本
2. 验证产品名称和文件名映射
3. 重新构建和测试

### **验证方法**：
1. 查看构建日志中的文件路径
2. 检查生成的安装包内容
3. 安装后验证应用程序位置

## 🚨 **紧急修复建议**

如果需要立即修复，可以考虑：
1. **临时方案**：修改诊断脚本以搜索所有可能的应用程序名称
2. **永久方案**：确保构建流程产生预期的文件名和路径
3. **验证方案**：在 GitHub Actions 中添加构建后验证步骤

---

**总结**：配置问题已基本修复，但需要进一步验证 NSIS 安装脚本和构建产物的实际命名。
