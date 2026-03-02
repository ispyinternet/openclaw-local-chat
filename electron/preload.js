const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatDesktop', {
  getAppMeta: () => ipcRenderer.invoke('app:get-version'),
  data: {
    getInitialState: () => ipcRenderer.invoke('data:get-initial-state'),
    getMessages: (sessionId) => ipcRenderer.invoke('data:get-messages', sessionId),
    searchMessages: (query) => ipcRenderer.invoke('data:search', query)
  }
});
