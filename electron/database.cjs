const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const seed = require('../shared/initial-data.json');

class ChatDatabase {
  constructor(app, options = {}) {
    this.dbPath = options.dbPath || path.join(app.getPath('userData'), 'chat-desktop.sqlite3');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.#prepareSchema();
    this.#seedIfNeeded();
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  #prepareSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        channel TEXT NOT NULL,
        preview TEXT NOT NULL,
        unread INTEGER NOT NULL DEFAULT 0,
        chip TEXT NOT NULL,
        status TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        agent_display_name TEXT NOT NULL DEFAULT 'Main',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY(group_id) REFERENCES sections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_key TEXT UNIQUE,
        role TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        display_timestamp TEXT NOT NULL,
        meta_pill TEXT,
        meta_detail TEXT,
        reactions TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_session_created_at ON messages(session_id, created_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        session_id UNINDEXED,
        message_key UNINDEXED,
        tokenize = 'porter'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, session_id, message_key)
        VALUES (new.id, new.content, new.session_id, new.message_key);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        UPDATE messages_fts
        SET content = new.content,
            session_id = new.session_id,
            message_key = new.message_key
        WHERE rowid = new.id;
      END;
    `);

    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'main'");
    } catch {}

    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN agent_display_name TEXT NOT NULL DEFAULT 'Main'");
    } catch {}
  }

  #seedIfNeeded() {
    const sectionCount = this.db.prepare('SELECT COUNT(*) as count FROM sections').get().count;
    this.#ensureDefaultSettings();
    if (sectionCount > 0) {
      return;
    }

    const insertSection = this.db.prepare(
      'INSERT INTO sections (id, title, position) VALUES (@id, @title, @position)'
    );
    const insertSession = this.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status, agent_id, agent_display_name)
      VALUES (@id, @groupId, @name, @channel, @preview, @unread, @chip, @status, @agentId, @agentDisplayName)
    `);
    const insertMessage = this.db.prepare(`
      INSERT INTO messages (session_id, message_key, role, author, content, display_timestamp, meta_pill, meta_detail, reactions)
      VALUES (@sessionId, @id, @role, @author, @content, @timestamp, @meta_pill, @meta_detail, @reactions)
    `);

    const transaction = this.db.transaction(() => {
      seed.sections.forEach((section) => insertSection.run(section));
      seed.sessions.forEach((session) => insertSession.run({
        agentId: 'main',
        agentDisplayName: 'Main',
        ...session
      }));
      seed.messages.forEach((message) => insertMessage.run({
        meta_pill: null,
        meta_detail: null,
        reactions: null,
        ...message
      }));
    });

    transaction();
  }

  getSectionsWithSessions() {
    const sections = this.db
      .prepare('SELECT id, title, position FROM sections ORDER BY position ASC')
      .all();
    const sessions = this.db
      .prepare(`
        SELECT id, group_id as groupId, name, channel, preview, unread, chip, status,
               agent_id as agentId, agent_display_name as agentDisplayName
        FROM sessions
        ORDER BY created_at DESC
      `)
      .all();

    return sections.map((section) => ({
      id: section.id,
      title: section.title,
      sessions: sessions
        .filter((session) => session.groupId === section.id)
        .map(({ groupId, ...session }) => session)
    }));
  }

  getInitialState() {
    const sections = this.getSectionsWithSessions();
    const selectedSessionId = this.getFirstSessionId();
    const messages = selectedSessionId ? this.getMessagesForSession(selectedSessionId) : [];

    return { sections, selectedSessionId, messages };
  }

  upsertGatewaySessions(rawSessions = []) {
    const ensureGatewaySection = this.db.prepare(`
      INSERT INTO sections (id, title, position)
      VALUES ('gateway', 'Gateway', 99)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title
    `);

    const upsertSession = this.db.prepare(`
      INSERT INTO sessions (id, group_id, name, channel, preview, unread, chip, status, created_at)
      VALUES (@id, 'gateway', @name, @channel, @preview, 0, 'gateway', @status, strftime('%s','now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        channel = excluded.channel,
        preview = excluded.preview,
        status = excluded.status,
        created_at = strftime('%s','now')
    `);

    const pruneSession = this.db.prepare(`
      DELETE FROM sessions
      WHERE group_id = 'gateway'
        AND id NOT IN (${rawSessions.map(() => '?').join(',') || "''"})
    `);

    const tx = this.db.transaction(() => {
      ensureGatewaySection.run();
      rawSessions.forEach((session) => {
        upsertSession.run({
          id: session.sessionId,
          name: session.key,
          channel: session.kind || 'direct',
          preview: `${session.model || 'model'} · ${new Date(session.updatedAt || Date.now()).toLocaleString('en-GB')}`,
          status: session.abortedLastRun ? 'degraded' : 'online'
        });
      });

      pruneSession.run(...rawSessions.map((session) => session.sessionId));
    });

    tx();
    return this.getSectionsWithSessions();
  }

  getFirstSessionId() {
    const row = this.db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1').get();
    return row ? row.id : null;
  }

  getMessagesForSession(sessionId) {
    return this.db
      .prepare(`
        SELECT COALESCE(message_key, printf('msg-%d', id)) as id,
               role,
               author,
               display_timestamp as timestamp,
               content,
               meta_pill as metaPill,
               meta_detail as metaDetail,
               reactions
        FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC
      `)
      .all(sessionId)
      .map((message) => ({
        ...message,
        reactions: message.reactions ? message.reactions.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
        meta: message.metaPill
          ? { pill: message.metaPill, detail: message.metaDetail || '' }
          : undefined
      }));
  }

  addMessage({ sessionId, content, author = 'Operator', role = 'user', metaPill = null, metaDetail = null }) {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!sessionId || !trimmed) {
      throw new Error('sessionId and content are required');
    }

    const session = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const firstUserMessage = role === 'user'
      ? this.db.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = 'user'").get(sessionId).count === 0
      : false;

    const messageKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = this.#formatDisplayTimestamp(new Date());

    const result = this.db
      .prepare(`
        INSERT INTO messages (session_id, message_key, role, author, content, display_timestamp, meta_pill, meta_detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(sessionId, messageKey, role, author, trimmed, timestamp, metaPill, metaDetail);

    const nextTitle = firstUserMessage ? this.#deriveChatTitle(trimmed) : null;

    this.db
      .prepare(`
        UPDATE sessions
        SET preview = ?,
            name = COALESCE(?, name),
            created_at = strftime('%s','now')
        WHERE id = ?
      `)
      .run(trimmed.slice(0, 160), nextTitle, sessionId);

    const row = this.db
      .prepare(`
        SELECT COALESCE(message_key, printf('msg-%d', id)) as id,
               role,
               author,
               display_timestamp as timestamp,
               content,
               meta_pill as metaPill,
               meta_detail as metaDetail,
               reactions
        FROM messages
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    return {
      ...row,
      reactions: row.reactions ? row.reactions.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      meta: row.metaPill ? { pill: row.metaPill, detail: row.metaDetail || '' } : undefined
    };
  }

  getSessionById(sessionId) {
    if (!sessionId) return null;

    return this.db.prepare(`
      SELECT id,
             group_id as groupId,
             name,
             channel,
             preview,
             unread,
             chip,
             status,
             agent_id as agentId,
             agent_display_name as agentDisplayName
      FROM sessions
      WHERE id = ?
    `).get(sessionId) || null;
  }

  setSessionAgent(sessionId, { agentId, agentDisplayName }) {
    if (!sessionId || !agentId || !agentDisplayName) {
      throw new Error('sessionId, agentId and agentDisplayName are required');
    }

    const result = this.db.prepare(`
      UPDATE sessions
      SET agent_id = ?,
          agent_display_name = ?,
          created_at = strftime('%s','now')
      WHERE id = ?
    `).run(agentId, agentDisplayName, sessionId);

    if (!result.changes) {
      throw new Error('Session not found');
    }

    const systemMessage = this.addMessage({
      sessionId,
      role: 'system',
      author: 'System',
      content: `Switched to ${agentDisplayName}`,
      metaPill: 'switch',
      metaDetail: agentDisplayName
    });

    return {
      session: this.getSessionById(sessionId),
      systemMessage
    };
  }

  searchMessages(rawQuery) {
    if (!rawQuery?.trim()) {
      return [];
    }

    const query = this.#buildFtsQuery(rawQuery);
    if (!query) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT
        COALESCE(m.message_key, printf('msg-%d', m.id)) as id,
        m.session_id as sessionId,
        s.name as sessionName,
        s.channel as sessionChannel,
        m.author,
        m.role,
        m.display_timestamp as timestamp,
        m.content,
        snippet(messages_fts, 0, '<mark>', '</mark>', '…', 10) as snippet
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.id
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
      ORDER BY rank, m.created_at DESC
      LIMIT 25
    `);

    try {
      return stmt.all(query).map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        sessionName: row.sessionName,
        sessionChannel: row.sessionChannel,
        author: row.author,
        role: row.role,
        timestamp: row.timestamp,
        snippet: row.snippet || row.content
      }));
    } catch {
      return [];
    }
  }

  getPreferences() {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all();
    const result = {
      gatewayUrl: 'http://localhost:4111',
      theme: 'system'
    };

    for (const row of rows) {
      if (row.key === 'gateway_url') result.gatewayUrl = row.value;
      if (row.key === 'theme') result.theme = row.value;
    }

    return result;
  }

  getComposerDrafts() {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = 'session_drafts'").get();
    if (!row?.value) {
      return {};
    }

    try {
      const parsed = JSON.parse(row.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([sessionId, draft]) => typeof sessionId === 'string' && typeof draft === 'string')
      );
    } catch {
      return {};
    }
  }

  setComposerDrafts(drafts = {}) {
    const normalized = Object.fromEntries(
      Object.entries(drafts)
        .filter(([sessionId, draft]) => typeof sessionId === 'string' && typeof draft === 'string' && draft.trim())
        .map(([sessionId, draft]) => [sessionId, draft])
    );

    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('session_drafts', ?, strftime('%s','now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = strftime('%s','now')
    `).run(JSON.stringify(normalized));

    return normalized;
  }

  setPreferences(prefs = {}) {
    const insert = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, strftime('%s','now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = strftime('%s','now')
    `);

    if (typeof prefs.gatewayUrl === 'string') {
      insert.run('gateway_url', prefs.gatewayUrl.trim() || 'http://localhost:4111');
    }

    if (typeof prefs.theme === 'string') {
      const nextTheme = ['system', 'dark', 'light'].includes(prefs.theme) ? prefs.theme : 'system';
      insert.run('theme', nextTheme);
    }

    return this.getPreferences();
  }

  resetData() {
    const wipe = this.db.transaction(() => {
      this.db.prepare('DELETE FROM messages').run();
      this.db.prepare('DELETE FROM sessions').run();
      this.db.prepare('DELETE FROM sections').run();
      this.db.prepare('DELETE FROM messages_fts').run();
      this.db.prepare("UPDATE app_settings SET value = '{}' WHERE key = 'session_drafts'").run();
    });

    wipe();
    this.#seedIfNeeded();

    return this.getInitialState();
  }

  #ensureDefaultSettings() {
    const defaults = [
      ['gateway_url', 'http://localhost:4111'],
      ['theme', 'system'],
      ['session_drafts', '{}']
    ];

    const insert = this.db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO NOTHING
    `);

    const tx = this.db.transaction(() => {
      defaults.forEach(([key, value]) => insert.run(key, value));
    });

    tx();
  }

  #deriveChatTitle(content) {
    const cleaned = String(content || '')
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
      .replace(/\*\*|__|~~|`|#+|>+/g, ' ')
      .replace(/\[[^\]]*\]\([^\)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return 'New chat';
    }

    return cleaned.slice(0, 72);
  }

  #formatDisplayTimestamp(date) {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/London'
    }).format(date);
  }

  #buildFtsQuery(input) {
    return input
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}_-]+/gu, ''))
      .filter(Boolean)
      .map((token) => `${token}*`)
      .join(' ');
  }
}

function createDatabase(app) {
  return new ChatDatabase(app);
}

module.exports = { createDatabase, ChatDatabase };
