"""
叮咚聊天窗口
"""
import threading
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTextEdit,
    QLineEdit, QPushButton, QLabel, QScrollArea, QFrame
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QObject
from PyQt6.QtGui import QFont, QKeyEvent
from config import load_settings, save_settings


class ChatSignals(QObject):
    chunk_received = pyqtSignal(str)
    done = pyqtSignal(str, str)  # full_text, new_conv_id
    error = pyqtSignal(str)


class ChatWindow(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("和叮咚聊天")
        self.setWindowFlags(Qt.WindowType.Window)
        self.resize(400, 560)
        self.settings = load_settings()
        self.conv_id = self.settings.get("conv_id", "new")
        self._sending = False
        self.signals = ChatSignals()
        self.signals.chunk_received.connect(self._on_chunk)
        self.signals.done.connect(self._on_done)
        self.signals.error.connect(self._on_error)
        self._current_ai_text = ""
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        # 标题
        title = QLabel("💬 和叮咚聊天")
        title.setStyleSheet("font-size: 15px; font-weight: bold; color: #333;")
        layout.addWidget(title)

        # 对话区
        self.chat_area = QTextEdit()
        self.chat_area.setReadOnly(True)
        self.chat_area.setStyleSheet("""
            QTextEdit {
                background: #f9f9f9;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 8px;
                font-size: 13px;
                color: #333;
            }
        """)
        layout.addWidget(self.chat_area, stretch=1)

        # 输入区
        input_row = QHBoxLayout()
        self.input_box = QLineEdit()
        self.input_box.setPlaceholderText("说点什么...")
        self.input_box.setStyleSheet("""
            QLineEdit {
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 13px;
            }
        """)
        self.input_box.returnPressed.connect(self._send)
        input_row.addWidget(self.input_box, stretch=1)

        self.send_btn = QPushButton("发送")
        self.send_btn.setStyleSheet("""
            QPushButton {
                background: #1a1a1a;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 13px;
            }
            QPushButton:disabled { background: #999; }
        """)
        self.send_btn.clicked.connect(self._send)
        input_row.addWidget(self.send_btn)
        layout.addLayout(input_row)

        # 状态栏
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("font-size: 11px; color: #999;")
        layout.addWidget(self.status_label)

    def _send(self):
        if self._sending:
            return
        text = self.input_box.text().strip()
        if not text:
            return
        self.input_box.clear()
        self._append_msg("我", text, "#333")
        self._set_sending(True)
        self._current_ai_text = ""

        def _worker():
            try:
                from linai_client import send_message_stream
                new_conv_id = self.conv_id
                full = ""
                first = True
                for chunk, is_done, cid in send_message_stream(text, self.conv_id):
                    new_conv_id = cid
                    if chunk:
                        full += chunk
                        self.signals.chunk_received.emit(chunk)
                    if is_done:
                        break
                self.signals.done.emit(full, new_conv_id)
            except Exception as e:
                self.signals.error.emit(str(e))

        t = threading.Thread(target=_worker, daemon=True)
        t.start()

    def _on_chunk(self, chunk: str):
        if not self._current_ai_text:
            # 第一个chunk，加叮咚前缀
            self.chat_area.append("<b style='color:#e67e22'>叮咚：</b>")
        self._current_ai_text += chunk
        # 追加到最后
        cursor = self.chat_area.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        cursor.insertText(chunk)
        self.chat_area.setTextCursor(cursor)
        self.chat_area.ensureCursorVisible()

    def _on_done(self, full_text: str, new_conv_id: str):
        self.conv_id = new_conv_id
        self.settings["conv_id"] = new_conv_id
        save_settings(self.settings)
        self.chat_area.append("")  # 空行间隔
        self._set_sending(False)

    def _on_error(self, err: str):
        self._append_msg("❌ 错误", err, "#e74c3c")
        self._set_sending(False)

    def _append_msg(self, role: str, text: str, color: str):
        self.chat_area.append(f"<b style='color:{color}'>{role}：</b>{text}")
        self.chat_area.append("")

    def _set_sending(self, sending: bool):
        self._sending = sending
        self.send_btn.setEnabled(not sending)
        self.input_box.setEnabled(not sending)
        self.status_label.setText("叮咚思考中..." if sending else "")