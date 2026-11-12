# Blue Topaz dev launcher
# Sets the local proxy required by build steps (models.dev), then starts
# the desktop app in dev mode with hot reload.
# Usage:  .\dev.ps1        (from anywhere)

# 本地活跃代理（sing-box 提供的 HTTP 代理为 1083）
$proxyUrl = "http://127.0.0.1:1083"

$env:HTTP_PROXY = $proxyUrl
$env:HTTPS_PROXY = $proxyUrl
$env:ALL_PROXY = $proxyUrl

# 镜像加速 Electron 等二进制下载
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"

# v2 的后台服务用 loopback 探活；代理必须放过本地回环，否则 "background service" 启动超时退出
$env:NO_PROXY = "127.0.0.1,localhost,::1"
# 与官方安装版共享同一数据库（会话/历史/配置全量同步），不再按分支隔离
$env:OPENCODE_DISABLE_CHANNEL_DB = "1"

Write-Host "[bt] proxy set -> $proxyUrl" -ForegroundColor DarkGray
Set-Location (Join-Path $PSScriptRoot "packages\desktop")
Write-Host "[bt] starting electron-vite dev..." -ForegroundColor DarkGray
bun run dev
