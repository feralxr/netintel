# Windows service install

Runs netintel as a proper Windows service (auto-start, auto-restart-on-crash) using [NSSM](https://nssm.cc/), the standard tool for wrapping arbitrary executables (like a Node.js process) as a Windows service — Windows has no first-class equivalent to systemd, so NSSM is the pragmatic choice here.

## Prerequisites

- Node.js 26+ installed and on PATH — netintel targets the latest Node release; see the note in the root README if you'd rather run an LTS release instead
- NSSM: `winget install NSSM.NSSM` (or download from nssm.cc and add to PATH)

## Install

From an **elevated (Administrator) PowerShell** prompt, from the repo root:

```powershell
.\packaging\windows\install.ps1
```

This:
1. Copies the repo to `C:\netintel`
2. Creates `%ProgramData%\netintel` for the database
3. Installs dependencies and builds all packages, **including the web dashboard**
4. Creates `packages\server\.env` from `.env.example` (pre-filled with the data directory)
5. Runs database migrations
6. Registers a Windows service named `netintel` via NSSM, configured to auto-restart on crash (`AppExit Default Restart`). The service's working directory is set to `packages\server`, so it picks up `.env` automatically — no NSSM environment configuration needed.

## After install

Set your Technitium connection details by editing `C:\netintel\packages\server\.env` (both `NETINTEL_TECHNITIUM_URL` and `NETINTEL_TECHNITIUM_TOKEN` are required — netintel has no mock/demo mode; also make sure the Query Logs (Sqlite) app is installed and enabled in Technitium — see the main [`docs/SETUP.md`](../../docs/SETUP.md)), then:

```powershell
Restart-Service netintel   # if the service was already started, so it picks up the .env change
Start-Service netintel     # if it wasn't running yet
Get-Service netintel       # check status
```

Once running, the dashboard is available directly at `http://<this-machine>:8787/` — the API server serves the built frontend itself, no separate web server needed.

## Serving the dashboard behind a reverse proxy (optional)

The dashboard is served automatically at the API port with zero extra config. Put IIS/Caddy/etc. in front of it only if you want something the API server itself doesn't handle — TLS termination, a custom domain, additional auth. It's not required for netintel to work — see IIS's URL Rewrite + Application Request Routing modules, or use Caddy for a much simpler reverse-proxy config, proxying everything through to `http://127.0.0.1:8787`.

## Uninstall

```powershell
Stop-Service netintel
nssm remove netintel confirm
Remove-Item -Recurse -Force C:\netintel
# %ProgramData%\netintel (your data) is left in place — remove manually for a clean wipe
```
