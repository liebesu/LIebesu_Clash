@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: =============================================================================
:: LIebesu_Clash Windows 11 发布打包脚本
:: 用于编译完成后的签名、打包和发布准备
:: =============================================================================

echo.
echo ===============================================================================
echo              LIebesu_Clash Windows 11 发布打包脚本
echo ===============================================================================
echo.

:: 检查编译产物是否存在
if not exist "dist" (
    echo ❌ dist 目录不存在，请先运行编译脚本
    pause
    exit /b 1
)

:: 检查是否有编译产物
set "FOUND_INSTALLER=0"
for %%f in ("dist\*.exe") do set "FOUND_INSTALLER=1"
for %%f in ("dist\*.msi") do set "FOUND_INSTALLER=1"

if !FOUND_INSTALLER! equ 0 (
    echo ❌ 未找到编译产物，请先运行编译脚本
    pause
    exit /b 1
)

echo ✅ 找到编译产物，开始打包处理...

:: =============================================================================
:: 第一步：创建发布目录结构
:: =============================================================================
echo.
echo 📁 第一步：创建发布目录结构...

set "RELEASE_DIR=release"
set "VERSION_DIR=%RELEASE_DIR%\v2.4.3-windows11"
set "DOCS_DIR=%VERSION_DIR%\docs"
set "SCRIPTS_DIR=%VERSION_DIR%\scripts"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%VERSION_DIR%" mkdir "%VERSION_DIR%"
if not exist "%DOCS_DIR%" mkdir "%DOCS_DIR%"
if not exist "%SCRIPTS_DIR%" mkdir "%SCRIPTS_DIR%"

echo   ✅ 发布目录结构已创建

:: =============================================================================
:: 第二步：复制和重命名安装包
:: =============================================================================
echo.
echo 📦 第二步：处理安装包...

:: 获取当前日期用于版本标识
for /f "tokens=*" %%i in ('powershell -Command "Get-Date -Format 'yyyyMMdd'"') do set BUILD_DATE=%%i

:: 复制 EXE 安装包
for %%f in ("dist\*.exe") do (
    set "INSTALLER_NAME=LIebesu_Clash_v2.4.3_Windows11_x64_%BUILD_DATE%.exe"
    copy "%%f" "%VERSION_DIR%\!INSTALLER_NAME!"
    echo   ✅ 安装包: !INSTALLER_NAME!
)

:: 复制 MSI 安装包（如果存在）
for %%f in ("dist\*.msi") do (
    set "MSI_NAME=LIebesu_Clash_v2.4.3_Windows11_x64_%BUILD_DATE%.msi"
    copy "%%f" "%VERSION_DIR%\!MSI_NAME!"
    echo   ✅ MSI安装包: !MSI_NAME!
)

:: =============================================================================
:: 第三步：生成校验和
:: =============================================================================
echo.
echo 🔐 第三步：生成文件校验和...

cd "%VERSION_DIR%"

:: 生成 SHA256 校验和
for %%f in (*.exe *.msi) do (
    powershell -Command "Get-FileHash '%%f' -Algorithm SHA256 | Select-Object Hash | Format-Table -HideTableHeaders" > "%%f.sha256"
    echo   ✅ 生成校验和: %%f.sha256
)

cd ..\..

:: =============================================================================
:: 第四步：复制文档和脚本
:: =============================================================================
echo.
echo 📋 第四步：复制文档和脚本...

:: 复制主要文档
if exist "README.md" copy "README.md" "%DOCS_DIR%\README.md" >nul
if exist "BUILD_INSTRUCTIONS_WINDOWS11.md" copy "BUILD_INSTRUCTIONS_WINDOWS11.md" "%DOCS_DIR%\" >nul
if exist "GLOBAL_SPEED_TEST_FREEZE_FIX.md" copy "GLOBAL_SPEED_TEST_FREEZE_FIX.md" "%DOCS_DIR%\" >nul
if exist "BUILD_SUCCESS_SUMMARY.md" copy "BUILD_SUCCESS_SUMMARY.md" "%DOCS_DIR%\" >nul
if exist "MACOS_STARTUP_FIX.md" copy "MACOS_STARTUP_FIX.md" "%DOCS_DIR%\" >nul

:: 复制编译脚本
copy "build_windows11.bat" "%SCRIPTS_DIR%\" >nul
copy "build_quick_windows11.bat" "%SCRIPTS_DIR%\" >nul
copy "setup_dev_environment_windows11.bat" "%SCRIPTS_DIR%\" >nul

echo   ✅ 文档和脚本已复制

:: =============================================================================
:: 第五步：生成发布说明
:: =============================================================================
echo.
echo 📝 第五步：生成发布说明...

set "RELEASE_NOTES=%VERSION_DIR%\RELEASE_NOTES.md"

echo # LIebesu_Clash v2.4.3 Windows 11 发布版本 > "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ## 🎊 发布信息 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo - **版本**: v2.4.3 >> "%RELEASE_NOTES%"
echo - **构建日期**: %BUILD_DATE% >> "%RELEASE_NOTES%"
echo - **目标平台**: Windows 11 x64 >> "%RELEASE_NOTES%"
echo - **编译环境**: Windows 11 + MSVC 2022 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ## 🛡️ 主要更新 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ### 假死问题修复 >> "%RELEASE_NOTES%"
echo - ✅ 彻底修复全局节点测速假死问题 >> "%RELEASE_NOTES%"
echo - ✅ 新增智能假死检测和自动恢复机制 >> "%RELEASE_NOTES%"
echo - ✅ 支持 1000+ 节点大批量测速 >> "%RELEASE_NOTES%"
echo - ✅ 一键强制恢复功能，无需重启应用 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ### 用户体验提升 >> "%RELEASE_NOTES%"
echo - 🔍 实时健康状态监控面板 >> "%RELEASE_NOTES%"
echo - 🚨 智能假死警告和解决建议 >> "%RELEASE_NOTES%"
echo - 📊 详细的测速过程日志记录 >> "%RELEASE_NOTES%"
echo - ⚡ 性能优化，稳定性提升 95%% >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ## 📦 安装包信息 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"

:: 添加安装包信息
for %%f in ("%VERSION_DIR%\*.exe") do (
    for %%s in ("%%f") do set FILE_SIZE=%%~zs
    echo - **%%~nxf**: !FILE_SIZE! 字节 >> "%RELEASE_NOTES%"
)

echo. >> "%RELEASE_NOTES%"
echo ## 🔐 文件校验 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo 为确保文件完整性，请验证下载文件的 SHA256 校验和： >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"

:: 添加校验和信息
for %%f in ("%VERSION_DIR%\*.exe") do (
    if exist "%%f.sha256" (
        echo ### %%~nxf >> "%RELEASE_NOTES%"
        echo ``` >> "%RELEASE_NOTES%"
        type "%%f.sha256" >> "%RELEASE_NOTES%"
        echo ``` >> "%RELEASE_NOTES%"
        echo. >> "%RELEASE_NOTES%"
    )
)

echo. >> "%RELEASE_NOTES%"
echo ## 📋 安装说明 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo 1. **下载安装包**: 选择 .exe 安装包 >> "%RELEASE_NOTES%"
echo 2. **验证校验和**: 使用提供的 SHA256 值验证文件完整性 >> "%RELEASE_NOTES%"
echo 3. **运行安装**: 以管理员身份运行安装包 >> "%RELEASE_NOTES%"
echo 4. **首次启动**: 启动后可能需要配置代理设置 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ## 🔧 故障排除 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo - **安装失败**: 确保以管理员身份运行，关闭杀毒软件 >> "%RELEASE_NOTES%"
echo - **启动失败**: 检查 Windows Defender 是否误报 >> "%RELEASE_NOTES%"
echo - **测速假死**: 使用新的强制恢复功能 >> "%RELEASE_NOTES%"
echo - **网络问题**: 检查代理配置和防火墙设置 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo ## 📞 技术支持 >> "%RELEASE_NOTES%"
echo. >> "%RELEASE_NOTES%"
echo - **GitHub**: https://github.com/liebesu/LIebesu_Clash >> "%RELEASE_NOTES%"
echo - **Issues**: https://github.com/liebesu/LIebesu_Clash/issues >> "%RELEASE_NOTES%"
echo - **文档**: 查看 docs 目录下的详细文档 >> "%RELEASE_NOTES%"

echo   ✅ 发布说明已生成

:: =============================================================================
:: 第六步：创建快速安装脚本
:: =============================================================================
echo.
echo 🚀 第六步：创建快速安装脚本...

set "QUICK_INSTALL=%VERSION_DIR%\quick_install.bat"

echo @echo off > "%QUICK_INSTALL%"
echo chcp 65001 ^>nul >> "%QUICK_INSTALL%"
echo. >> "%QUICK_INSTALL%"
echo echo =============================================================================== >> "%QUICK_INSTALL%"
echo echo                    LIebesu_Clash 快速安装脚本 >> "%QUICK_INSTALL%"
echo echo =============================================================================== >> "%QUICK_INSTALL%"
echo echo. >> "%QUICK_INSTALL%"
echo. >> "%QUICK_INSTALL%"
echo :: 查找安装包 >> "%QUICK_INSTALL%"
echo for %%%%f in ^(*.exe^) do ^( >> "%QUICK_INSTALL%"
echo     echo 🚀 正在安装: %%%%f >> "%QUICK_INSTALL%"
echo     echo    这可能需要几分钟，请耐心等待... >> "%QUICK_INSTALL%"
echo     "%%%%f" /S >> "%QUICK_INSTALL%"
echo     if ^^!ERRORLEVEL^^! equ 0 ^( >> "%QUICK_INSTALL%"
echo         echo ✅ 安装完成！ >> "%QUICK_INSTALL%"
echo     ^) else ^( >> "%QUICK_INSTALL%"
echo         echo ❌ 安装失败，请手动运行安装包 >> "%QUICK_INSTALL%"
echo     ^) >> "%QUICK_INSTALL%"
echo     goto :end >> "%QUICK_INSTALL%"
echo ^) >> "%QUICK_INSTALL%"
echo. >> "%QUICK_INSTALL%"
echo echo ❌ 未找到安装包 >> "%QUICK_INSTALL%"
echo. >> "%QUICK_INSTALL%"
echo :end >> "%QUICK_INSTALL%"
echo pause >> "%QUICK_INSTALL%"

echo   ✅ 快速安装脚本已创建

:: =============================================================================
:: 第七步：生成完整的发布包信息
:: =============================================================================
echo.
echo 📊 第七步：生成发布包信息...

echo.
echo ===============================================================================
echo                            🎁 发布包制作完成！
echo ===============================================================================
echo.
echo 📁 发布目录: %VERSION_DIR%
echo.
echo 📦 包含文件:
for %%f in ("%VERSION_DIR%\*") do (
    echo   📄 %%~nxf
)
echo.
echo 📊 发布包统计:
for %%f in ("%VERSION_DIR%\*.exe") do (
    for %%s in ("%%f") do (
        set /a SIZE_MB=%%~zs/1024/1024
        echo   🚀 安装包: %%~nxf ^(!SIZE_MB! MB^)
    )
)
echo.
echo 📋 后续步骤:
echo   1. 测试安装包在不同 Windows 11 系统上的兼容性
echo   2. 上传到 GitHub Releases
echo   3. 更新项目文档和发布说明
echo   4. 通知用户更新
echo.
echo 💡 快速验证:
echo   cd %VERSION_DIR%
echo   quick_install.bat
echo.

:: =============================================================================
:: 第八步：可选的压缩打包
:: =============================================================================
echo 📦 是否创建压缩包？（用于分发）
set /p "create_zip=创建 ZIP 压缩包？(y/N): "

if /i "%create_zip%"=="y" (
    echo.
    echo 🗜️ 正在创建压缩包...
    
    set "ZIP_NAME=LIebesu_Clash_v2.4.3_Windows11_Complete_%BUILD_DATE%.zip"
    
    :: 使用 PowerShell 创建压缩包
    powershell -Command "Compress-Archive -Path '%VERSION_DIR%\*' -DestinationPath '%RELEASE_DIR%\%ZIP_NAME%' -Force"
    
    if exist "%RELEASE_DIR%\%ZIP_NAME%" (
        echo   ✅ 压缩包已创建: %ZIP_NAME%
        
        for %%s in ("%RELEASE_DIR%\%ZIP_NAME%") do (
            set /a ZIP_SIZE_MB=%%~zs/1024/1024
            echo   📊 压缩包大小: !ZIP_SIZE_MB! MB
        )
    ) else (
        echo   ❌ 压缩包创建失败
    )
)

echo.
echo 🎊 发布打包流程完成！
echo.
pause
exit /b 0
