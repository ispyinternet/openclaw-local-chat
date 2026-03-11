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

test('parseGatewaySessionsOutput returns empty array for invalid output', () => {
  assert.deepEqual(parseGatewaySessionsOutput('not json'), []);
});
