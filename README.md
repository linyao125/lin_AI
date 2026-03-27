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

## 3. 小白一键部署（腾讯云轻量服务器 Ubuntu 22.04）

> 前提：服务器已开放端口 **8000**（云控制台防火墙 → 添加规则 → TCP 8000）。

**第一步：连接服务器**
```bash
ssh root@你的公网IP
```

**第二步：克隆项目**
```bash
cd /opt
git clone https://github.com/你的用户名/lin_AI.git lin_system
cd lin_system
```

**第三步：复制配置文件**
```bash
cp .env.example .env
```

**第四步：填写 OpenRouter API Key**
```bash
nano .env
```
找到下面两行，替换成你自己的值，然后按 `Ctrl+O` 保存，`Ctrl+X` 退出：
```
ACCESS_TOKEN=填一个你自己随机生成的长字符串
LLM_API_KEY=填你的OpenRouter密钥
```

**第五步：一键部署**
```bash
chmod +x scripts/install.sh
sudo bash scripts/install.sh
```
脚本会自动安装依赖、创建虚拟环境、注册并启动服务，完成后屏幕输出访问地址。

**第六步：浏览器访问**
```
http://你的公网IP:8000
```
页面出现登录框，输入第四步设置的 `ACCESS_TOKEN` 即可进入。

---

## 4. Ubuntu server deploy
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

## 5. Optional nginx reverse proxy
```bash
sudo cp deploy/nginx.lin-system.conf /etc/nginx/sites-available/lin-system
sudo ln -s /etc/nginx/sites-available/lin-system /etc/nginx/sites-enabled/lin-system
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Login
Open the app and enter the same value as `ACCESS_TOKEN`.

## 7. Productization direction
This repository is intentionally organized to support resale / reuse as a template:
- provider details live in `.env`
- persona and memory policy live in `config/config.yaml`
- runtime toggles live in the database settings panel
- storage is local SQLite for MVP, easy to swap later
- modules are separated by function for later upgrade

## 8. Security note
If a key was pasted into chat or committed anywhere, revoke it immediately and create a new one.
