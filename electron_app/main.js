const { app, BrowserWindow, Menu, Tray, shell, ipcMain } = require('electron')
const path = require('path')

const LINAI_URL = 'http://101.43.56.65'
let mainWindow = null
let tray = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    title: '叮咚',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#ffffff',
    show: false,
  })

  Menu.setApplicationMenu(null)
  mainWindow.loadURL(LINAI_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets/tray.png')
  tray = new Tray(iconPath)
  
  const menu = Menu.buildFromTemplate([
    { label: '显示叮咚', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '退出', click: () => {
      app.isQuiting = true
      app.quit()
    }}
  ])
  
  tray.setToolTip('叮咚')
  tray.setContextMenu(menu)
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})