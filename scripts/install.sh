#!/bin/bash

set -e

echo "🚀 开始部署 LIN_AI..."

# 检查项目目录
if [ ! -f "requirements.txt" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

PROJECT_DIR=$(pwd)
SERVICE_NAME="linai"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "📦 更新系统..."
sudo apt update -y

echo "🐍 安装依赖..."
sudo apt install -y python3.11 python3.11-venv python3-pip git lsof

echo "📁 创建虚拟环境..."
if [ ! -d ".venv" ]; then
    python3.11 -m venv .venv
fi

echo "⚙️ 安装依赖..."
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "🔑 检查 .env..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "⚠️ 请编辑 .env 填写 LLM_API_KEY"
fi

echo "🧱 创建 systemd 服务..."

sudo bash -c "cat > ${SERVICE_FILE}" <<EOF
[Unit]
Description=LIN_AI FastAPI Service
After=network.target

[Service]
User=root
WorkingDirectory=${PROJECT_DIR}
ExecStart=${PROJECT_DIR}/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "🧹 清理端口 8000..."
if sudo lsof -i:8000 -t >/dev/null 2>&1; then
    sudo fuser -k 8000/tcp || true
    sleep 1
fi

echo "🔄 重载服务..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "🌐 获取公网IP..."
PUBLIC_IP=$(curl -s ifconfig.me || echo "你的服务器IP")

echo ""
echo "================================="
echo "✅ 部署完成"
echo "访问地址: http://${PUBLIC_IP}:8000"
echo "================================="
