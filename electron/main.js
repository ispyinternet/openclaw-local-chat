const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { createDatabase } = require('./database');

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

let mainWindow;
let database;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const url = new URL(
      path.join(__dirname, '..', 'dist', 'index.html'),
      'file:'
    );
    mainWindow.loadURL(url.href);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('app:get-version', () => ({
  version: app.getVersion(),
  platform: process.platform
}));

ipcMain.handle('data:get-initial-state', () => {
  return database.getInitialState();
});

ipcMain.handle('data:get-messages', (_event, sessionId) => {
  return database.getMessagesForSession(sessionId);
});

ipcMain.handle('data:search', (_event, query) => {
  return database.searchMessages(query);
});

ipcMain.handle('settings:get', () => {
  return database.getPreferences();
});

ipcMain.handle('settings:set', (_event, payload) => {
  return database.setPreferences(payload);
});

ipcMain.handle('data:reset', () => {
  return database.resetData();
});

app.whenReady().then(() => {
  database = createDatabase(app);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.setAppUserModelId('com.richard.chatdesktop');

app.on('before-quit', () => {
  database?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

Menu.setApplicationMenu(null);
