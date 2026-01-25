const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Expose only specific, validated IPC methods to renderer
contextBridge.exposeInMainWorld("electron", {
  getApiPort: () => ipcRenderer.invoke("get-api-port"),
  getDesktopPath: () => ipcRenderer.invoke("get-desktop-path"),
  watchDirectory: (path: string) => ipcRenderer.invoke("watch-directory", path),
  onDirectoryChanged: (callback: (path: string) => void) => {
    // Remove existing listeners to avoid duplicates if possible, or leave it to component cleanup
    ipcRenderer.removeAllListeners('directory-changed');
    ipcRenderer.on('directory-changed', (event: Electron.IpcRendererEvent, path: string) => callback(path));
  },
  openPath: (path: string) => ipcRenderer.invoke("open-path", path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  readTextFile: (path: string) => ipcRenderer.invoke('read-text-file', path),
  readImageAsBase64: (path: string) => ipcRenderer.invoke('read-image-as-base64', path),
  listFiles: (args: { path: string; extensions?: string[] }) => ipcRenderer.invoke('list-files', args),
  batchRename: (operations: { original: string; new: string }[]) => ipcRenderer.invoke('batch-rename', operations),
  getFolderSize: (path: string) => ipcRenderer.invoke('get-folder-size', path),
  
  // Get file path from dropped File object (for drag & drop with sandbox enabled)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
