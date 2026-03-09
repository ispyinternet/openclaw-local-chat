const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGatewaySessionsPayload } = require('./gateway-sessions.cjs');

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

test('normalizeGatewaySessionsPayload returns empty array for unknown payloads', () => {
  assert.deepEqual(normalizeGatewaySessionsPayload(null), []);
  assert.deepEqual(normalizeGatewaySessionsPayload({}), []);
  assert.deepEqual(normalizeGatewaySessionsPayload({ sessions: {} }), []);
});
