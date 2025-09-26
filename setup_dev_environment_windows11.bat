@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: =============================================================================
:: LIebesu_Clash Windows 11 开发环境自动安装脚本
:: 自动安装所有必需的开发工具和依赖
:: =============================================================================

echo.
echo ===============================================================================
echo          LIebesu_Clash Windows 11 开发环境自动安装脚本
echo ===============================================================================
echo.
echo ⚠️  此脚本将安装以下开发工具:
echo     - Node.js LTS (如果未安装)
echo     - Rust 工具链
echo     - Visual Studio Build Tools 2022
echo     - Git (如果未安装)
echo     - pnpm 包管理器
echo.
echo 📋 预计下载大小: 约 2-3 GB
echo ⏱️  预计安装时间: 15-30 分钟
echo.
set /p "confirm=是否继续安装？(y/N): "
if /i not "%confirm%"=="y" (
    echo 安装已取消
    pause
    exit /b 0
)

echo.
echo 🚀 开始安装开发环境...

:: 创建临时目录
set "TEMP_DIR=%TEMP%\liebesu_clash_setup"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: =============================================================================
:: 检查和安装 PowerShell 7 (可选)
:: =============================================================================
echo.
echo 📦 检查 PowerShell...
powershell -Command "Write-Host 'PowerShell 可用'" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo ✅ PowerShell 已安装
) else (
    echo ❌ PowerShell 不可用，请手动安装
)

:: =============================================================================
:: 检查和安装 Git
:: =============================================================================
echo.
echo 📦 检查 Git...
git --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo ✅ Git 已安装
) else (
    echo 📥 正在下载并安装 Git...
    
    :: 下载 Git
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe' -OutFile '%TEMP_DIR%\git-installer.exe'"
    
    if exist "%TEMP_DIR%\git-installer.exe" (
        echo 🔧 安装 Git...
        "%TEMP_DIR%\git-installer.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
        echo ✅ Git 安装完成
    ) else (
        echo ❌ Git 下载失败，请手动安装: https://git-scm.com/
        pause
        exit /b 1
    )
)

:: =============================================================================
:: 检查和安装 Node.js
:: =============================================================================
echo.
echo 📦 检查 Node.js...
node --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo ✅ Node.js 已安装: !NODE_VERSION!
) else (
    echo 📥 正在下载并安装 Node.js LTS...
    
    :: 下载 Node.js
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.9.0/node-v20.9.0-x64.msi' -OutFile '%TEMP_DIR%\nodejs-installer.msi'"
    
    if exist "%TEMP_DIR%\nodejs-installer.msi" (
        echo 🔧 安装 Node.js...
        msiexec /i "%TEMP_DIR%\nodejs-installer.msi" /quiet /norestart
        echo ✅ Node.js 安装完成
        
        :: 刷新环境变量
        call :refresh_environment
    ) else (
        echo ❌ Node.js 下载失败，请手动安装: https://nodejs.org/
        pause
        exit /b 1
    )
)

:: =============================================================================
:: 安装 pnpm
:: =============================================================================
echo.
echo 📦 检查 pnpm...
pnpm --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VERSION=%%i
    echo ✅ pnpm 已安装: !PNPM_VERSION!
) else (
    echo 📥 正在安装 pnpm...
    npm install -g pnpm
    if !ERRORLEVEL! equ 0 (
        echo ✅ pnpm 安装完成
    ) else (
        echo ❌ pnpm 安装失败
        pause
        exit /b 1
    )
)

:: =============================================================================
:: 检查和安装 Rust
:: =============================================================================
echo.
echo 📦 检查 Rust...
rustc --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('rustc --version') do set RUST_VERSION=%%i
    echo ✅ Rust 已安装: !RUST_VERSION!
) else (
    echo 📥 正在下载并安装 Rust...
    
    :: 下载 Rustup
    powershell -Command "Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile '%TEMP_DIR%\rustup-init.exe'"
    
    if exist "%TEMP_DIR%\rustup-init.exe" (
        echo 🔧 安装 Rust...
        "%TEMP_DIR%\rustup-init.exe" -y --default-toolchain stable --profile default
        echo ✅ Rust 安装完成
        
        :: 刷新环境变量
        call :refresh_environment
        
        :: 添加 Windows MSVC 目标
        rustup target add x86_64-pc-windows-msvc
    ) else (
        echo ❌ Rust 下载失败，请手动安装: https://rustup.rs/
        pause
        exit /b 1
    )
)

:: =============================================================================
:: 检查和安装 Visual Studio Build Tools
:: =============================================================================
echo.
echo 📦 检查 Visual Studio Build Tools...

:: 检查是否已安装
where cl >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo ✅ Visual Studio Build Tools 已安装
) else (
    :: 检查常见安装路径
    set "VS_FOUND=0"
    if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VS_FOUND=1"
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VS_FOUND=1"
    
    if !VS_FOUND! equ 1 (
        echo ✅ Visual Studio 环境已安装
    ) else (
        echo 📥 正在下载并安装 Visual Studio Build Tools...
        
        :: 下载 VS Build Tools
        powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_buildtools.exe' -OutFile '%TEMP_DIR%\vs_buildtools.exe'"
        
        if exist "%TEMP_DIR%\vs_buildtools.exe" (
            echo 🔧 安装 Visual Studio Build Tools...
            echo    这可能需要 10-20 分钟，请耐心等待...
            "%TEMP_DIR%\vs_buildtools.exe" --quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows10SDK.19041
            echo ✅ Visual Studio Build Tools 安装完成
        ) else (
            echo ❌ Visual Studio Build Tools 下载失败
            echo 💡 请手动安装: https://visualstudio.microsoft.com/visual-cpp-build-tools/
            pause
            exit /b 1
        )
    )
)

:: =============================================================================
:: 验证安装
:: =============================================================================
echo.
echo 🔍 验证安装结果...
echo ===============================================================================

call :refresh_environment

:: 验证 Git
git --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('git --version') do echo ✅ Git: %%i
) else (
    echo ❌ Git 验证失败
)

:: 验证 Node.js
node --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('node --version') do echo ✅ Node.js: %%i
) else (
    echo ❌ Node.js 验证失败
)

:: 验证 pnpm
pnpm --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('pnpm --version') do echo ✅ pnpm: %%i
) else (
    echo ❌ pnpm 验证失败
)

:: 验证 Rust
rustc --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('rustc --version') do echo ✅ Rust: %%i
) else (
    echo ❌ Rust 验证失败
)

:: 验证 Cargo
cargo --version >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=*" %%i in ('cargo --version') do echo ✅ Cargo: %%i
) else (
    echo ❌ Cargo 验证失败
)

:: =============================================================================
:: 清理和完成
:: =============================================================================
echo.
echo 🧹 清理临时文件...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"

echo.
echo ===============================================================================
echo                        ✅ 开发环境安装完成！
echo ===============================================================================
echo.
echo 🎊 恭喜！所有开发工具已安装完成。
echo.
echo 📋 下一步:
echo    1. 重启命令提示符或 PowerShell
echo    2. 运行 build_windows11.bat 开始编译项目
echo    3. 或运行 build_quick_windows11.bat 进行快速编译
echo.
echo 💡 如果遇到问题，请：
echo    1. 重启计算机以确保环境变量生效
echo    2. 以管理员身份运行编译脚本
echo    3. 检查防火墙和杀毒软件设置
echo.
pause
exit /b 0

:: =============================================================================
:: 辅助函数
:: =============================================================================

:refresh_environment
echo   🔄 刷新环境变量...
:: 通过注册表重新加载环境变量
for /f "skip=2 tokens=3*" %%i in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%i %%j"
for /f "skip=2 tokens=3*" %%i in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSTEM_PATH=%%i %%j"
set "PATH=%SYSTEM_PATH%;%USER_PATH%"
exit /b 0
