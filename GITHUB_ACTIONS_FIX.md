# GitHub Actions Windows 构建问题修复方案

## 🔍 **问题分析**

通过深入分析代码和配置，发现了导致 Windows 应用无法启动的**根本原因**：

### ❌ **核心问题：配置文件不一致**

1. **GitHub Actions 覆盖配置问题**
   - `windows-personal.yml` 第 62-81 行动态生成的 `tauri.personal.conf.json`
   - **丢失了关键配置**：`productName` 和 `identifier`
   - 导致生成的应用程序使用错误的标识符

2. **Windows 配置文件标识符不一致**

   ```
   ❌ tauri.windows.conf.json: "io.github.clash-verge-rev.clash-verge-rev"
   ✅ 应该是: "io.github.liebesu.clash"
   ```

3. **应用数据路径混乱**
   - 正确路径：`%APPDATA%\io.github.liebesu.clash\`
   - 错误路径：`%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\`

---

## 🛠️ **修复步骤**

### **第一步：修复 GitHub Actions 配置**

替换 `/.github/workflows/windows-personal.yml` 中的配置生成步骤：

```yaml
- name: Create Tauri config override (disable updater) - FIXED
  shell: pwsh
  run: |
    $config = @'
    {
      "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
      "identifier": "io.github.liebesu.clash",
      "productName": "Liebesu_Clash",
      "plugins": {
        "updater": {
          "dialog": false,
          "endpoints": []
        },
        "deep-link": {
          "desktop": {
            "schemes": ["liebesu-clash"]
          }
        }
      },
      "bundle": {
        "windows": {
          "nsis": {}
        },
        "macOS": {
          "signingIdentity": "-",
          "entitlements": "packages/macos/entitlements.plist"
        }
      }
    }
    '@
    $config | Out-File -FilePath "src-tauri/tauri.personal.conf.json" -Encoding UTF8
```

### **第二步：验证配置文件一致性**

确保所有 Tauri 配置文件使用相同标识符：

- ✅ `src-tauri/tauri.conf.json`: `"identifier": "io.github.liebesu.clash"`
- ✅ `src-tauri/tauri.personal.conf.json`: `"identifier": "io.github.liebesu.clash"`
- ✅ `src-tauri/tauri.windows.conf.json`: `"identifier": "io.github.liebesu.clash"`
- ✅ `src-tauri/webview2.x64.json`: `"identifier": "io.github.liebesu.clash"`

### **第三步：添加构建验证步骤**

在 GitHub Actions 中添加验证步骤：

```yaml
- name: Verify config file
  shell: pwsh
  run: |
    Write-Host "Generated tauri.personal.conf.json content:"
    Get-Content "src-tauri/tauri.personal.conf.json"

- name: List artifacts
  shell: pwsh
  run: |
    Write-Host "Listing all built artifacts:"
    Get-ChildItem -Path "src-tauri/target/" -Recurse -Include "*.exe", "*.msi" | Select-Object FullName, Length, LastWriteTime

    Write-Host "`nChecking executable details:"
    $exeFiles = Get-ChildItem -Path "src-tauri/target/" -Recurse -Include "*.exe" | Where-Object { $_.Name -like "*setup*" -or $_.Name -eq "Liebesu_Clash.exe" }
    foreach ($exe in $exeFiles) {
      Write-Host "File: $($exe.FullName)"
      Write-Host "Size: $([math]::Round($exe.Length/1MB, 2)) MB"
      try {
        $version = (Get-ItemProperty $exe.FullName).VersionInfo
        Write-Host "Product: $($version.ProductName)"
        Write-Host "Version: $($version.FileVersion)"
      } catch {
        Write-Host "Version info not available"
      }
      Write-Host "---"
    }
```

---

## 🎯 **关键修复点**

### **1. 产品名称一致性**

```json
{
  "productName": "Liebesu_Clash",
  "identifier": "io.github.liebesu.clash"
}
```

### **2. 应用数据路径**

- Windows: `%APPDATA%\io.github.liebesu.clash\`
- 深度链接: `liebesu-clash://`

### **3. 构建输出路径**

正确的安装包应该是：

- `Liebesu_Clash_2.4.3_x64-setup.exe`（不是 `clash-verge_*-setup.exe`）
- 内部可执行文件：`Liebesu_Clash.exe`

---

## 🧪 **测试验证**

### **构建后检查**

1. **检查生成的安装包名称**：应包含 `Liebesu_Clash`
2. **检查安装后的应用路径**：`Program Files\Liebesu_Clash\Liebesu_Clash.exe`
3. **检查应用数据路径**：`%APPDATA%\io.github.liebesu.clash\`

### **运行时检查**

1. **应用标题栏**：显示 `Liebesu_Clash`
2. **系统托盘**：显示正确的应用名称
3. **卸载程序列表**：显示 `Liebesu_Clash`

---

## 📋 **实施检查清单**

- [ ] 修复 `windows-personal.yml` 配置生成步骤
- [ ] 验证所有 Tauri 配置文件标识符一致
- [ ] 添加构建验证步骤
- [ ] 测试构建输出
- [ ] 验证安装和启动
- [ ] 更新其他相关工作流文件
- [ ] 文档更新

---

## 🚀 **快速修复**

如果需要立即修复，可以：

1. **手动修改** `windows-personal.yml` 文件
2. **使用提供的** `fix-github-actions-config.yml` 作为参考
3. **重新触发构建**并验证输出
4. **测试生成的安装包**是否能正常启动

这个修复方案应该彻底解决 Windows 应用无法启动的问题。问题的根源是配置不一致，而不是依赖项缺失。
