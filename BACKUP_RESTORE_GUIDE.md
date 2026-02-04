# Backup & Restore Scripts

## Create Backup
Use the web UI: Click "Backup & Restore" button in the top bar, then "Create Backup"

Or use API:
```powershell
curl -X POST http://localhost:4000/api/db/backup
```

## Restore Backup

### Using the automated script:
```powershell
.\restore-backup.ps1 backup-2026-01-20-15-30-45
```

Replace `backup-2026-01-20-15-30-45` with your actual backup folder name from `server/data/backups/`

### What it does:
1. ✓ Verifies backup exists
2. ✓ Shows what will be restored
3. ✓ Asks for confirmation
4. ✓ Stops all servers automatically
5. ✓ Restores both databases (inventory.db + app.db)
6. ✓ Restarts all servers
7. ✓ Shows status and URLs

### List available backups:
```powershell
Get-ChildItem .\server\data\backups\backup-* -Directory | Select-Object Name, LastWriteTime
```

### Manual restore (if needed):
1. Stop servers
2. Copy files:
   ```powershell
   Copy-Item .\server\data\backups\backup-XXXX\inventory.db .\server\data\inventory.db -Force
   Copy-Item .\server\data\backups\backup-XXXX\app.db .\backend\data\app.db -Force
   ```
3. Restart servers
