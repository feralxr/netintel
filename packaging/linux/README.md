# Linux service install

```bash
sudo ./packaging/linux/install.sh
```

This:
1. Creates a dedicated `netintel` system user (no login shell, no home dir)
2. Copies the repo to `/opt/netintel`
3. Creates `/var/lib/netintel` for the database
4. Installs dependencies and builds all packages
5. Creates `packages/server/.env` from `.env.example` (pre-filled with the data directory)
6. Runs database migrations
7. Installs and enables a systemd service (`netintel.service`) with `Restart=on-failure` — this is the "auto-restart on crash" behavior described in the v1 bible's resilience section. The service loads config via systemd's native `EnvironmentFile=`, pointed at `packages/server/.env`.

After install, edit `/opt/netintel/packages/server/.env` to set your real Technitium URL/token (**required** — netintel has no mock/demo mode), then:

```bash
sudo systemctl start netintel
sudo journalctl -u netintel -f
```

(No `daemon-reload` needed for `.env` edits — only if you change the unit file itself. Just restart: `sudo systemctl restart netintel`.)

## Serving the web dashboard

The API server doesn't serve the frontend itself in v1 — build it and serve it with any static file server (nginx, Caddy, `serve`, etc.), pointed at `apps/web/dist` after running `npm run build -w @netintel/web`. Proxy `/api` and `/ws` on that same host to the API server's port (default 8787), matching the `vite.config.ts` dev proxy setup.

Example nginx snippet:
```nginx
location /api { proxy_pass http://127.0.0.1:8787; }
location /ws  { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
location /    { root /opt/netintel/apps/web/dist; try_files $uri /index.html; }
```

## Uninstall

```bash
sudo systemctl disable --now netintel
sudo rm /etc/systemd/system/netintel.service
sudo rm -rf /opt/netintel
# /var/lib/netintel (your data) is left in place — remove manually if you want a clean wipe
```
