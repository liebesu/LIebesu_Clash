@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: =============================================================================
:: LIebesu_Clash Windows 11 快速编译脚本（简化版）
:: 适用于已配置好环境的开发者
:: =============================================================================

echo.
echo ===============================================================================
echo              LIebesu_Clash Windows 11 快速编译脚本
echo ===============================================================================
echo.

:: 检查必要环境
where rust >nul 2>&1 || (echo ❌ Rust 未安装 & pause & exit /b 1)
where node >nul 2>&1 || (echo ❌ Node.js 未安装 & pause & exit /b 1)
where pnpm >nul 2>&1 || (echo ❌ pnpm 未安装 & pause & exit /b 1)

echo ✅ 环境检查通过，开始快速编译...

:: 设置环境变量
set "NODE_OPTIONS=--max_old_space_size=8192"
set "RUST_BACKTRACE=1"
set "CARGO_INCREMENTAL=0"

:: 快速编译流程
echo.
echo 📦 1. 安装依赖...
pnpm install --frozen-lockfile || (echo ❌ 依赖安装失败 & pause & exit /b 1)

echo.
echo 🛠️ 2. 预构建...
pnpm run prebuild x86_64-pc-windows-msvc || (echo ❌ 预构建失败 & pause & exit /b 1)

echo.
echo 🚀 3. 开始编译（快速模式）...
echo    编译可能需要 5-15 分钟，请耐心等待...
pnpm run build:fast || pnpm run build || (echo ❌ 编译失败 & pause & exit /b 1)

echo.
echo 📦 4. 处理编译产物...
if not exist dist mkdir dist
if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    copy "src-tauri\target\release\bundle\nsis\*.exe" "dist\" >nul
    echo ✅ 安装包已复制到 dist 目录
)

echo.
echo ===============================================================================
echo                            ✅ 快速编译完成！
echo ===============================================================================
echo.
for %%f in ("dist\*.exe") do echo   📦 %%~nxf ^(%%~zf 字节^)
echo.
pause
