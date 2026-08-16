import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopUpdateInfo {
  version: string
}

export interface DesktopUpdateState {
  available: boolean
  version: string | null
  downloaded: boolean
}

const api = {
  checkForUpdates: (): void => {
    ipcRenderer.send('updater:check')
  },
  downloadUpdate: (): void => {
    ipcRenderer.send('updater:download')
  },
  getUpdateState: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('updater:get-state'),
  onUpdateAvailable: (callback: (info: DesktopUpdateInfo) => void): void => {
    ipcRenderer.on('updater:update-available', (_event, info: DesktopUpdateInfo) => callback(info))
  },
  onUpdateNotAvailable: (callback: () => void): void => {
    ipcRenderer.on('updater:update-not-available', () => callback())
  },
  onUpdateDownloaded: (callback: (info: DesktopUpdateInfo) => void): void => {
    ipcRenderer.on('updater:update-downloaded', (_event, info: DesktopUpdateInfo) => callback(info))
  },
}

contextBridge.exposeInMainWorld('desktopUpdater', api)
