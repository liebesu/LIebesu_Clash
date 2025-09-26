@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: =============================================================================
:: LIebesu_Clash Windows 11 本地编译脚本
:: 支持自动环境检查、依赖安装、项目编译
:: =============================================================================

echo.
echo ===============================================================================
echo                   LIebesu_Clash Windows 11 本地编译脚本
echo ===============================================================================
echo.

:: 设置变量
set "PROJECT_NAME=LIebesu_Clash"
set "BUILD_DIR=%~dp0"
set "LOG_FILE=%BUILD_DIR%build_log.txt"
set "ERROR_FILE=%BUILD_DIR%build_error.txt"

:: 清理旧日志
if exist "%LOG_FILE%" del "%LOG_FILE%"
if exist "%ERROR_FILE%" del "%ERROR_FILE%"

echo [%TIME%] 开始编译 %PROJECT_NAME% >> "%LOG_FILE%"
echo 📋 编译日志: %LOG_FILE%
echo 🚨 错误日志: %ERROR_FILE%
echo.

:: =============================================================================
:: 第一步：环境检查
:: =============================================================================
echo 🔍 第一步：检查编译环境...
call :check_environment
if !ERRORLEVEL! neq 0 (
    echo ❌ 环境检查失败，请查看错误日志: %ERROR_FILE%
    goto :error_exit
)

:: =============================================================================
:: 第二步：安装项目依赖
:: =============================================================================
echo.
echo 📦 第二步：安装项目依赖...
call :install_dependencies
if !ERRORLEVEL! neq 0 (
    echo ❌ 依赖安装失败，请查看错误日志: %ERROR_FILE%
    goto :error_exit
)

:: =============================================================================
:: 第三步：配置编译环境
:: =============================================================================
echo.
echo ⚙️ 第三步：配置编译环境...
call :configure_build_environment
if !ERRORLEVEL! neq 0 (
    echo ❌ 环境配置失败，请查看错误日志: %ERROR_FILE%
    goto :error_exit
)

:: =============================================================================
:: 第四步：执行编译
:: =============================================================================
echo.
echo 🛠️ 第四步：开始编译...
call :build_project
if !ERRORLEVEL! neq 0 (
    echo ❌ 编译失败，请查看错误日志: %ERROR_FILE%
    goto :error_exit
)

:: =============================================================================
:: 第五步：编译后处理
:: =============================================================================
echo.
echo 🎁 第五步：编译后处理...
call :post_build_process
if !ERRORLEVEL! neq 0 (
    echo ⚠️ 后处理出现警告，请查看日志
)

echo.
echo ===============================================================================
echo                            ✅ 编译成功完成！
echo ===============================================================================
echo.
call :show_build_results
echo.
echo 📋 完整日志: %LOG_FILE%
echo 🎊 编译完成时间: %TIME%
echo.
pause
exit /b 0

:: =============================================================================
:: 函数定义区域
:: =============================================================================

:check_environment
echo   ├─ 检查操作系统版本... >> "%LOG_FILE%"
ver | findstr /i "Version 10.0" >nul
if !ERRORLEVEL! neq 0 (
    echo ❌ 需要 Windows 10/11 系统 >> "%ERROR_FILE%"
    exit /b 1
)
echo   ✅ Windows 系统版本检查通过

echo   ├─ 检查 PowerShell...
powershell -Command "Write-Host 'PowerShell 可用'" >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo ❌ PowerShell 不可用 >> "%ERROR_FILE%"
    exit /b 1
)
echo   ✅ PowerShell 检查通过

echo   ├─ 检查 Git...
git --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo ❌ Git 未安装，请从 https://git-scm.com 安装 >> "%ERROR_FILE%"
    exit /b 1
)
echo   ✅ Git 检查通过

echo   ├─ 检查 Node.js...
node --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo ❌ Node.js 未安装，请从 https://nodejs.org 安装 LTS 版本 >> "%ERROR_FILE%"
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo   ✅ Node.js 版本: %NODE_VERSION%

echo   ├─ 检查 pnpm...
pnpm --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo   ⚠️ pnpm 未安装，正在安装...
    npm install -g pnpm >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
    if !ERRORLEVEL! neq 0 (
        echo ❌ pnpm 安装失败 >> "%ERROR_FILE%"
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VERSION=%%i
echo   ✅ pnpm 版本: %PNPM_VERSION%

echo   ├─ 检查 Rust...
rustc --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo ❌ Rust 未安装，请从 https://rustup.rs 安装 >> "%ERROR_FILE%"
    echo   💡 安装命令: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh >> "%ERROR_FILE%"
    exit /b 1
)
for /f "tokens=*" %%i in ('rustc --version') do set RUST_VERSION=%%i
echo   ✅ Rust 版本: %RUST_VERSION%

echo   ├─ 检查 Cargo...
cargo --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo ❌ Cargo 未安装 >> "%ERROR_FILE%"
    exit /b 1
)
for /f "tokens=*" %%i in ('cargo --version') do set CARGO_VERSION=%%i
echo   ✅ Cargo 版本: %CARGO_VERSION%

echo   ├─ 检查 Visual Studio Build Tools...
where cl >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo   ⚠️ MSVC 编译器未找到，检查 Visual Studio Build Tools...
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        echo   ✅ 找到 VS2022 Build Tools
    ) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
        echo   ✅ 找到 VS2022 Community
    ) else (
        echo ❌ Visual Studio Build Tools 未安装 >> "%ERROR_FILE%"
        echo   💡 请安装 Visual Studio 2022 Build Tools 或 Community 版本 >> "%ERROR_FILE%"
        exit /b 1
    )
)

exit /b 0

:install_dependencies
echo   ├─ 安装前端依赖... >> "%LOG_FILE%"
echo   📦 正在安装前端依赖（可能需要几分钟）...

:: 清理缓存
echo   ├─ 清理 pnpm 缓存...
pnpm store prune >>"%LOG_FILE%" 2>>"%ERROR_FILE%"

:: 安装依赖
pnpm install --frozen-lockfile >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
if !ERRORLEVEL! neq 0 (
    echo   ❌ 前端依赖安装失败，尝试清理重装...
    rmdir /s /q node_modules >nul 2>&1
    pnpm install >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
    if !ERRORLEVEL! neq 0 (
        echo ❌ 前端依赖安装失败 >> "%ERROR_FILE%"
        exit /b 1
    )
)
echo   ✅ 前端依赖安装完成

echo   ├─ 检查 Rust 工具链... >> "%LOG_FILE%"
rustup target list --installed | findstr "x86_64-pc-windows-msvc" >nul
if !ERRORLEVEL! neq 0 (
    echo   📦 安装 Windows MSVC 目标...
    rustup target add x86_64-pc-windows-msvc >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
    if !ERRORLEVEL! neq 0 (
        echo ❌ Rust 目标安装失败 >> "%ERROR_FILE%"
        exit /b 1
    )
)
echo   ✅ Rust 工具链检查完成

exit /b 0

:configure_build_environment
echo   ├─ 配置编译环境变量... >> "%LOG_FILE%"

:: 设置内存限制
set "NODE_OPTIONS=--max_old_space_size=8192"
echo   ✅ Node.js 内存限制: 8GB

:: 设置 Rust 环境
set "RUST_BACKTRACE=1"
set "CARGO_INCREMENTAL=0"
echo   ✅ Rust 环境变量已设置

:: 检查并设置 MSVC 环境
call :setup_msvc_environment
if !ERRORLEVEL! neq 0 (
    exit /b 1
)

:: 创建构建目录
if not exist "dist" mkdir dist
if not exist "logs" mkdir logs
echo   ✅ 构建目录已创建

exit /b 0

:setup_msvc_environment
echo   ├─ 设置 MSVC 编译环境...

:: 尝试设置 Visual Studio 环境
if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
    echo   ✅ 使用 VS2022 Community 环境
    call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>>"%ERROR_FILE%"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    echo   ✅ 使用 VS2022 Build Tools 环境
    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>>"%ERROR_FILE%"
) else if exist "C:\Program Files\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat" (
    echo   ✅ 使用 VS2019 Community 环境
    call "C:\Program Files\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>>"%ERROR_FILE%"
) else (
    echo ❌ 未找到 Visual Studio 环境配置 >> "%ERROR_FILE%"
    exit /b 1
)

exit /b 0

:build_project
echo   ├─ 开始编译项目... >> "%LOG_FILE%"

:: 记录开始时间
for /f "tokens=*" %%i in ('powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set BUILD_START=%%i
echo   🕐 编译开始时间: %BUILD_START%

:: 预构建步骤
echo   ├─ 执行预构建步骤...
pnpm run prebuild x86_64-pc-windows-msvc >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
if !ERRORLEVEL! neq 0 (
    echo ❌ 预构建失败 >> "%ERROR_FILE%"
    exit /b 1
)
echo   ✅ 预构建完成

:: 主要编译
echo   ├─ 执行主编译（这可能需要 10-30 分钟）...
echo   📝 编译详细日志记录到: %LOG_FILE%

pnpm run build >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
if !ERRORLEVEL! neq 0 (
    echo ❌ 主编译失败 >> "%ERROR_FILE%"
    
    :: 尝试快速编译
    echo   ⚠️ 尝试快速编译模式...
    pnpm run build:fast >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
    if !ERRORLEVEL! neq 0 (
        echo ❌ 快速编译也失败 >> "%ERROR_FILE%"
        exit /b 1
    )
    echo   ✅ 快速编译成功
) else (
    echo   ✅ 标准编译成功
)

:: 记录结束时间
for /f "tokens=*" %%i in ('powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set BUILD_END=%%i
echo   🕐 编译完成时间: %BUILD_END%

exit /b 0

:post_build_process
echo   ├─ 执行编译后处理... >> "%LOG_FILE%"

:: 检查编译产物
set "BUILD_OUTPUT_DIR=src-tauri\target\release\bundle"
if not exist "%BUILD_OUTPUT_DIR%" (
    echo ❌ 编译输出目录不存在: %BUILD_OUTPUT_DIR% >> "%ERROR_FILE%"
    exit /b 1
)

:: 查找编译产物
echo   ├─ 查找编译产物...
if exist "%BUILD_OUTPUT_DIR%\nsis\*.exe" (
    echo   ✅ 找到 NSIS 安装包
    for %%f in ("%BUILD_OUTPUT_DIR%\nsis\*.exe") do (
        echo     📦 %%~nxf >> "%LOG_FILE%"
    )
)

if exist "%BUILD_OUTPUT_DIR%\msi\*.msi" (
    echo   ✅ 找到 MSI 安装包
    for %%f in ("%BUILD_OUTPUT_DIR%\msi\*.msi") do (
        echo     📦 %%~nxf >> "%LOG_FILE%"
    )
)

:: 运行后构建脚本（如果存在）
if exist "scripts\post-build-windows.bat" (
    echo   ├─ 运行后构建脚本...
    call "scripts\post-build-windows.bat" >>"%LOG_FILE%" 2>>"%ERROR_FILE%"
)

:: 复制到 dist 目录
echo   ├─ 复制编译产物到 dist 目录...
if not exist "dist" mkdir dist

if exist "%BUILD_OUTPUT_DIR%\nsis\*.exe" (
    copy "%BUILD_OUTPUT_DIR%\nsis\*.exe" "dist\" >nul 2>>"%ERROR_FILE%"
)
if exist "%BUILD_OUTPUT_DIR%\msi\*.msi" (
    copy "%BUILD_OUTPUT_DIR%\msi\*.msi" "dist\" >nul 2>>"%ERROR_FILE%"
)

echo   ✅ 编译后处理完成

exit /b 0

:show_build_results
echo 📦 编译产物:
echo ===============================================================================

:: 显示编译产物大小和信息
for %%f in ("dist\*.exe") do (
    echo   🚀 可执行安装包: %%~nxf ^(%%~zf 字节^)
)
for %%f in ("dist\*.msi") do (
    echo   📋 MSI 安装包: %%~nxf ^(%%~zf 字节^)
)

echo.
echo 📁 编译产物位置: %BUILD_DIR%dist\
echo 📝 完整日志: %LOG_FILE%

:: 显示编译统计
echo.
echo 📊 编译统计:
echo -------------------------------------------------------------------------------
if exist "%LOG_FILE%" (
    for /f "tokens=*" %%i in ('find /c "✅" "%LOG_FILE%"') do echo   成功步骤: %%i
    for /f "tokens=*" %%i in ('find /c "❌" "%LOG_FILE%"') do echo   失败步骤: %%i
    for /f "tokens=*" %%i in ('find /c "⚠️" "%LOG_FILE%"') do echo   警告步骤: %%i
)

exit /b 0

:error_exit
echo.
echo ===============================================================================
echo                            ❌ 编译失败！
echo ===============================================================================
echo.
echo 🚨 错误详情请查看: %ERROR_FILE%
echo 📋 完整日志请查看: %LOG_FILE%
echo.
echo 💡 常见解决方案:
echo   1. 确保所有依赖已正确安装
echo   2. 检查网络连接（下载依赖需要网络）
echo   3. 确保有足够的磁盘空间（至少 5GB）
echo   4. 以管理员身份运行此脚本
echo   5. 临时关闭杀毒软件和防火墙
echo.
echo 📞 如需帮助，请将错误日志和完整日志一起提供
echo.
pause
exit /b 1

:: =============================================================================
:: 脚本结束
:: =============================================================================
