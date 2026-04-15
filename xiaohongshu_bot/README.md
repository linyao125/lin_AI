# 小红书Bot

## 安装
```cmd
cd D:\lin_AI\xiaohongshu_bot
pip install -r requirements.txt
playwright install chromium
```

## 配置
编辑 `config.json`（首次运行自动生成）：
```json
{
  "linai_api_base": "http://101.43.56.65",
  "xhs_username": "你的手机号（可选）",
  "xhs_password": "你的密码（可选）",
  "image_provider": "dalle",
  "post_interval_hours": 8
}
```

## 使用
```cmd
python main.py login        # 首次登录
python main.py post         # 立即发帖
python main.py post --topic "今天很开心"
python main.py daemon       # 情绪驱动守护进程
```