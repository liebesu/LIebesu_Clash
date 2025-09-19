# Verify Build Configuration Script
# Checks if all Tauri configuration files have consistent identifiers and product names

Write-Host "=== Verifying Build Configuration ===" -ForegroundColor Green

$correctIdentifier = "io.github.liebesu.clash"
$correctProductName = "Liebesu_Clash"
$issues = @()

# List of configuration files to check
$configFiles = @(
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.personal.conf.json", 
    "src-tauri/tauri.windows.conf.json",
    "src-tauri/tauri.linux.conf.json",
    "src-tauri/tauri.macos.conf.json",
    "src-tauri/webview2.x64.json",
    "src-tauri/webview2.x86.json",
    "src-tauri/webview2.arm64.json"
)

Write-Host "`n[1] Checking Tauri configuration files..." -ForegroundColor Yellow

foreach ($configFile in $configFiles) {
    if (Test-Path $configFile) {
        Write-Host "Checking: $configFile" -ForegroundColor Gray
        
        try {
            $content = Get-Content $configFile -Raw | ConvertFrom-Json
            
            # Check identifier
            if ($content.identifier) {
                if ($content.identifier -eq $correctIdentifier) {
                    Write-Host "  [OK] Identifier: $($content.identifier)" -ForegroundColor Green
                } else {
                    Write-Host "  [ERROR] Wrong identifier: $($content.identifier)" -ForegroundColor Red
                    $issues += "Wrong identifier in $configFile"
                }
            }
            
            # Check productName (if exists)
            if ($content.productName) {
                if ($content.productName -eq $correctProductName) {
                    Write-Host "  [OK] Product Name: $($content.productName)" -ForegroundColor Green
                } else {
                    Write-Host "  [ERROR] Wrong product name: $($content.productName)" -ForegroundColor Red
                    $issues += "Wrong product name in $configFile"
                }
            }
            
        } catch {
            Write-Host "  [ERROR] Failed to parse JSON: $($_.Exception.Message)" -ForegroundColor Red
            $issues += "Invalid JSON in $configFile"
        }
    } else {
        Write-Host "  [WARN] File not found: $configFile" -ForegroundColor Yellow
    }
}

# Check Cargo.toml
Write-Host "`n[2] Checking Cargo.toml..." -ForegroundColor Yellow
if (Test-Path "src-tauri/Cargo.toml") {
    $cargoContent = Get-Content "src-tauri/Cargo.toml" -Raw
    
    if ($cargoContent -match 'identifier\s*=\s*"([^"]+)"') {
        $cargoIdentifier = $matches[1]
        if ($cargoIdentifier -eq $correctIdentifier) {
            Write-Host "[OK] Cargo.toml identifier: $cargoIdentifier" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Wrong Cargo.toml identifier: $cargoIdentifier" -ForegroundColor Red
            $issues += "Wrong identifier in Cargo.toml"
        }
    } else {
        Write-Host "[WARN] No identifier found in Cargo.toml" -ForegroundColor Yellow
    }
    
    if ($cargoContent -match 'name\s*=\s*"([^"]+)"') {
        $cargoName = $matches[1]
        Write-Host "[INFO] Cargo package name: $cargoName" -ForegroundColor White
    }
} else {
    Write-Host "[ERROR] Cargo.toml not found" -ForegroundColor Red
    $issues += "Cargo.toml not found"
}

# Check GitHub Actions workflow
Write-Host "`n[3] Checking GitHub Actions workflow..." -ForegroundColor Yellow
$workflowFile = ".github/workflows/windows-personal.yml"
if (Test-Path $workflowFile) {
    $workflowContent = Get-Content $workflowFile -Raw
    
    if ($workflowContent -match '"identifier":\s*"([^"]+)"') {
        $workflowIdentifier = $matches[1]
        if ($workflowIdentifier -eq $correctIdentifier) {
            Write-Host "[OK] GitHub Actions identifier: $workflowIdentifier" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Wrong GitHub Actions identifier: $workflowIdentifier" -ForegroundColor Red
            $issues += "Wrong identifier in GitHub Actions workflow"
        }
    } else {
        Write-Host "[WARN] No identifier override found in GitHub Actions" -ForegroundColor Yellow
    }
    
    if ($workflowContent -match '"productName":\s*"([^"]+)"') {
        $workflowProductName = $matches[1]
        if ($workflowProductName -eq $correctProductName) {
            Write-Host "[OK] GitHub Actions product name: $workflowProductName" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Wrong GitHub Actions product name: $workflowProductName" -ForegroundColor Red
            $issues += "Wrong product name in GitHub Actions workflow"
        }
    } else {
        Write-Host "[WARN] No product name override found in GitHub Actions" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR] GitHub Actions workflow file not found" -ForegroundColor Red
    $issues += "GitHub Actions workflow file not found"
}

# Check NSIS installer template
Write-Host "`n[4] Checking NSIS installer template..." -ForegroundColor Yellow
$nsisFile = "src-tauri/packages/windows/installer.nsi"
if (Test-Path $nsisFile) {
    Write-Host "[OK] NSIS installer template found" -ForegroundColor Green
    # Check if template uses correct variables
    $nsisContent = Get-Content $nsisFile -Raw
    if ($nsisContent -match '{{product_name}}') {
        Write-Host "[OK] NSIS template uses product_name variable" -ForegroundColor Green
    } else {
        Write-Host "[WARN] NSIS template may not use product_name variable" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR] NSIS installer template not found" -ForegroundColor Red
    $issues += "NSIS installer template not found"
}

# Summary
Write-Host "`n=== Verification Summary ===" -ForegroundColor Green

if ($issues.Count -eq 0) {
    Write-Host "[SUCCESS] All configuration files are consistent!" -ForegroundColor Green
    Write-Host "Expected identifier: $correctIdentifier" -ForegroundColor White
    Write-Host "Expected product name: $correctProductName" -ForegroundColor White
    Write-Host "`nThe GitHub Actions build should now create the application with correct naming." -ForegroundColor Cyan
} else {
    Write-Host "[FAILED] Found $($issues.Count) configuration issues:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
    Write-Host "`nPlease fix these issues before running GitHub Actions." -ForegroundColor Red
}

Write-Host "`n=== Build Instructions ===" -ForegroundColor Cyan
Write-Host "1. Test locally first:" -ForegroundColor White
Write-Host "   pnpm install" -ForegroundColor Gray
Write-Host "   pnpm run prebuild x86_64-pc-windows-msvc" -ForegroundColor Gray  
Write-Host "   pnpm tauri build --target x86_64-pc-windows-msvc" -ForegroundColor Gray
Write-Host "`n2. If local build works, push to GitHub to trigger Actions" -ForegroundColor White
Write-Host "`n3. Look for Liebesu_Clash.exe in the build artifacts" -ForegroundColor White

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
