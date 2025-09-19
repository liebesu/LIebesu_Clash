# Find Liebesu_Clash Application Script
# Helps locate the application installation

Write-Host "=== Finding Liebesu_Clash Installation ===" -ForegroundColor Green

# Search common installation directories
Write-Host "`nSearching for application files..." -ForegroundColor Yellow

$searchPatterns = @(
    "clash-verge.exe",
    "Liebesu_Clash.exe",
    "Clash Verge*.exe"
)

$searchPaths = @(
    $env:ProgramFiles,
    $env:LOCALAPPDATA,
    "${env:ProgramFiles(x86)}",
    "$env:USERPROFILE\AppData\Local",
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\Downloads"
)

$foundFiles = @()

foreach ($searchPath in $searchPaths) {
    if (Test-Path $searchPath) {
        Write-Host "Searching in: $searchPath" -ForegroundColor Gray
        
        foreach ($pattern in $searchPatterns) {
            try {
                $files = Get-ChildItem -Path $searchPath -Filter $pattern -Recurse -ErrorAction SilentlyContinue -Depth 3
                foreach ($file in $files) {
                    $foundFiles += $file
                    Write-Host "[FOUND] $($file.FullName)" -ForegroundColor Green
                    Write-Host "        Size: $([math]::Round($file.Length/1MB, 2)) MB" -ForegroundColor White
                    Write-Host "        Modified: $($file.LastWriteTime)" -ForegroundColor White
                }
            } catch {
                # Ignore access denied errors
            }
        }
    }
}

# Check Windows Registry for uninstall information
Write-Host "`nChecking Windows Registry..." -ForegroundColor Yellow
$uninstallPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)

foreach ($regPath in $uninstallPaths) {
    try {
        $apps = Get-ItemProperty $regPath -ErrorAction SilentlyContinue | 
                Where-Object { 
                    $_.DisplayName -like "*Clash*" -or 
                    $_.DisplayName -like "*Verge*" -or
                    $_.DisplayName -like "*Liebesu*"
                }
        
        foreach ($app in $apps) {
            Write-Host "[REGISTRY] Found: $($app.DisplayName)" -ForegroundColor Cyan
            if ($app.InstallLocation) {
                Write-Host "           Install Location: $($app.InstallLocation)" -ForegroundColor White
                
                # Check if executable exists in install location
                $exePaths = @(
                    "$($app.InstallLocation)\Liebesu_Clash.exe",
                    "$($app.InstallLocation)\clash-verge.exe",
                    "$($app.InstallLocation)\Clash Verge.exe"
                )
                
                foreach ($exePath in $exePaths) {
                    if (Test-Path $exePath) {
                        Write-Host "[FOUND] Executable: $exePath" -ForegroundColor Green
                        $foundFiles += Get-ItemProperty $exePath
                    }
                }
            }
            if ($app.UninstallString) {
                Write-Host "           Uninstall: $($app.UninstallString)" -ForegroundColor White
            }
        }
    } catch {
        # Ignore registry access errors
    }
}

# Check Start Menu shortcuts
Write-Host "`nChecking Start Menu shortcuts..." -ForegroundColor Yellow
$startMenuPaths = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
)

foreach ($startPath in $startMenuPaths) {
    if (Test-Path $startPath) {
        $shortcuts = Get-ChildItem -Path $startPath -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue |
                     Where-Object { 
                         $_.Name -like "*Clash*" -or 
                         $_.Name -like "*Verge*" -or 
                         $_.Name -like "*Liebesu*" 
                     }
        
        foreach ($shortcut in $shortcuts) {
            Write-Host "[SHORTCUT] $($shortcut.FullName)" -ForegroundColor Magenta
            
            # Try to get shortcut target
            try {
                $shell = New-Object -ComObject WScript.Shell
                $link = $shell.CreateShortcut($shortcut.FullName)
                Write-Host "           Target: $($link.TargetPath)" -ForegroundColor White
                
                if (Test-Path $link.TargetPath) {
                    Write-Host "[FOUND] Target exists: $($link.TargetPath)" -ForegroundColor Green
                }
            } catch {
                # Ignore COM errors
            }
        }
    }
}

# Summary
Write-Host "`n=== Search Summary ===" -ForegroundColor Green

if ($foundFiles.Count -eq 0) {
    Write-Host "[ERROR] No application files found!" -ForegroundColor Red
    Write-Host "`nPossible reasons:" -ForegroundColor Yellow
    Write-Host "1. Application was not installed properly" -ForegroundColor White
    Write-Host "2. Application was removed by antivirus software" -ForegroundColor White
    Write-Host "3. Installation was interrupted" -ForegroundColor White
    Write-Host "4. Application is in a non-standard location" -ForegroundColor White
    
    Write-Host "`nSuggested actions:" -ForegroundColor Cyan
    Write-Host "1. Re-download and reinstall the application" -ForegroundColor White
    Write-Host "2. Check antivirus quarantine/logs" -ForegroundColor White
    Write-Host "3. Run installation as administrator" -ForegroundColor White
    Write-Host "4. Temporarily disable antivirus during installation" -ForegroundColor White
} else {
    Write-Host "[SUCCESS] Found $($foundFiles.Count) application file(s)" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Try running the application directly from the found location" -ForegroundColor White
    Write-Host "2. Right-click and 'Run as administrator'" -ForegroundColor White
    Write-Host "3. Check if Windows Defender is blocking execution" -ForegroundColor White
    Write-Host "4. Add the application folder to antivirus exclusions" -ForegroundColor White
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
