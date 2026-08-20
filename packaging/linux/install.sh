#!/usr/bin/env bash
# netintel Linux install script.
# Run as root (or with sudo) from the repo root: sudo ./packaging/linux/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_DIR="/opt/netintel"
DATA_DIR="/var/lib/netintel"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./packaging/linux/install.sh)"
  exit 1
fi

echo "==> Creating netintel system user"
id -u netintel &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin netintel

echo "==> Copying repo to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$REPO_DIR"/. "$INSTALL_DIR"/
chown -R netintel:netintel "$INSTALL_DIR"

echo "==> Creating data directory $DATA_DIR"
mkdir -p "$DATA_DIR"
chown -R netintel:netintel "$DATA_DIR"

echo "==> Installing dependencies and building"
cd "$INSTALL_DIR"
npm install --omit=dev --production=false
npm run build

echo "==> Setting up .env"
ENV_FILE="$INSTALL_DIR/packages/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$INSTALL_DIR/packages/server/.env.example" "$ENV_FILE"
  # Pre-fill the data dir we just created so at least one required-adjacent value is correct out of the box.
  sed -i "s|^# NETINTEL_DATA_DIR=.*|NETINTEL_DATA_DIR=$DATA_DIR|" "$ENV_FILE"
  chown netintel:netintel "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "==> Running database migrations"
cd "$INSTALL_DIR/packages/server"
sudo -u netintel npm run db:migrate

echo "==> Installing systemd service"
cp "$INSTALL_DIR/packaging/linux/netintel.service" /etc/systemd/system/netintel.service
systemctl daemon-reload
systemctl enable netintel.service

echo ""
echo "Install complete. Before starting the service:"
echo "  1. Edit $ENV_FILE and set NETINTEL_TECHNITIUM_URL / NETINTEL_TECHNITIUM_TOKEN"
echo "     (netintel requires a real Technitium instance — there is no mock/demo mode)"
echo "  2. systemctl start netintel"
echo "  3. journalctl -u netintel -f    # to watch logs"
echo ""
echo "Don't forget: docs/NETWORK_LOCKDOWN.md for DoH/DoT/DoQ bypass prevention."
