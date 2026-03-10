const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createDatabase } = require('./database');
const { extractAgentText } = require('./agent-response.cjs');
const { normalizeGatewaySessionsPayload } = require('./gateway-sessions.cjs');
const { summarizeExecError } = require('./cli-error.cjs');

const execFileAsync = promisify(execFile);

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

ipcMain.handle('app:open-logs', async () => {
  const logPath = app.getPath('logs');
  await shell.openPath(logPath);
  return { ok: true, path: logPath };
});

ipcMain.handle('data:get-initial-state', () => {
  return database.getInitialState();
});

ipcMain.handle('data:get-messages', (_event, sessionId) => {
  return database.getMessagesForSession(sessionId);
});

ipcMain.handle('data:search', (_event, query) => {
  return database.searchMessages(query);
});

ipcMain.handle('data:get-composer-drafts', () => {
  return database.getComposerDrafts();
});

ipcMain.handle('data:set-composer-drafts', (_event, drafts) => {
  return database.setComposerDrafts(drafts);
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
  try {
    const { stdout } = await execFileAsync('openclaw', ['sessions', '--json'], { maxBuffer: 2 * 1024 * 1024 });
    const parsed = JSON.parse(stdout || '{}');
    const sessions = normalizeGatewaySessionsPayload(parsed);
    return database.upsertGatewaySessions(sessions);
  } catch (error) {
    const reason = summarizeExecError(error, 'Unable to sync sessions');
    throw new Error(`Unable to sync sessions: ${reason}`);
  }
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
      { timeout: 180000, maxBuffer: 2 * 1024 * 1024 }
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
      content: `Gateway send failed: ${summarizeExecError(error, 'unknown error')}`,
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
