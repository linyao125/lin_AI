"""
叮咚桌面宠物 - 主入口
依赖：pip install PyQt6 requests
"""
import sys
import os
from PyQt6.QtWidgets import QApplication, QMessageBox, QStyleFactory
from PyQt6.QtGui import QColor, QPalette
from PyQt6.QtCore import QMessageLogContext, QtMsgType, qInstallMessageHandler


def _qt_msg_handler(mode, ctx, msg):
    if msg and "QFont::setPointSize" in msg:
        return
    print(msg, file=sys.stderr)


def main():
    app = QApplication(sys.argv)
    app.setStyle(QStyleFactory.create("Fusion"))
    app.setQuitOnLastWindowClosed(False)
    qInstallMessageHandler(_qt_msg_handler)

    try:
        from pet_core import DesktopPet
        pet = DesktopPet()
        pet.show()
        sys.exit(app.exec())
    except Exception as e:
        QMessageBox.critical(None, "启动失败", f"叮咚启动失败：{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()