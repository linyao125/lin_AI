#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template. Fill it before starting the service."
fi

echo "Install complete. Next steps:"
echo "1) edit .env"
echo "2) sudo cp deploy/lin-system.service /etc/systemd/system/lin-system.service"
echo "3) sudo systemctl daemon-reload && sudo systemctl enable --now lin-system"
