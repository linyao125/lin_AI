# Lin Companion System

A lightweight single-user companion system designed around four code modules:
- memory hub
- context anchoring
- cost control
- dedicated binding

It is intentionally built as a reusable template: change `.env`, `config/config.yaml`, and deploy it to a different server to reuse the system for another persona/user pair.

## What is included
- FastAPI backend
- zero-build frontend (HTML/CSS/JS)
- OpenRouter / OpenAI-compatible chat provider
- SQLite memory + message store
- context anchoring and memory injection
- cache + duplicate guard for token savings
- scheduled heartbeat insertion without spending tokens by default
- runtime settings panel
- usage and estimated cost panel
- deploy scripts for Ubuntu + systemd

## 1. Local start
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and config/config.yaml
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open: http://127.0.0.1:8000

## 2. Minimum setup you must change
### `.env`
- `ACCESS_TOKEN`
- `LLM_API_KEY` (use a newly created key; do not reuse leaked keys)
- `LLM_PRIMARY_MODEL`
- `LLM_SUMMARY_MODEL`

### `config/config.yaml`
- assistant persona
- user profile
- core memories
- heartbeat text
- cost parameters

## 3. Ubuntu server deploy
```bash
bash deploy/deploy.sh
sudo cp deploy/lin-system.service /etc/systemd/system/lin-system.service
sudo systemctl daemon-reload
sudo systemctl enable lin-system
sudo systemctl start lin-system
sudo systemctl status lin-system
```
Then open:
- `http://YOUR_SERVER_IP:8000`

## 4. Optional nginx reverse proxy
```bash
sudo cp deploy/nginx.lin-system.conf /etc/nginx/sites-available/lin-system
sudo ln -s /etc/nginx/sites-available/lin-system /etc/nginx/sites-enabled/lin-system
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Login
Open the app and enter the same value as `ACCESS_TOKEN`.

## 6. Productization direction
This repository is intentionally organized to support resale / reuse as a template:
- provider details live in `.env`
- persona and memory policy live in `config/config.yaml`
- runtime toggles live in the database settings panel
- storage is local SQLite for MVP, easy to swap later
- modules are separated by function for later upgrade

## 7. Security note
If a key was pasted into chat or committed anywhere, revoke it immediately and create a new one.
