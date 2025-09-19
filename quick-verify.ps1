# Quick Verification Script for GitHub Actions Fix
# Run this script to verify the fixes are working

Write-Host "=== GitHub Actions Fix Verification ===" -ForegroundColor Green

Write-Host "`n[1] Checking Tauri configuration files..." -ForegroundColor Yellow

$configFiles = @(
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.windows.conf.json",
    "src-tauri/tauri.personal.conf.json"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw | ConvertFrom-Json
        if ($content.identifier -eq "io.github.liebesu.clash") {
            Write-Host "[OK] $file - identifier correct" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] $file - identifier: $($content.identifier)" -ForegroundColor Red
        }
        
        if ($content.productName -eq "Liebesu_Clash") {
            Write-Host "[OK] $file - productName correct" -ForegroundColor Green
        } elseif ($content.productName) {
            Write-Host "[ERROR] $file - productName: $($content.productName)" -ForegroundColor Red
        }
    } else {
        Write-Host "[WARN] $file not found" -ForegroundColor Yellow
    }
}

Write-Host "`n[2] Checking Cargo.toml..." -ForegroundColor Yellow
if (Test-Path "src-tauri/Cargo.toml") {
    $cargoContent = Get-Content "src-tauri/Cargo.toml" -Raw
    if ($cargoContent -match 'name = "liebesu-clash"') {
        Write-Host "[OK] Cargo.toml - package name updated" -ForegroundColor Green
    } elseif ($cargoContent -match 'name = "clash-verge"') {
        Write-Host "[WARN] Cargo.toml - still using old package name" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] Cargo.toml - package name not found" -ForegroundColor Red
    }
    
    if ($cargoContent -match 'default-run = "liebesu-clash"') {
        Write-Host "[OK] Cargo.toml - default-run updated" -ForegroundColor Green
    } elseif ($cargoContent -match 'default-run = "clash-verge"') {
        Write-Host "[WARN] Cargo.toml - still using old default-run" -ForegroundColor Yellow
    }
}

Write-Host "`n[3] Checking diagnostic scripts..." -ForegroundColor Yellow
$diagnosticFiles = @("diagnose-startup.ps1", "find-application.ps1")

foreach ($file in $diagnosticFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -match "clash-verge\.exe") {
            Write-Host "[OK] $file - supports clash-verge.exe" -ForegroundColor Green
        } else {
            Write-Host "[WARN] $file - may not support actual binary name" -ForegroundColor Yellow
        }
        
        if ($content -match "Liebesu_Clash\.exe") {
            Write-Host "[OK] $file - supports Liebesu_Clash.exe" -ForegroundColor Green
        }
    } else {
        Write-Host "[WARN] $file not found" -ForegroundColor Yellow
    }
}

Write-Host "`n[4] Checking for application (if installed)..." -ForegroundColor Yellow
$appPaths = @(
    "$env:ProgramFiles\Liebesu_Clash\clash-verge.exe",
    "$env:ProgramFiles\Liebesu_Clash\liebesu-clash.exe",
    "$env:ProgramFiles\Liebesu_Clash\Liebesu_Clash.exe"
)

$foundApp = $false
foreach ($path in $appPaths) {
    if (Test-Path $path) {
        Write-Host "[FOUND] Application at: $path" -ForegroundColor Green
        $foundApp = $true
        try {
            $fileInfo = Get-ItemProperty $path
            Write-Host "        Size: $([math]::Round($fileInfo.Length/1MB, 2)) MB" -ForegroundColor White
            Write-Host "        Modified: $($fileInfo.LastWriteTime)" -ForegroundColor White
        } catch {
            Write-Host "        Unable to get file info" -ForegroundColor Yellow
        }
        break
    }
}

if (-not $foundApp) {
    Write-Host "[INFO] No application found (expected if not installed yet)" -ForegroundColor Cyan
}

Write-Host "`n=== Verification Summary ===" -ForegroundColor Green
Write-Host "1. All configuration files should have identifier: io.github.liebesu.clash" -ForegroundColor White
Write-Host "2. Cargo.toml should use package name: liebesu-clash" -ForegroundColor White
Write-Host "3. Diagnostic scripts should support both naming patterns" -ForegroundColor White
Write-Host "4. After rebuild, the application should be found and working" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. If any errors above, review the specific files" -ForegroundColor White
Write-Host "2. Trigger a new GitHub Actions build" -ForegroundColor White
Write-Host "3. Test the new build on Windows" -ForegroundColor White
Write-Host "4. Run diagnose-startup.ps1 after installation" -ForegroundColor White

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
