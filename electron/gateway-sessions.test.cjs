const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGatewaySessionsPayload, parseGatewaySessionsOutput } = require('./gateway-sessions.cjs');

test('normalizeGatewaySessionsPayload handles direct array payload', () => {
  const sessions = [{ sessionId: 'a' }];
  assert.deepEqual(normalizeGatewaySessionsPayload(sessions), sessions);
});

test('normalizeGatewaySessionsPayload handles { sessions } object payload', () => {
  const sessions = [{ sessionId: 'b' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ sessions }), sessions);
});

test('normalizeGatewaySessionsPayload handles { data } object payload', () => {
  const sessions = [{ sessionId: 'c' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ data: sessions }), sessions);
});

test('normalizeGatewaySessionsPayload handles nested sessions.items payload', () => {
  const sessions = [{ sessionId: 'd' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ sessions: { items: sessions } }), sessions);
});

test('normalizeGatewaySessionsPayload handles nested result payload', () => {
  const sessions = [{ sessionId: 'e' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ result: { sessions } }), sessions);
});

test('normalizeGatewaySessionsPayload handles nested payload/data/items wrappers', () => {
  const sessions = [{ sessionId: 'e2' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ payload: { data: { items: sessions } } }), sessions);
});

test('normalizeGatewaySessionsPayload handles json-string data wrappers', () => {
  const sessions = [{ sessionId: 'e3' }];
  assert.deepEqual(normalizeGatewaySessionsPayload({ data: JSON.stringify({ sessions }) }), sessions);
});

test('normalizeGatewaySessionsPayload handles deeply encoded nested wrappers', () => {
  const sessions = [{ sessionId: 'e4' }];
  const encoded = JSON.stringify(JSON.stringify({ sessions }));
  assert.deepEqual(normalizeGatewaySessionsPayload({ result: encoded }), sessions);
});

test('normalizeGatewaySessionsPayload safely handles cyclic objects', () => {
  const payload = {};
  payload.self = payload;
  assert.deepEqual(normalizeGatewaySessionsPayload(payload), []);
});

test('normalizeGatewaySessionsPayload returns empty array for unknown payloads', () => {
  assert.deepEqual(normalizeGatewaySessionsPayload(null), []);
  assert.deepEqual(normalizeGatewaySessionsPayload({}), []);
  assert.deepEqual(normalizeGatewaySessionsPayload({ sessions: {} }), []);
});

test('parseGatewaySessionsOutput handles raw json payload', () => {
  const sessions = [{ sessionId: 'f' }];
  const stdout = JSON.stringify({ sessions });
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts inline json from log output', () => {
  const sessions = [{ sessionId: 'g' }];
  const stdout = `info: syncing\nresult: ${JSON.stringify({ sessions })}`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts fenced json payload', () => {
  const sessions = [{ sessionId: 'h' }];
  const stdout = ['logs', '', '```json', JSON.stringify({ sessions }), '```'].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts data: prefixed json line', () => {
  const sessions = [{ sessionId: 'i' }];
  const stdout = ['event: message', `data: ${JSON.stringify({ sessions })}`].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts inline JSON array from log output', () => {
  const sessions = [{ sessionId: 'i2' }];
  const stdout = `trace: synced sessions ${JSON.stringify(sessions)}`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts balanced inline JSON when trailing text contains brackets', () => {
  const sessions = [{ sessionId: 'i2b' }];
  const stdout = `trace: payload=${JSON.stringify({ sessions })} trailing [debug] marker`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput handles inline JSON with escaped quotes and braces in strings', () => {
  const sessions = [{ sessionId: 'i2c', note: 'literal } and ] and \\"quotes\\"' }];
  const stdout = `trace: payload ${JSON.stringify({ sessions })} done`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput extracts data: prefixed JSON array line', () => {
  const sessions = [{ sessionId: 'i3' }];
  const stdout = ['event: snapshot', `data: ${JSON.stringify(sessions)}`].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput joins multiline data: payload into valid JSON', () => {
  const sessions = [{ sessionId: 'i3b' }];
  const stdout = [
    'event: message',
    'data: {"sessions":',
    `data: ${JSON.stringify(sessions)}}`,
  ].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput keeps multiline data events separated by blank lines', () => {
  const older = [{ sessionId: 'i3c-old' }];
  const latest = [{ sessionId: 'i3c-new' }];
  const stdout = [
    'event: message',
    'data: {"sessions":',
    `data: ${JSON.stringify(older)}}`,
    '',
    'event: message',
    'data: {"sessions":',
    `data: ${JSON.stringify(latest)}}`,
  ].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), latest);
});

test('parseGatewaySessionsOutput prefers latest fenced json payload', () => {
  const older = [{ sessionId: 'old' }];
  const latest = [{ sessionId: 'new' }];
  const stdout = [
    '```json',
    JSON.stringify({ sessions: older }),
    '```',
    'logs between blocks',
    '```json',
    JSON.stringify({ sessions: latest }),
    '```',
  ].join('\n');
  assert.deepEqual(parseGatewaySessionsOutput(stdout), latest);
});

test('parseGatewaySessionsOutput unwraps json-encoded string payload', () => {
  const sessions = [{ sessionId: 'wrapped' }];
  const stdout = JSON.stringify(JSON.stringify({ sessions }));
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput unwraps data: prefixed json-encoded array payload', () => {
  const sessions = [{ sessionId: 'wrapped-array' }];
  const stdout = `data: ${JSON.stringify(JSON.stringify(sessions))}`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput unwraps deeply json-encoded payloads', () => {
  const sessions = [{ sessionId: 'wrapped-deep' }];
  const encoded = JSON.stringify(JSON.stringify(JSON.stringify({ sessions })));
  assert.deepEqual(parseGatewaySessionsOutput(encoded), sessions);
});

test('parseGatewaySessionsOutput unwraps deeply encoded data: payloads', () => {
  const sessions = [{ sessionId: 'wrapped-deep-data' }];
  const encoded = JSON.stringify(JSON.stringify(JSON.stringify({ sessions })));
  const stdout = `data: ${encoded}`;
  assert.deepEqual(parseGatewaySessionsOutput(stdout), sessions);
});

test('parseGatewaySessionsOutput returns empty array for invalid output', () => {
  assert.deepEqual(parseGatewaySessionsOutput('not json'), []);
});
