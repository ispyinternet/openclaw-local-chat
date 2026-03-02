const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatDesktop', {
  getAppMeta: () => ipcRenderer.invoke('app:get-version')
});
