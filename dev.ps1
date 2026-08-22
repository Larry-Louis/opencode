# Blue Topaz dev launcher
# Sets the local proxy required by build steps (models.dev), then starts
# the desktop app in dev mode with hot reload.
# Usage:  .\dev.ps1        (from anywhere)
$env:HTTP_PROXY = "http://127.0.0.1:1080"
$env:HTTPS_PROXY = "http://127.0.0.1:1080"
# 与官方安装版共享同一数据库（会话/历史/配置全量同步），不再按分支隔离
$env:OPENCODE_DISABLE_CHANNEL_DB = "1"

Write-Host "[bt] proxy set -> $env:HTTPS_PROXY" -ForegroundColor DarkGray
Set-Location (Join-Path $PSScriptRoot "packages\desktop")
Write-Host "[bt] starting electron-vite dev..." -ForegroundColor DarkGray
bun run dev
