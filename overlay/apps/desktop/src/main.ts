import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  checkForDshUpdate,
  checkForUpdates,
  downloadUpdate,
  getDesktopUpdateState,
  setupDesktopUpdater,
  type DesktopUpdateInfo,
} from './updater.js'

const DEFAULT_PORT = 3080
const PORT_SCAN_LIMIT = 20
const READY_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 500
const DSH_CHECK_DELAY_MS = 3_000

let child: ReturnType<typeof spawn> | null = null
let mainWindow: BrowserWindow | null = null
let quitting = false
let logFile = ''
let updateMenuItem: Electron.MenuItem | null = null

function initLog(): void {
  const candidates = [
    path.join(app.getPath('userData'), 'logs'),
    path.join(app.getPath('temp'), 'dsh-desktop-logs'),
  ]
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'main.log')
      appendFileSync(file, '')
      logFile = file
      return
    } catch {
      // try the next candidate; logging must never block startup
    }
  }
}

function log(message: string): void {
  if (!logFile) {
    return
  }
  try {
    appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    // log write failures are non-fatal
  }
}

function setupMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '更新',
      submenu: [
        {
          id: 'check-update',
          label: '检查更新…',
          click: () => {
            void handleUpdateAction()
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  updateMenuItem = menu.getMenuItemById('check-update')
  Menu.setApplicationMenu(menu)
}

async function handleUpdateAction(): Promise<void> {
  const state = getDesktopUpdateState()
  if (state.available) {
    await downloadUpdate()
  } else {
    await checkForUpdates()
  }
}

function notifyUpdateAvailable(info: DesktopUpdateInfo): void {
  if (updateMenuItem) {
    updateMenuItem.label = `检查更新（发现 v${info.version}）`
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:update-available', info)
  }
}

function notifyUpdateNotAvailable(): void {
  if (updateMenuItem) {
    updateMenuItem.label = '检查更新…'
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:update-not-available')
  }
}

function notifyUpdateDownloaded(info: DesktopUpdateInfo): void {
  if (updateMenuItem) {
    updateMenuItem.label = `重启安装 v${info.version}`
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:update-downloaded', info)
  }
}

function setupIpc(): void {
  ipcMain.on('updater:check', () => {
    void checkForUpdates()
  })
  ipcMain.on('updater:download', () => {
    void downloadUpdate()
  })
  ipcMain.handle('updater:get-state', () => getDesktopUpdateState())
}

function injectUpdateButton(win: BrowserWindow): void {
  win.webContents.insertCSS(`
    #dsh-live-update-badge {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 999999;
      display: none;
      padding: 6px 14px;
      border: none;
      border-radius: 999px;
      background: #e5484d;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    #dsh-live-update-badge:hover {
      background: #d93036;
    }
  `)

  win.webContents.executeJavaScript(`
    (() => {
      const existing = document.getElementById('dsh-live-update-badge')
      if (existing) existing.remove()
      const btn = document.createElement('button')
      btn.id = 'dsh-live-update-badge'
      btn.textContent = '更新'
      btn.addEventListener('click', () => {
        window.desktopUpdater?.downloadUpdate()
      })
      document.body.appendChild(btn)
      const show = (state) => {
        btn.style.display = 'block'
        btn.textContent = state.downloaded ? '重启安装' : '更新'
        btn.title = state.version ? '发现新版本 v' + state.version : '有新版本可更新'
      }
      const hide = () => { btn.style.display = 'none' }
      window.desktopUpdater?.onUpdateAvailable((info) => show({ ...info, downloaded: false }))
      window.desktopUpdater?.onUpdateDownloaded((info) => show({ ...info, downloaded: true }))
      window.desktopUpdater?.onUpdateNotAvailable(hide)
      window.desktopUpdater?.getUpdateState().then((state) => {
        if (state.available) show(state)
        else hide()
      })
    })()
  `).catch((error) => {
    console.error('[main] failed to inject update button:', error)
  })
}

function buildUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(startPort: number): Promise<number | null> {
  for (let port = startPort; port < startPort + PORT_SCAN_LIMIT; port += 1) {
    if (await isPortAvailable(port)) {
      return port
    }
  }
  return null
}

async function resolvePort(): Promise<number | null> {
  const configured = Number(process.env.DSH_DESKTOP_PORT)
  if (Number.isInteger(configured) && configured > 0) {
    if (await isPortAvailable(configured)) {
      return configured
    }
    dialog.showErrorBox(
      'DeepSeek Harness',
      `指定端口 ${configured} 已被占用。\n请更换 DSH_DESKTOP_PORT 后重试，或取消该环境变量以自动选择空闲端口。`,
    )
    return null
  }

  const port = await findAvailablePort(DEFAULT_PORT)
  if (port === null) {
    log(`no free port found from ${DEFAULT_PORT} to ${DEFAULT_PORT + PORT_SCAN_LIMIT - 1}`)
    dialog.showErrorBox('DeepSeek Harness', `从 ${DEFAULT_PORT} 开始的 ${PORT_SCAN_LIMIT} 个端口均被占用，无法启动。`)
  } else {
    log(`resolved port: ${port}`)
  }
  return port
}

function dshSpawnCommand(port: number): { command: string; args: string[]; shell: boolean } {
  const override = process.env.DSH_DESKTOP_COMMAND
  if (override) {
    const parts = override.split(/\s+/).filter(Boolean)
    return { command: parts[0] ?? 'dsh', args: parts.slice(1), shell: true }
  }
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `dsh web --port ${port}`], shell: false }
  }
  return { command: 'dsh', args: ['web', '--port', String(port)], shell: false }
}

function startDsh(port: number): void {
  const { command, args, shell } = dshSpawnCommand(port)
  log(`spawning dsh: ${command} ${args.join(' ')} (shell=${shell})`)
  child = spawn(command, args, {
    shell,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  child.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trimEnd()
    console.log(`[dsh] ${line}`)
    log(`[dsh:stdout] ${line}`)
  })
  child.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trimEnd()
    console.error(`[dsh] ${line}`)
    log(`[dsh:stderr] ${line}`)
  })

  child.on('error', (error) => {
    log(`dsh spawn error: ${error.message}`)
    if (!quitting) {
      dialog.showErrorBox(
        'DeepSeek Harness',
        `无法启动 dsh：${error.message}\n请确认已全局安装 dsh（npm install -g @deepseek-ai/dsh）。`,
      )
    }
  })

  child.on('exit', (code) => {
    log(`dsh exited with code ${code ?? 'unknown'}`)
    if (!quitting && code !== 0) {
      dialog.showErrorBox('DeepSeek Harness', `dsh 进程异常退出，退出码：${code ?? 'unknown'}`)
    }
    child = null
  })
}

function stopDsh(): void {
  if (!child?.pid) {
    return
  }
  const pid = child.pid
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

async function isServerReady(port: number): Promise<boolean> {
  const url = buildUrl(port)
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      return false
    }
    try {
      const response = await fetch(url)
      if (response.ok) {
        return true
      }
    } catch {
      // service not ready yet
    }
    await delay(POLL_INTERVAL_MS)
  }
  return false
}

async function createWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'DeepSeek Harness',
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(app.getAppPath(), 'dist', 'preload.js'),
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      injectUpdateButton(mainWindow)
    }
  })

  const url = buildUrl(port)
  if (!(await isServerReady(port))) {
    log(`server not ready at ${url}`)
    dialog.showErrorBox('DeepSeek Harness', `等待 dsh 服务超时（${url}）。请检查 dsh 是否安装并能正常运行。`)
    app.quit()
    return
  }

  log(`server ready at ${url}`)

  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(url)
  }
}

app.whenReady().then(async () => {
  initLog()
  log('app ready, starting desktop shell')
  setupMenu()
  setupIpc()
  const port = await resolvePort()
  if (port === null) {
    app.quit()
    return
  }

  startDsh(port)
  void createWindow(port)
  setupDesktopUpdater({
    onUpdateAvailable: (info) => notifyUpdateAvailable(info),
    onUpdateNotAvailable: () => notifyUpdateNotAvailable(),
    onUpdateDownloaded: (info) => notifyUpdateDownloaded(info),
  })
  setTimeout(() => {
    void checkForDshUpdate()
  }, DSH_CHECK_DELAY_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(port)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  quitting = true
  stopDsh()
})
