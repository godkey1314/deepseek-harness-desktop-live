import { app, dialog, Notification } from 'electron'
import electronUpdater from 'electron-updater'
import { exec, spawn } from 'node:child_process'
import semver from 'semver'

const { autoUpdater } = electronUpdater

const NPM_PACKAGE = '@deepseek-ai/dsh'
const DESKTOP_UPDATE_URL_ENV = 'DSH_DESKTOP_UPDATE_URL'
const ALLOW_DSH_UPDATE_ENV = 'DSH_DESKTOP_ALLOW_DSH_UPDATE'

export interface DesktopUpdateInfo {
  version: string
}

export interface DesktopUpdaterHandlers {
  onUpdateAvailable?: (info: DesktopUpdateInfo) => void
  onUpdateNotAvailable?: () => void
  onUpdateDownloaded?: (info: DesktopUpdateInfo) => void
  onError?: (error: Error) => void
}

let handlers: DesktopUpdaterHandlers = {}
let updateAvailableInfo: DesktopUpdateInfo | null = null
let downloaded = false

function runCommand(command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        resolve('')
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function getLocalDshVersion(): Promise<string | null> {
  const output = await runCommand('dsh --version', 10_000)
  return output.split(/\r?\n/)[0]?.trim() || null
}

async function getLatestDshVersion(): Promise<string | null> {
  const output = await runCommand(`npm view ${NPM_PACKAGE} version`, 15_000)
  return output || null
}

function installDshUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', `${NPM_PACKAGE}@latest`], {
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      console.log(`[dsh-update] ${chunk.toString().trimEnd()}`)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[dsh-update] ${chunk.toString().trimEnd()}`)
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

export async function checkForDshUpdate(): Promise<void> {
  if (!app.isPackaged && process.env[ALLOW_DSH_UPDATE_ENV] !== '1') {
    return
  }

  const [local, latest] = await Promise.all([getLocalDshVersion(), getLatestDshVersion()])
  if (!local || !latest) {
    return
  }

  let isNewer: boolean
  try {
    isNewer = semver.gt(latest, local)
  } catch {
    return
  }

  if (!isNewer) {
    return
  }

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'DeepSeek Harness 更新',
    message: `发现 dsh 新版本 ${latest}（当前 ${local}）`,
    detail: '是否现在下载并安装？安装完成后请重启应用。',
    buttons: ['立即更新', '稍后'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response !== 0) {
    return
  }

  const ok = await installDshUpdate()
  if (ok) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness 更新',
      message: 'dsh 已更新到最新版本。',
      detail: '请重启 DeepSeek Harness 桌面版以生效。',
    })
  } else {
    await dialog.showMessageBox({
      type: 'error',
      title: 'DeepSeek Harness 更新',
      message: 'dsh 更新失败。',
      detail: '请稍后重试，或手动执行：npm install -g @deepseek-ai/dsh@latest',
    })
  }
}

export function setupDesktopUpdater(updateHandlers: DesktopUpdaterHandlers = {}): void {
  handlers = updateHandlers
  const updateUrl = process.env[DESKTOP_UPDATE_URL_ENV]

  if (updateUrl) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl })
    } catch (error) {
      console.error('[updater] failed to configure update feed:', error)
      return
    }
  } else if (!app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = false

  const version = app.getVersion()
  const prereleaseTag = version.includes('-') ? version.slice(version.indexOf('-') + 1).split('.')[0] : undefined
  if (prereleaseTag) {
    autoUpdater.channel = prereleaseTag
  }

  autoUpdater.on('update-available', (info) => {
    updateAvailableInfo = { version: info.version }
    downloaded = false
    handlers.onUpdateAvailable?.(updateAvailableInfo)
    if (Notification.isSupported()) {
      new Notification({
        title: '发现新版本',
        body: `DeepSeek Harness Desktop Live ${info.version} 可更新，点击菜单“更新”开始下载。`,
      }).show()
    }
  })

  autoUpdater.on('update-not-available', () => {
    updateAvailableInfo = null
    downloaded = false
    handlers.onUpdateNotAvailable?.()
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    handlers.onUpdateDownloaded?.({ version: info.version })
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] desktop update check failed:', error)
    handlers.onError?.(error)
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[updater] checkForUpdates failed:', error)
    })
  }, 10_000)
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error('[updater] manual checkForUpdates failed:', error)
  }
}

export async function downloadUpdate(): Promise<boolean> {
  if (downloaded) {
    autoUpdater.quitAndInstall()
    return true
  }

  if (!updateAvailableInfo) {
    return false
  }

  try {
    await autoUpdater.downloadUpdate()
    downloaded = true
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness 更新',
      message: `新版本 ${updateAvailableInfo.version} 已下载完成。`,
      detail: '是否立即重启并安装？',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
    return true
  } catch (error) {
    console.error('[updater] downloadUpdate failed:', error)
    return false
  }
}

export function getDesktopUpdateState(): { available: boolean; version: string | null; downloaded: boolean } {
  return {
    available: updateAvailableInfo !== null,
    version: updateAvailableInfo?.version ?? null,
    downloaded,
  }
}
