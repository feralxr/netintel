# Windows service install

Runs netintel as a proper Windows service (auto-start, auto-restart-on-crash) using [NSSM](https://nssm.cc/), the standard tool for wrapping arbitrary executables (like a Node.js process) as a Windows service — Windows has no first-class equivalent to systemd, so NSSM is the pragmatic choice here.

## Prerequisites

- Node.js 20+ installed and on PATH
- NSSM: `winget install NSSM.NSSM` (or download from nssm.cc and add to PATH)

## Install

From an **elevated (Administrator) PowerShell** prompt, from the repo root:

```powershell
.\packaging\windows\install.ps1
```

This:
1. Copies the repo to `C:\netintel`
2. Creates `%ProgramData%\netintel` for the database
3. Installs dependencies and builds all packages
4. Creates `packages\server\.env` from `.env.example` (pre-filled with the data directory)
5. Runs database migrations
6. Registers a Windows service named `netintel` via NSSM, configured to auto-restart on crash (`AppExit Default Restart`) — this is the "auto-restart on crash" behavior described in the v1 bible's resilience section. The service's working directory is set to `packages\server`, so it picks up `.env` automatically — no NSSM environment configuration needed.

## After install

Set your Technitium connection details by editing `C:\netintel\packages\server\.env` (both `NETINTEL_TECHNITIUM_URL` and `NETINTEL_TECHNITIUM_TOKEN` are required — netintel has no mock/demo mode), then:

```powershell
Restart-Service netintel   # if the service was already started, so it picks up the .env change
Start-Service netintel     # if it wasn't running yet
Get-Service netintel       # check status
```

## Serving the web dashboard

Build it and serve it with IIS, Caddy, or `npx serve`, pointed at `apps\web\dist` after running `npm run build -w @netintel/web`. Proxy `/api` and `/ws` on that host to the API server's port (default 8787) — see IIS's URL Rewrite + Application Request Routing modules, or use Caddy for a much simpler reverse-proxy config.

## Uninstall

```powershell
Stop-Service netintel
nssm remove netintel confirm
Remove-Item -Recurse -Force C:\netintel
# %ProgramData%\netintel (your data) is left in place — remove manually for a clean wipe
```
