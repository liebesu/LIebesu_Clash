# Windows Startup Fix for Clash Verge Rev

## Quick Fix / 快速修复

### Step 1: Run Automatic Fix Script

1. **Right-click** on `fix-windows-startup.bat`
2. Select **"Run as administrator"** / 选择"以管理员身份运行"
3. Wait for completion / 等待完成
4. Restart the application / 重启应用程序

### Step 2: If Still Not Working

1. **Right-click** on PowerShell and select **"Run as administrator"**
2. Navigate to the project folder
3. Run: `.\diagnose-startup.ps1`
4. Follow the diagnostic results / 根据诊断结果操作

### Step 3: If Application Not Found / 如果应用程序未找到

1. Run: `.\find-application.ps1`
2. This will search your entire system for the application
3. If found, note the location and try running from there
4. If not found, you may need to reinstall the application

## Common Issues & Solutions / 常见问题与解决方案

### 1. WebView2 Runtime Missing / WebView2运行时缺失

**Problem**: Application crashes immediately or shows blank window
**Solution**: Download and install WebView2 Runtime

- URL: https://go.microsoft.com/fwlink/p/?LinkId=2124703
- The fix script will do this automatically

### 2. Visual C++ Redistributable Missing / VC++运行库缺失

**Problem**: Application fails to start with DLL errors
**Solution**: Install Visual C++ Redistributable 2015-2022

- x64: https://aka.ms/vs/17/release/vc_redist.x64.exe
- x86: https://aka.ms/vs/17/release/vc_redist.x86.exe
- The fix script will do this automatically

### 3. Windows SmartScreen Blocking / Windows安全中心阻止

**Problem**: "Windows protected your PC" message
**Solution**:

1. Click "More info" / 点击"更多信息"
2. Click "Run anyway" / 点击"仍要运行"
   OR temporarily disable SmartScreen:
3. Settings > Privacy & Security > Windows Security > App & browser control
4. Set "Check apps and files" to "Off" / 将"检查应用和文件"设为"关闭"

### 4. Antivirus Software Blocking / 杀毒软件阻止

**Problem**: Application detected as false positive
**Solution**: Add to antivirus whitelist

- Add entire installation folder to exclusions
- Add process name to exclusions

### 5. Missing Administrator Privileges / 缺少管理员权限

**Problem**: Service installation fails
**Solution**: Always run as administrator

- Right-click application -> "Run as administrator"

### 6. Application File Not Found / 应用程序文件未找到 ⭐

**Problem**: "[ERROR] Application file not found" in diagnostic output
**This is the most common issue!** / 这是最常见的问题！

**Possible Causes / 可能原因:**

- Incomplete installation / 安装不完整
- Antivirus software removed the file / 杀毒软件删除了文件
- Installation interrupted / 安装被中断
- Wrong installation path / 安装路径错误

**Solutions / 解决方案:**

1. **First, run the finder script / 首先运行查找脚本:**
   ```powershell
   .\find-application.ps1
   ```
2. **If not found, reinstall / 如果未找到，重新安装:**
   - Download fresh installer / 下载新的安装程序
   - Temporarily disable antivirus / 临时禁用杀毒软件
   - Run installer as administrator / 以管理员身份运行安装程序
   - Choose custom installation path if needed / 如需要选择自定义安装路径

## Advanced Troubleshooting / 高级故障排除

### Check Windows Event Viewer / 检查Windows事件查看器

1. Press `Win + R`, type `eventvwr.msc`
2. Navigate to Windows Logs > Application
3. Look for errors related to "clash", "verge", or "tauri"

### Reset Network Settings / 重置网络设置

```cmd
netsh int tcp reset
netsh winsock reset
```

### Clear Application Data / 清除应用数据

Delete these files if they exist:

- `%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\window-state.json`
- `%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\.window-state.json`

## System Requirements / 系统要求

- Windows 10 version 1903 or later / Windows 10 版本 1903 或更高
- WebView2 Runtime
- Visual C++ Redistributable 2015-2022
- Administrator privileges for first run / 首次运行需要管理员权限

## Still Having Issues? / 仍有问题？

1. Check Windows version compatibility / 检查Windows版本兼容性
2. Try running in compatibility mode / 尝试兼容模式运行
3. Temporarily disable all antivirus software / 临时禁用所有杀毒软件
4. Check for Windows system file corruption: `sfc /scannow`
5. Contact support with diagnostic script output / 联系支持并提供诊断脚本输出

## Files in This Solution / 此解决方案中的文件

- `fix-windows-startup.bat` - Automatic fix script / 自动修复脚本
- `diagnose-startup.ps1` - Detailed diagnostic script / 详细诊断脚本
- `find-application.ps1` - Application finder script / 应用程序查找脚本
- `WINDOWS_STARTUP_FIX_README.md` - This documentation / 本文档

**Note**: Both scripts require administrator privileges to function properly.
**注意**: 两个脚本都需要管理员权限才能正常运行。
