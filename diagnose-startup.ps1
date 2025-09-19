# Windows Startup Diagnostic Script for Clash Verge Rev
# PowerShell script to diagnose startup issues

Write-Host "=== Clash Verge Rev Startup Diagnostic ===" -ForegroundColor Green

# 1. Check WebView2
Write-Host "`n[1] Checking WebView2..." -ForegroundColor Yellow
try {
    $webview2 = Get-ItemProperty -Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -Name "pv" -ErrorAction Stop
    Write-Host "[OK] WebView2 installed, version: $($webview2.pv)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] WebView2 not installed" -ForegroundColor Red
    Write-Host "    Solution: Download and install WebView2 Runtime" -ForegroundColor Cyan
    Write-Host "    URL: https://go.microsoft.com/fwlink/p/?LinkId=2124703" -ForegroundColor Cyan
}

# 2. Check Visual C++ Redistributable
Write-Host "`n[2] Checking Visual C++ Redistributable..." -ForegroundColor Yellow
$vcFiles = @(
    "$env:WINDIR\System32\vcruntime140.dll",
    "$env:WINDIR\System32\msvcp140.dll",
    "$env:WINDIR\System32\vccorlib140.dll"
)

$missingFiles = @()
foreach ($file in $vcFiles) {
    if (Test-Path $file) {
        try {
            $version = (Get-ItemProperty $file).VersionInfo.FileVersion
            Write-Host "[OK] Found $(Split-Path $file -Leaf) - version: $version" -ForegroundColor Green
        } catch {
            Write-Host "[OK] Found $(Split-Path $file -Leaf)" -ForegroundColor Green
        }
    } else {
        $missingFiles += Split-Path $file -Leaf
        Write-Host "[ERROR] Missing $(Split-Path $file -Leaf)" -ForegroundColor Red
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "    Solution: Install Microsoft Visual C++ Redistributable" -ForegroundColor Cyan
    if ([Environment]::Is64BitOperatingSystem) {
        Write-Host "    URL: https://aka.ms/vs/17/release/vc_redist.x64.exe" -ForegroundColor Cyan
    } else {
        Write-Host "    URL: https://aka.ms/vs/17/release/vc_redist.x86.exe" -ForegroundColor Cyan
    }
}

# 3. Check application files
Write-Host "`n[3] Checking application files..." -ForegroundColor Yellow
$possiblePaths = @(
    "$env:ProgramFiles\Liebesu_Clash\clash-verge.exe",
    "$env:ProgramFiles\Liebesu_Clash\Liebesu_Clash.exe",
    "$env:ProgramFiles\Clash Verge Rev\Clash Verge Rev.exe",
    "$env:ProgramFiles\clash-verge\clash-verge.exe",
    "$env:LOCALAPPDATA\Liebesu_Clash\clash-verge.exe",
    "$env:LOCALAPPDATA\Liebesu_Clash\Liebesu_Clash.exe",
    "$env:LOCALAPPDATA\Clash Verge Rev\Clash Verge Rev.exe",
    "$env:ProgramFiles\Clash.Verge_*\clash-verge.exe",
    "$env:ProgramFiles\Clash.Verge_*\Liebesu_Clash.exe"
)

$appFound = $false
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        Write-Host "[OK] Found application: $path" -ForegroundColor Green
        try {
            $fileInfo = Get-ItemProperty $path
            Write-Host "    File size: $([math]::Round($fileInfo.Length/1MB, 2)) MB" -ForegroundColor White
            Write-Host "    Modified: $($fileInfo.LastWriteTime)" -ForegroundColor White
            
            $versionInfo = (Get-ItemProperty $path).VersionInfo
            if ($versionInfo.ProductVersion) {
                Write-Host "    Product version: $($versionInfo.ProductVersion)" -ForegroundColor White
            }
            if ($versionInfo.FileVersion) {
                Write-Host "    File version: $($versionInfo.FileVersion)" -ForegroundColor White
            }
        } catch {
            Write-Host "    Version info: Unable to retrieve" -ForegroundColor Yellow
        }
        $appFound = $true
        break
    }
}

if (-not $appFound) {
    Write-Host "[ERROR] Application file not found" -ForegroundColor Red
    Write-Host "    Possible issues: Incomplete installation or removed by security software" -ForegroundColor Cyan
}

# 4. Check Windows Event Log for errors
Write-Host "`n[4] Checking recent application errors..." -ForegroundColor Yellow
try {
    $startTime = (Get-Date).AddDays(-1)
    $errors = Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=$startTime} -MaxEvents 20 -ErrorAction Stop | 
              Where-Object { 
                  $_.ProviderName -like "*clash*" -or 
                  $_.ProviderName -like "*liebesu*" -or
                  $_.Message -like "*clash*" -or 
                  $_.Message -like "*verge*" -or
                  $_.Message -like "*liebesu*" -or
                  $_.Message -like "*tauri*"
              }
    
    if ($errors) {
        Write-Host "[WARN] Found related error events:" -ForegroundColor Yellow
        $errors | Select-Object -First 5 | ForEach-Object {
            Write-Host "    Time: $($_.TimeCreated)" -ForegroundColor White
            Write-Host "    Error ID: $($_.Id)" -ForegroundColor White
            Write-Host "    Provider: $($_.ProviderName)" -ForegroundColor White
            Write-Host "    Level: $($_.LevelDisplayName)" -ForegroundColor White
            Write-Host "    --------" -ForegroundColor Gray
        }
    } else {
        Write-Host "[OK] No related error events found" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] Unable to read event log (insufficient permissions)" -ForegroundColor Yellow
}

# 5. Check Windows Defender
Write-Host "`n[5] Checking Windows Defender..." -ForegroundColor Yellow
try {
    $defenderStatus = Get-MpComputerStatus -ErrorAction Stop
    Write-Host "[OK] Windows Defender status:" -ForegroundColor Green
    Write-Host "    Real-time protection: $($defenderStatus.RealTimeProtectionEnabled)" -ForegroundColor White
    Write-Host "    Antimalware enabled: $($defenderStatus.AntivirusEnabled)" -ForegroundColor White
    
    # Check for threat detections
    try {
        $threats = Get-MpThreatDetection -ErrorAction SilentlyContinue | 
                   Where-Object { 
                       $_.Resources -like "*clash*" -or 
                       $_.Resources -like "*verge*" -or
                       $_.Resources -like "*liebesu*"
                   } | Select-Object -First 3
        
        if ($threats) {
            Write-Host "[WARN] Found possibly related threat detections:" -ForegroundColor Yellow
            foreach ($threat in $threats) {
                Write-Host "    Threat name: $($threat.ThreatName)" -ForegroundColor White
                Write-Host "    Detection time: $($threat.InitialDetectionTime)" -ForegroundColor White
            }
            Write-Host "    Solution: Add application to Windows Defender exclusion list" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "    Unable to check threat detections" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] Unable to get Windows Defender status" -ForegroundColor Yellow
}

# 6. Network connectivity test
Write-Host "`n[6] Testing network connectivity..." -ForegroundColor Yellow
$testUrls = @("github.com", "api.github.com", "raw.githubusercontent.com")

foreach ($url in $testUrls) {
    try {
        $result = Test-NetConnection -ComputerName $url -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue -TimeoutInSeconds 5
        if ($result) {
            Write-Host "[OK] $url connection successful" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] $url connection failed" -ForegroundColor Red
        }
    } catch {
        Write-Host "[ERROR] $url connection test exception" -ForegroundColor Red
    }
}

# Summary and recommendations
Write-Host "`n=== Diagnostic Summary ===" -ForegroundColor Green
Write-Host "1. If WebView2 is missing, install WebView2 Runtime first" -ForegroundColor White
Write-Host "2. If VC++ runtime is missing, install the appropriate Visual C++ Redistributable" -ForegroundColor White
Write-Host "3. Check if antivirus software is blocking and add to whitelist" -ForegroundColor White
Write-Host "4. Ensure running application with administrator privileges" -ForegroundColor White
Write-Host "5. If problems persist, check Windows Event Viewer for detailed error information" -ForegroundColor White

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
