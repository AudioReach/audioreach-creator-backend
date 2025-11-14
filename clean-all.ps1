#!/usr/bin/env pwsh
# clean-all.ps1 - Complete build cache cleanup for Windows/PowerShell

Write-Host "🧹 Starting complete cache cleanup..." -ForegroundColor Green

# 1. Remove all TypeScript build outputs
Write-Host "Removing TypeScript build artifacts..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Directory -Name "dist" -ErrorAction SilentlyContinue | ForEach-Object {
    $distPath = Join-Path $PWD $_
    if (Test-Path $distPath) {
        Write-Host "  Removing: $distPath" -ForegroundColor Gray
        Remove-Item -Path $distPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Get-ChildItem -Path . -Recurse -File -Name "*.tsbuildinfo" -ErrorAction SilentlyContinue | ForEach-Object {
    $tsbuildPath = Join-Path $PWD $_
    if (Test-Path $tsbuildPath) {
        Write-Host "  Removing: $tsbuildPath" -ForegroundColor Gray
        Remove-Item -Path $tsbuildPath -Force -ErrorAction SilentlyContinue
    }
}

Get-ChildItem -Path . -Recurse -File -Name "*.d.ts.map" -ErrorAction SilentlyContinue | ForEach-Object {
    $mapPath = Join-Path $PWD $_
    if (Test-Path $mapPath) {
        Write-Host "  Removing: $mapPath" -ForegroundColor Gray
        Remove-Item -Path $mapPath -Force -ErrorAction SilentlyContinue
    }
}

# 2. Remove node_modules everywhere
Write-Host "Removing all node_modules..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Directory -Name "node_modules" -ErrorAction SilentlyContinue | ForEach-Object {
    $nodeModulesPath = Join-Path $PWD $_
    if (Test-Path $nodeModulesPath) {
        Write-Host "  Removing: $nodeModulesPath" -ForegroundColor Gray
        Remove-Item -Path $nodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 3. Clear package manager caches
Write-Host "Clearing package manager caches..." -ForegroundColor Yellow
try {
    & yarn cache clean 2>$null
    Write-Host "  Yarn cache cleared" -ForegroundColor Gray
} catch {
    try {
        & npm cache clean --force 2>$null
        Write-Host "  NPM cache cleared" -ForegroundColor Gray
    } catch {
        Write-Host "  No package manager cache to clear" -ForegroundColor Gray
    }
}

# 4. Clear turbo cache
#Write-Host "Clearing turbo cache..." -ForegroundColor Yellow
#try {
#    & npx turbo clean 2>$null
#    Write-Host "  Turbo cache cleared" -ForegroundColor Gray
#} catch {
#    Write-Host "  No turbo cache to clear" -ForegroundColor Gray
#}

# 5. Remove any .yarn/cache if it exists
Write-Host "Removing Yarn cache directories..." -ForegroundColor Yellow
if (Test-Path ".yarn/cache") {
    Remove-Item -Path ".yarn/cache" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Removed .yarn/cache" -ForegroundColor Gray
}

# 6. Remove any package-lock.json files (in case switching between npm/yarn)
Write-Host "Removing package-lock.json files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -File -Name "package-lock.json" -ErrorAction SilentlyContinue | ForEach-Object {
    $lockPath = Join-Path $PWD $_
    if (Test-Path $lockPath) {
        Write-Host "  Removing: $lockPath" -ForegroundColor Gray
        Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
    }
}

# 7. Reinstall dependencies
Write-Host "Reinstalling dependencies..." -ForegroundColor Yellow
try {
    & yarn install
    Write-Host "  Dependencies reinstalled with Yarn" -ForegroundColor Gray
} catch {
    try {
        & npm install
        Write-Host "  Dependencies reinstalled with NPM" -ForegroundColor Gray
    } catch {
        Write-Host "  Failed to reinstall dependencies" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Cleanup complete! Try building now." -ForegroundColor Green
Write-Host "Run: yarn build or npm run build" -ForegroundColor Cyan
