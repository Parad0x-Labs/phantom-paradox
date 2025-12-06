# ============================================
# SAFE GIT HISTORY CLEANER
# ============================================
# Removes sensitive files from Git history
# Run this ONCE, then force push ONCE
# 
# WARNING: This rewrites history. All collaborators
# must re-clone after you push.
# ============================================

$ErrorActionPreference = "Stop"

# Files to remove from history (already in .gitignore)
$SENSITIVE_FILES = @(
    "offchain/src/netting/fastGraph.ts",
    "offchain/src/netting/graph.ts",
    "offchain/src/netting/settlement.ts",
    "offchain/src/netting/compressedSettlement.ts",
    "offchain/src/compression/treeBuilder.ts",
    "offchain/src/netting/poltergeist.ts",
    "offchain/src/netting/engine.ts",
    "offchain/src/netting/service.ts"
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "GIT HISTORY CLEANER - Parad0x Labs" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will remove sensitive files from Git history." -ForegroundColor Yellow
Write-Host "After running, you need to force push ONCE." -ForegroundColor Yellow
Write-Host ""

# Check if git-filter-repo is installed
$filterRepo = Get-Command git-filter-repo -ErrorAction SilentlyContinue
if (-not $filterRepo) {
    Write-Host "ERROR: git-filter-repo not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install with: pip install git-filter-repo" -ForegroundColor Yellow
    Write-Host "Or use: https://github.com/newren/git-filter-repo" -ForegroundColor Yellow
    exit 1
}

# Confirm
Write-Host "Files to remove from history:" -ForegroundColor White
foreach ($file in $SENSITIVE_FILES) {
    Write-Host "  - $file" -ForegroundColor Gray
}
Write-Host ""

$confirm = Read-Host "Type 'CLEAN' to proceed"
if ($confirm -ne "CLEAN") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 0
}

# Create backup branch first
Write-Host ""
Write-Host "[1/4] Creating backup branch..." -ForegroundColor Cyan
git branch backup-before-clean 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Created: backup-before-clean" -ForegroundColor Green
} else {
    Write-Host "  Backup branch already exists, continuing..." -ForegroundColor Yellow
}

# Build the filter-repo command
Write-Host ""
Write-Host "[2/4] Cleaning history (this may take a while)..." -ForegroundColor Cyan

$pathArgs = ""
foreach ($file in $SENSITIVE_FILES) {
    $pathArgs += " --path `"$file`""
}

# Run git-filter-repo
$cmd = "git filter-repo --invert-paths $pathArgs --force"
Write-Host "  Running: $cmd" -ForegroundColor Gray
Invoke-Expression $cmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git-filter-repo failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/4] Re-adding remote..." -ForegroundColor Cyan
git remote add origin https://github.com/Parad0x-Labs/phantom-paradox.git 2>$null
Write-Host "  Done" -ForegroundColor Green

Write-Host ""
Write-Host "[4/4] Ready for push" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "HISTORY CLEANED" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Now run this ONCE (wait 5 seconds between commands):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  git push origin main --force" -ForegroundColor White
Write-Host ""
Write-Host "DO NOT run multiple force pushes quickly - GitHub may flag it." -ForegroundColor Red
Write-Host ""

