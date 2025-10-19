# 增强的启动日志系统

## 🔍 **新增的诊断功能**

为了解决 Windows 上双击无反应的问题，我们添加了详细的启动日志系统。

### **日志位置**

根据系统不同，日志文件位于：

- **Windows**: `%APPDATA%\io.github.liebesu.clash\logs\`
- **macOS**: `~/Library/Logs/io.github.liebesu.clash/`
- **Linux**: `~/.local/share/io.github.liebesu.clash/logs/`

### **诊断控制台模式（仅 Windows）**

在 Windows 发布版本中，应用现在会：

1. **显示诊断控制台**：双击应用时会显示控制台窗口
2. **实时显示启动日志**：所有启动步骤都会在控制台中显示
3. **错误对话框**：如果出现致命错误，会显示 Windows 消息框
4. **保持窗口打开**：出错时控制台窗口保持打开以便查看错误

### **增强的启动日志**

现在会记录以下信息：

```
=== Liebesu_Clash 应用启动 ===
时间: 2024-01-20 10:30:45 UTC
版本: 2.4.3
目标架构: x86_64
目标操作系统: windows
工作目录: "C:\Program Files\Liebesu_Clash"
可执行文件路径: Ok("C:\Program Files\Liebesu_Clash\Liebesu_Clash.exe")
PATH 长度: 1234
Windows 子系统: GUI
TEMP 目录: C:\Users\User\AppData\Local\Temp
APPDATA 目录: C:\Users\User\AppData\Roaming
LOCALAPPDATA 目录: C:\Users\User\AppData\Local
开始单例检查...
创建 Tauri 构建器...
Tauri 应用设置阶段开始...
设置自启动插件...
自启动插件设置成功
设置深度链接...
深度链接设置成功
设置窗口状态管理...
窗口状态设置成功
执行主要设置操作...
设置应用句柄...
设置异步解析器...
设置同步解析器...
Tauri 初始化完成
构建 Tauri 应用程序...
✅ Tauri 应用程序构建成功，开始运行事件循环...
🚀 应用程序就绪事件
```

### **错误处理增强**

1. **Panic 捕获**：捕获所有 panic 并显示在控制台和对话框中
2. **构建失败处理**：如果 Tauri 构建失败，显示详细错误信息
3. **Windows API 错误显示**：使用系统消息框显示关键错误
4. **日志文件同步**：所有控制台输出同时写入日志文件

### **使用方法**

#### **对于用户**

1. 双击 `Liebesu_Clash.exe` 启动应用
2. 如果出现问题，会显示诊断控制台窗口
3. 截图控制台内容并提供给开发者
4. 日志文件也保存在 `%APPDATA%\io.github.liebesu.clash\logs\` 中

#### **对于开发者**

查看构建输出中的详细信息：

```bash
# GitHub Actions 中现在会显示：
Generated tauri.personal.conf.json content:
{
  "identifier": "io.github.liebesu.clash",
  "productName": "Liebesu_Clash",
  ...
}

Product: Liebesu_Clash
File: Liebesu_Clash_2.4.3_x64-setup.exe
```

### **常见启动问题诊断**

根据控制台输出可以判断问题：

1. **如果显示 "开始单例检查..." 后卡住**
   - 端口被占用或防火墙阻止

2. **如果显示 "创建 Tauri 构建器..." 后失败**
   - WebView2 问题或系统兼容性问题

3. **如果显示 "设置自启动插件失败"**
   - 权限问题或注册表访问被阻止

4. **如果显示 "构建 Tauri 应用程序失败"**
   - 关键系统组件缺失或配置错误

### **临时禁用诊断控制台**

如果需要禁用诊断控制台（正常用户使用），可以：

1. 重新编译时使用 `debug_assertions` 模式
2. 或者修改 `main.rs` 中的条件编译

### **日志级别配置**

日志级别可通过应用设置调整：

- `Off`: 不记录日志
- `Error`: 只记录错误
- `Warn`: 警告和错误
- `Info`: 信息、警告和错误（默认）
- `Debug`: 调试信息
- `Trace`: 所有信息（最详细）

这个增强的日志系统应该能帮助快速诊断 Windows 启动问题的根本原因。
