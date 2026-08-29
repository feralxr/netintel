# Linux service install

```bash
sudo ./packaging/linux/install.sh
```

This:
1. Creates a dedicated `netintel` system user (no login shell, no home dir)
2. Copies the repo to `/opt/netintel`
3. Creates `/var/lib/netintel` for the database
4. Installs dependencies and builds all packages, **including the web dashboard**
5. Creates `packages/server/.env` from `.env.example` (pre-filled with the data directory)
6. Runs database migrations
7. Installs and enables a systemd service (`netintel.service`) with `Restart=on-failure` — automatic restart on crash. The service loads config via systemd's native `EnvironmentFile=`, pointed at `packages/server/.env`.

After install, edit `/opt/netintel/packages/server/.env` to set your real Technitium URL/token (**required** — netintel has no mock/demo mode; also make sure the Query Logs (Sqlite) app is installed and enabled in Technitium — see the main [`docs/SETUP.md`](../../docs/SETUP.md)), then:

```bash
sudo systemctl start netintel
sudo journalctl -u netintel -f
```

(No `daemon-reload` needed for `.env` edits — only if you change the unit file itself. Just restart: `sudo systemctl restart netintel`.)

Once running, the dashboard is available directly at `http://<this-machine>:8787/` — the API server serves the built frontend itself, no separate web server needed.

## Serving the dashboard behind a reverse proxy (optional)

The dashboard is served automatically at the API port with zero extra config. Put nginx/Caddy/etc. in front of it only if you want something the API server itself doesn't handle — TLS termination, a custom domain, additional auth, or serving multiple services off one host. It's not required for netintel to work.

Example nginx snippet, proxying everything through to netintel's own server:
```nginx
location / { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
```

## Uninstall

```bash
sudo systemctl disable --now netintel
sudo rm /etc/systemd/system/netintel.service
sudo rm -rf /opt/netintel
# /var/lib/netintel (your data) is left in place — remove manually if you want a clean wipe
```
