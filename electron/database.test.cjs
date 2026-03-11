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
