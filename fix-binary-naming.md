# 🔍 **二进制文件命名问题分析与修复**

## **发现的问题**

### **1. 配置不一致**
| 配置文件 | 设置项 | 值 | 影响 |
|---------|-------|----|----- |
| `Cargo.toml` | `name` | `"clash-verge"` | ❌ 生成 `clash-verge.exe` |
| `Cargo.toml` | `default-run` | `"clash-verge"` | ❌ 默认二进制名 |
| `tauri.*.conf.json` | `productName` | `"Liebesu_Clash"` | ✅ 期望产品名 |

### **2. Tauri 构建行为**
- **Tauri 1.x**：最终可执行文件名 = `productName` 
- **Tauri 2.x**：最终可执行文件名 = `Cargo.toml` 中的 `name`
- **您的版本**：Tauri 2.8.5 (基于 `Cargo.toml`)

### **3. 实际构建结果**
```
期望：Liebesu_Clash.exe
实际：clash-verge.exe
安装路径：C:\Program Files\Liebesu_Clash\clash-verge.exe
```

## **🛠️ 修复方案**

### **方案A：修改 Cargo.toml（推荐）**
将二进制名改为与产品名一致：

```toml
[package]
name = "liebesu-clash"  # 修改为与产品名匹配
default-run = "liebesu-clash"
```

**优点**：彻底解决命名不一致
**缺点**：需要重新构建，可能影响现有脚本

### **方案B：修改诊断脚本（临时）**
更新诊断脚本以搜索实际的文件名：

```powershell
$possiblePaths = @(
    "$env:ProgramFiles\Liebesu_Clash\clash-verge.exe",  # 实际可能的路径
    "$env:ProgramFiles\Liebesu_Clash\Liebesu_Clash.exe",
    # ... 其他路径
)
```

**优点**：不影响构建，快速修复
**缺点**：治标不治本

### **方案C：混合方案（推荐）**
1. 短期：更新诊断脚本支持两种命名
2. 长期：修改 Cargo.toml 统一命名

## **🚀 立即执行的修复**

