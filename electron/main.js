const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createDatabase } = require('./database');

const execFileAsync = promisify(execFile);

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

let mainWindow;
let database;

function extractAgentText(stdout) {
  if (!stdout) return '';
  try {
    const payload = JSON.parse(stdout);
    return payload?.reply?.message || payload?.message || payload?.text || payload?.output || payload?.response || '';
  } catch {
    return String(stdout).trim();
  }
}

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

ipcMain.handle('data:sync-gateway-sessions', async () => {
  const { stdout } = await execFileAsync('openclaw', ['sessions', '--json'], { maxBuffer: 2 * 1024 * 1024 });
  const parsed = JSON.parse(stdout || '{}');
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  return database.upsertGatewaySessions(sessions);
});

ipcMain.handle('data:send-message', async (_event, payload) => {
  const userMessage = database.addMessage(payload);

  const looksLikeGatewaySession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload?.sessionId || '');
  if (!looksLikeGatewaySession) {
    return { userMessage, assistantMessage: null };
  }

  try {
    const { stdout } = await execFileAsync(
      'openclaw',
      ['agent', '--session-id', payload.sessionId, '--message', payload.content, '--json'],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
    );

    const reply = extractAgentText(stdout) || '(No reply text returned)';
    const assistantMessage = database.addMessage({
      sessionId: payload.sessionId,
      content: reply,
      role: 'assistant',
      author: 'OpenClaw'
    });

    return { userMessage, assistantMessage };
  } catch (error) {
    const assistantMessage = database.addMessage({
      sessionId: payload.sessionId,
      content: `Gateway send failed: ${error?.message || 'unknown error'}`,
      role: 'system',
      author: 'System'
    });

    return { userMessage, assistantMessage };
  }
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
