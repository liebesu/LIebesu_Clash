# 🔍 GitHub Actions 打包问题深度分析

## ⚠️ **发现的关键打包问题**

### **1. Tauri Action 版本问题**
```yaml
uses: tauri-apps/tauri-action@v0  # ❌ 使用过时版本
```

**问题**：
- `@v0` 是一个非常老的版本（可能是 Tauri 1.x 时代）
- 最新版本应该是 `@v0.5.x` 或更高
- 旧版本可能不支持 Tauri 2.x 的新特性和配置

**修复**：
```yaml
uses: tauri-apps/tauri-action@v0.5  # ✅ 更新到稳定版本
```

### **2. Sidecar 二进制文件下载问题** ⭐ **关键问题**

从 `prebuild.mjs` 看到需要下载多个关键组件：
- `verge-mihomo` (核心代理引擎)
- `verge-mihomo-alpha`
- `clash-verge-service` (系统服务)
- `sysproxy.exe` (系统代理设置)
- `enableLoopback.exe` (UWP 工具)
- 其他地理位置数据文件

**潜在问题**：
1. **网络下载失败**：GitHub Actions 环境可能无法访问某些下载地址
2. **下载超时**：大文件下载可能超时失败
3. **文件损坏**：下载的二进制文件可能不完整
4. **权限问题**：下载的文件可能没有执行权限

### **3. Windows 特定打包配置问题**

#### **WebView2 配置不一致**
```yaml
# release.yml 和 autobuild.yml 中：
- name: Download WebView2 Runtime
  run: |
    # 下载 WebView2 运行时
    invoke-webrequest -uri https://github.com/westinyang/WebView2RuntimeArchive/releases/download/109.0.1518.78/Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.${{ matrix.arch }}.cab
    # ❌ 问题：替换配置文件
    Remove-Item .\src-tauri\tauri.windows.conf.json
    Rename-Item .\src-tauri\webview2.${{ matrix.arch }}.json tauri.windows.conf.json
```

**问题**：动态替换配置文件可能导致配置不一致

#### **签名配置缺失**
```yaml
# windows-personal.yml 没有签名配置
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  # ❌ 缺少签名相关环境变量

# 而 release.yml 有完整签名配置
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
```

### **4. 构建参数和路径问题**

#### **构建参数不一致**
```yaml
# windows-personal.yml
args: --target x86_64-pc-windows-msvc -b nsis --config src-tauri/tauri.personal.conf.json

# autobuild.yml  
args: --target ${{ matrix.target }}  # ❌ 没有指定配置文件
```

#### **输出文件路径问题**
```yaml
path: |
  src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe
  src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi
```

**潜在问题**：如果构建失败或文件名不匹配，上传的 artifacts 可能为空

## 🛠️ **修复建议**

### **立即修复（高优先级）**

1. **更新 Tauri Action 版本**
```yaml
- name: Build app (x64 NSIS)
  uses: tauri-apps/tauri-action@v0.5  # 更新版本
```

2. **添加 prebuild 验证步骤**
```yaml
- name: Verify sidecar binaries
  run: |
    Get-ChildItem -Path "src-tauri/sidecar/" -Recurse
    Get-ChildItem -Path "src-tauri/resources/" -Recurse
```

3. **统一构建配置**
```yaml
- name: Build app (x64 NSIS)
  uses: tauri-apps/tauri-action@v0.5
  with:
    tauriScript: pnpm
    args: --target x86_64-pc-windows-msvc -b nsis --config src-tauri/tauri.personal.conf.json
    # 添加调试输出
    includeDebug: true
```

### **中期修复**

4. **改进错误处理**
```yaml
- name: Download sidecar binaries (x64)
  run: |
    pnpm run prebuild x86_64-pc-windows-msvc
    # 验证关键文件存在
    if (!(Test-Path "src-tauri/sidecar/verge-mihomo-*")) {
      throw "Critical sidecar binary missing"
    }
```

5. **添加构建后验证**
```yaml
- name: Verify build artifacts
  run: |
    $artifacts = Get-ChildItem -Path "src-tauri/target/" -Recurse -Include "*.exe" | Where-Object { $_.Name -like "*setup*" }
    if ($artifacts.Count -eq 0) {
      throw "No setup executable found"
    }
    foreach ($artifact in $artifacts) {
      Write-Host "Found: $($artifact.FullName) ($(($artifact.Length/1MB).ToString('F1')) MB)"
    }
```

## 📋 **调试步骤**

### **检查构建日志**
在 GitHub Actions 中查找：
1. ❌ `prebuild` 步骤是否有下载失败
2. ❌ `Tauri build` 步骤是否有编译错误
3. ❌ `List artifacts` 是否显示空结果

### **本地复现问题**
```bash
# 1. 清理环境
rm -rf src-tauri/target/
rm -rf src-tauri/sidecar/
rm -rf src-tauri/resources/

# 2. 重新下载依赖
pnpm run prebuild x86_64-pc-windows-msvc

# 3. 本地构建
pnpm build --target x86_64-pc-windows-msvc

# 4. 检查输出
ls -la src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

## 🚨 **最可能的原因**

基于分析，**最可能的原因**是：
1. **Sidecar 二进制文件下载失败** - 应用程序缺少核心组件
2. **Tauri Action 版本过旧** - 不兼容当前配置
3. **构建过程中的静默失败** - 没有适当的错误检查

**建议优先级**：
1. 🔥 检查 GitHub Actions 构建日志中的 `prebuild` 步骤
2. 🔥 更新 `tauri-action` 到最新稳定版本
3. 🔥 添加构建验证步骤
4. ⚠️ 统一所有 workflow 的配置
