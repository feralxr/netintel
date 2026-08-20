# netintel Windows install script.
# Run from an elevated (Administrator) PowerShell prompt, from the repo root:
#   .\packaging\windows\install.ps1
#
# Requires NSSM (https://nssm.cc/) for running the Node process as a proper
# Windows service with auto-restart-on-crash. If you don't have it:
#   winget install NSSM.NSSM
# or download nssm.exe and put it on your PATH.

$ErrorActionPreference = "Stop"

$RepoDir = (Resolve-Path "$PSScriptRoot\..\..").Path
$InstallDir = "C:\netintel"
$DataDir = "$env:ProgramData\netintel"
$ServiceName = "netintel"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Please run this script from an elevated (Administrator) PowerShell prompt."
  exit 1
}

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Error "nssm not found on PATH. Install it first: winget install NSSM.NSSM"
  exit 1
}

Write-Host "==> Copying repo to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path "$RepoDir\*" -Destination $InstallDir -Recurse -Force

Write-Host "==> Creating data directory $DataDir"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host "==> Installing dependencies and building"
Push-Location $InstallDir
npm install
npm run build

Write-Host "==> Setting up .env"
$EnvFile = "$InstallDir\packages\server\.env"
if (-not (Test-Path $EnvFile)) {
  Copy-Item "$InstallDir\packages\server\.env.example" $EnvFile
  # Pre-fill the data dir we just created so at least one required-adjacent value is correct out of the box.
  (Get-Content $EnvFile) -replace '^# NETINTEL_DATA_DIR=.*', "NETINTEL_DATA_DIR=$DataDir" | Set-Content $EnvFile
}

Write-Host "==> Running database migrations"
Push-Location "$InstallDir\packages\server"
npm run db:migrate
Pop-Location
Pop-Location

Write-Host "==> Installing Windows service via NSSM"
nssm install $ServiceName "$(Get-Command node | Select-Object -ExpandProperty Source)" "dist\index.js"
nssm set $ServiceName AppDirectory "$InstallDir\packages\server"
# Config lives in packages\server\.env (dotenv loads it automatically from
# the working directory set above) — no need to set NSSM environment vars.
nssm set $ServiceName AppExit Default Restart
nssm set $ServiceName AppRestartDelay 5000
nssm set $ServiceName Start SERVICE_AUTO_START

Write-Host ""
Write-Host "Install complete. Before starting the service:"
Write-Host "  1. Edit $EnvFile and set NETINTEL_TECHNITIUM_URL / NETINTEL_TECHNITIUM_TOKEN"
Write-Host "     (netintel requires a real Technitium instance — there is no mock/demo mode)"
Write-Host "  2. Start-Service netintel"
Write-Host "  3. Get-EventLog -LogName Application -Source netintel -Newest 20   # or check $InstallDir\packages\server for logs, depending on NSSM I/O config"
Write-Host ""
Write-Host "Don't forget: docs\NETWORK_LOCKDOWN.md for DoH/DoT/DoQ bypass prevention."
