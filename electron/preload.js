const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatDesktop', {
  getAppMeta: () => ipcRenderer.invoke('app:get-version'),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (payload) => ipcRenderer.invoke('settings:set', payload)
  },
  data: {
    getInitialState: () => ipcRenderer.invoke('data:get-initial-state'),
    getMessages: (sessionId) => ipcRenderer.invoke('data:get-messages', sessionId),
    searchMessages: (query) => ipcRenderer.invoke('data:search', query),
    reset: () => ipcRenderer.invoke('data:reset'),
    syncGatewaySessions: () => ipcRenderer.invoke('data:sync-gateway-sessions'),
    sendMessage: (payload) => ipcRenderer.invoke('data:send-message', payload)
  }
});
