#!/usr/bin/env pwsh
# Restore Backup Script
# Usage: .\restore-backup.ps1 backup-2026-01-20-15-30-45

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupName
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Database Restore Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$backupPath = ".\server\data\backups\$BackupName"

# Verify backup exists
if (-not (Test-Path $backupPath)) {
    Write-Host "ERROR: Backup not found at $backupPath" -ForegroundColor Red
    exit 1
}

Write-Host "Found backup: $BackupName" -ForegroundColor Green

# Check what's in the backup
$inventoryDb = Join-Path $backupPath "inventory.db"
$authDb = Join-Path $backupPath "app.db"

$hasInventory = Test-Path $inventoryDb
$hasAuth = Test-Path $authDb

Write-Host "  - inventory.db: $(if($hasInventory){'✓'}else{'✗'})" -ForegroundColor $(if($hasInventory){'Green'}else{'Yellow'})
Write-Host "  - app.db: $(if($hasAuth){'✓'}else{'✗'})" -ForegroundColor $(if($hasAuth){'Green'}else{'Yellow'})
Write-Host ""

# Confirm with user
Write-Host "WARNING: This will overwrite current databases!" -ForegroundColor Yellow
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne 'yes') {
    Write-Host "Restore cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Step 1: Stopping servers..." -ForegroundColor Cyan

# Kill Node.js server processes
Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
    $_.Path -like "*mynewproject*" 
} | Stop-Process -Force
Write-Host "  ✓ Node.js servers stopped" -ForegroundColor Green

# Kill Python backend processes
Get-Process python -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*uvicorn*" -or $_.CommandLine -like "*backend*"
} | Stop-Process -Force
Write-Host "  ✓ Python backend stopped" -ForegroundColor Green

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Step 2: Restoring databases..." -ForegroundColor Cyan

# Restore inventory database
if ($hasInventory) {
    Copy-Item $inventoryDb ".\server\data\inventory.db" -Force
    Write-Host "  ✓ Restored inventory.db" -ForegroundColor Green
}

# Restore auth database
if ($hasAuth) {
    Copy-Item $authDb ".\backend\data\app.db" -Force
    Write-Host "  ✓ Restored app.db" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 3: Restarting servers..." -ForegroundColor Cyan

# Start Node.js server in background
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\server'; npm run dev" -WindowStyle Normal
Write-Host "  ✓ Node.js server starting..." -ForegroundColor Green

# Start Python backend in background
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -WindowStyle Normal
Write-Host "  ✓ Python backend starting..." -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Restore Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Servers are starting up..." -ForegroundColor Cyan
Write-Host "  - Node.js server: http://localhost:4000" -ForegroundColor White
Write-Host "  - Python backend: http://localhost:8000" -ForegroundColor White
Write-Host "  - Client UI: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Please wait 5-10 seconds for servers to fully start." -ForegroundColor Yellow
