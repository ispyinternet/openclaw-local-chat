const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const Module = require('node:module');

function loadCommonJsModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const wrapped = Module.wrap(code);
  const script = new vm.Script(wrapped, { filename: filePath });
  const fn = script.runInThisContext();
  const mod = { exports: {} };
  const localRequire = Module.createRequire(filePath);
  fn(mod.exports, localRequire, mod, filePath, path.dirname(filePath));
  return mod.exports;
}

const { ChatDatabase } = loadCommonJsModule(path.join(__dirname, 'database.cjs'));

function createDb() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-desktop-db-'));
  const userData = path.join(tmpRoot, 'user-data');
  fs.mkdirSync(userData, { recursive: true });

  const app = {
    getPath(name) {
      if (name !== 'userData') throw new Error(`Unexpected path request: ${name}`);
      return userData;
    }
  };

  try {
    const db = new ChatDatabase(app);
    return { db, tmpRoot, error: null };
  } catch (error) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return { db: null, tmpRoot: null, error };
  }
}

function cleanupDb(db, tmpRoot) {
  db.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

test('setComposerDrafts keeps non-empty drafts and drops blank entries', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    const saved = db.setComposerDrafts({
      'sess-1': 'hello',
      'sess-2': '   ',
      'sess-3': ' draft '
    });

    assert.deepEqual(saved, {
      'sess-1': 'hello',
      'sess-3': ' draft '
    });

    assert.deepEqual(db.getComposerDrafts(), saved);
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('searchMessages tolerates punctuation-heavy queries', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    const results = db.searchMessages('!!! ::: "" (( )) &&&&');
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('searchMessages still returns matches for regular terms', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    const results = db.searchMessages('gateway');
    assert.ok(results.length > 0);
    assert.ok(results.some((row) => typeof row.snippet === 'string' && row.snippet.length > 0));
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('addMessage auto-titles untitled chats from first user message and truncates to 72 chars', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status)
      VALUES ('untitled-chat', 'active', 'New chat', 'Local', '', 0, 'dm', 'live')
    `).run();

    const content = `   ${'A'.repeat(90)}   `;
    db.addMessage({ sessionId: 'untitled-chat', content, role: 'user', author: 'Operator' });

    const session = db.db.prepare('SELECT name FROM sessions WHERE id = ?').get('untitled-chat');
    assert.equal(session.name, 'A'.repeat(72));
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('addMessage keeps existing chat title stable after initial generation', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status)
      VALUES ('stable-title-chat', 'active', '', 'Local', '', 0, 'dm', 'live')
    `).run();

    db.addMessage({ sessionId: 'stable-title-chat', content: '   First user message title   ', role: 'user', author: 'Operator' });
    db.addMessage({ sessionId: 'stable-title-chat', content: 'Second message should not retitle', role: 'user', author: 'Operator' });

    const session = db.db.prepare('SELECT name FROM sessions WHERE id = ?').get('stable-title-chat');
    assert.equal(session.name, 'First user message title');
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('setSessionAgent persists per-chat agent metadata and defaults display name', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status)
      VALUES ('agent-chat', 'active', 'Agent chat', 'Local', '', 0, 'dm', 'live')
    `).run();

    const updated = db.setSessionAgent('agent-chat', {
      agentId: 'openai/gpt-5.3-codex'
    });

    assert.equal(updated.agentId, 'openai/gpt-5.3-codex');
    assert.equal(updated.agentDisplayName, 'openai/gpt-5.3-codex');

    const hydrated = db.getSectionsWithSessions()
      .flatMap((section) => section.sessions)
      .find((session) => session.id === 'agent-chat');

    assert.equal(hydrated.agentId, 'openai/gpt-5.3-codex');
    assert.equal(hydrated.agentDisplayName, 'openai/gpt-5.3-codex');

    const systemNotes = db.getMessagesForSession('agent-chat')
      .filter((message) => message.role === 'system');
    assert.equal(systemNotes.length, 1);
    assert.equal(systemNotes[0].content, 'Switched to openai/gpt-5.3-codex');
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('setSessionAgent normalizes blank agent to main and keeps Primary display name', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status)
      VALUES ('main-agent-chat', 'active', 'Main agent chat', 'Local', '', 0, 'dm', 'live')
    `).run();

    const updated = db.setSessionAgent('main-agent-chat', {
      agentId: '   ',
      agentDisplayName: ' '
    });

    assert.equal(updated.agentId, 'main');
    assert.equal(updated.agentDisplayName, 'Primary');

    const hydrated = db.getSectionsWithSessions()
      .flatMap((section) => section.sessions)
      .find((session) => session.id === 'main-agent-chat');

    assert.equal(hydrated.agentId, 'main');
    assert.equal(hydrated.agentDisplayName, 'Primary');

    const systemNotes = db.getMessagesForSession('main-agent-chat')
      .filter((message) => message.role === 'system');
    assert.equal(systemNotes.length, 0);
  } finally {
    cleanupDb(db, tmpRoot);
  }
});
