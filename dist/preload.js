const { contextBridge, ipcRenderer } = require("electron");
// Expose only specific, validated IPC methods to renderer
contextBridge.exposeInMainWorld("electron", {
    getApiPort: () => ipcRenderer.invoke("get-api-port"),
    getDesktopPath: () => ipcRenderer.invoke("get-desktop-path"),
    watchDirectory: (path) => ipcRenderer.invoke("watch-directory", path),
    onDirectoryChanged: (callback) => {
        // Remove existing listeners to avoid duplicates if possible, or leave it to component cleanup
        ipcRenderer.removeAllListeners('directory-changed');
        ipcRenderer.on('directory-changed', (event, path) => callback(path));
    },
    openPath: (path) => ipcRenderer.invoke("open-path", path),
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
    readTextFile: (path) => ipcRenderer.invoke('read-text-file', path),
    readImageAsBase64: (path) => ipcRenderer.invoke('read-image-as-base64', path),
    listFiles: (args) => ipcRenderer.invoke('list-files', args),
});
