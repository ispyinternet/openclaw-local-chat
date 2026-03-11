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

test('first user message generates chat title and later messages do not retitle', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`INSERT INTO sections (id, title, position) VALUES ('test', 'Test', 42)`).run();
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status, agent_id, agent_display_name)
      VALUES ('new-chat', 'test', 'New chat', 'Slack', '', 0, 'dm', 'online', 'main', 'Main')
    `).run();

    db.addMessage({ sessionId: 'new-chat', role: 'user', content: '  **Plan** migration for _Friday_ deploy  ' });
    let session = db.getSessionById('new-chat');
    assert.equal(session.name, 'Plan migration for Friday deploy');

    db.addMessage({ sessionId: 'new-chat', role: 'user', content: 'second message should not retitle' });
    session = db.getSessionById('new-chat');
    assert.equal(session.name, 'Plan migration for Friday deploy');
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('blank-ish first user content falls back to New chat title', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    db.db.prepare(`INSERT INTO sections (id, title, position) VALUES ('test', 'Test', 42)`).run();
    db.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status, agent_id, agent_display_name)
      VALUES ('fallback-chat', 'test', 'New chat', 'Slack', '', 0, 'dm', 'online', 'main', 'Main')
    `).run();

    db.addMessage({ sessionId: 'fallback-chat', role: 'user', content: '```code```' });
    const session = db.getSessionById('fallback-chat');
    assert.equal(session.name, 'New chat');
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('agent metadata persists per chat and switch adds system timeline note', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    const alphaBefore = db.getSessionById('alpha');
    const otherBefore = db.getSessionById('ops-alerts');

    const result = db.setSessionAgent('alpha', { agentId: 'coder', agentDisplayName: 'Coder' });
    assert.equal(result.session.agentId, 'coder');
    assert.equal(result.session.agentDisplayName, 'Coder');
    assert.equal(result.systemMessage.role, 'system');
    assert.match(result.systemMessage.content, /Switched to Coder/);

    const alphaAfter = db.getSessionById('alpha');
    const otherAfter = db.getSessionById('ops-alerts');
    assert.equal(alphaAfter.agentId, 'coder');
    assert.equal(alphaAfter.agentDisplayName, 'Coder');
    assert.equal(otherAfter.agentId, otherBefore.agentId);
    assert.equal(otherAfter.agentDisplayName, otherBefore.agentDisplayName);
    assert.equal(alphaBefore.id, alphaAfter.id);
  } finally {
    cleanupDb(db, tmpRoot);
  }
});

test('gateway UUID session sync keeps compatibility with per-chat agents', (t) => {
  const { db, tmpRoot, error } = createDb();
  if (error) {
    t.skip(`better-sqlite3 unavailable in node test runtime: ${error.message}`);
    return;
  }

  try {
    const uuid = '7f53f858-503f-4ca8-9f02-cf1f9b3c3a6a';
    db.upsertGatewaySessions([{ sessionId: uuid, key: 'sess_1', kind: 'direct', model: 'gpt-5', updatedAt: Date.now() }]);

    db.setSessionAgent(uuid, { agentId: 'planner', agentDisplayName: 'Planner' });
    db.upsertGatewaySessions([{ sessionId: uuid, key: 'sess_1', kind: 'direct', model: 'gpt-5', updatedAt: Date.now() }]);

    const session = db.getSessionById(uuid);
    assert.equal(session.agentId, 'planner');
    assert.equal(session.agentDisplayName, 'Planner');
  } finally {
    cleanupDb(db, tmpRoot);
  }
});
