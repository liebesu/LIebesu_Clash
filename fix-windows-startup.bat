@echo off
chcp 65001 >nul
:: Windows Startup Fix Script for Clash Verge Rev
:: Please run as Administrator

echo ====================================
echo Clash Verge Rev Windows Startup Fix
echo ====================================

:: Check admin privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Administrator privileges detected
) else (
    echo [ERROR] Administrator privileges required
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo [1] Checking WebView2 Runtime...
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] WebView2 is installed
) else (
    echo [INFO] WebView2 not found, downloading...
    powershell -Command "& {Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile '%TEMP%\MicrosoftEdgeWebview2Setup.exe'}"
    if exist "%TEMP%\MicrosoftEdgeWebview2Setup.exe" (
        echo [INFO] Installing WebView2...
        "%TEMP%\MicrosoftEdgeWebview2Setup.exe" /silent /install
        timeout /t 10 /nobreak >nul
        del "%TEMP%\MicrosoftEdgeWebview2Setup.exe"
        echo [OK] WebView2 installation completed
    ) else (
        echo [ERROR] WebView2 download failed
    )
)

echo.
echo [2] Checking Visual C++ Redistributable...
if exist "%WINDIR%\System32\vcruntime140.dll" (
    echo [OK] VC++ Redistributable is installed
) else (
    echo [INFO] VC++ Redistributable not found, downloading...
    if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
        set "VC_URL=https://aka.ms/vs/17/release/vc_redist.x64.exe"
        set "VC_FILE=vc_redist.x64.exe"
    ) else (
        set "VC_URL=https://aka.ms/vs/17/release/vc_redist.x86.exe"
        set "VC_FILE=vc_redist.x86.exe"
    )
    
    powershell -Command "& {Invoke-WebRequest -Uri '%VC_URL%' -OutFile '%TEMP%\%VC_FILE%'}"
    if exist "%TEMP%\%VC_FILE%" (
        echo [INFO] Installing VC++ Redistributable...
        "%TEMP%\%VC_FILE%" /quiet /norestart
        timeout /t 15 /nobreak >nul
        del "%TEMP%\%VC_FILE%"
        echo [OK] VC++ Redistributable installation completed
    ) else (
        echo [ERROR] VC++ Redistributable download failed
    )
)

echo.
echo [3] Cleaning conflicting startup entries...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Clash Verge" /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "Clash Verge" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "clash-verge" /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "clash-verge" /f >nul 2>&1
echo [OK] Startup entries cleanup completed

echo.
echo [4] Resetting network settings...
netsh int tcp reset >nul 2>&1
netsh winsock reset >nul 2>&1
echo [OK] Network settings reset completed

echo.
echo [5] Cleaning application data...
if exist "%APPDATA%\io.github.liebesu.clash\window-state.json" (
    del "%APPDATA%\io.github.liebesu.clash\window-state.json" >nul 2>&1
)
if exist "%APPDATA%\io.github.liebesu.clash\.window-state.json" (
    del "%APPDATA%\io.github.liebesu.clash\.window-state.json" >nul 2>&1
)
if exist "%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\window-state.json" (
    del "%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\window-state.json" >nul 2>&1
)
if exist "%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\.window-state.json" (
    del "%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\.window-state.json" >nul 2>&1
)
echo [OK] Application data cleanup completed

echo.
echo ====================================
echo Fix completed! Please restart the application.
echo If the problem persists, please check:
echo 1. Windows Defender exclusions
echo 2. Third-party antivirus settings
echo 3. Windows SmartScreen settings
echo ====================================
pause
