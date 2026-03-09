const test = require('node:test');
const assert = require('node:assert/strict');
const { extractAgentText } = require('./agent-response.cjs');

test('extracts nested reply.message payload', () => {
  const value = extractAgentText(JSON.stringify({ reply: { message: 'hello' } }));
  assert.equal(value, 'hello');
});

test('falls back through supported top-level keys', () => {
  assert.equal(extractAgentText(JSON.stringify({ message: 'm' })), 'm');
  assert.equal(extractAgentText(JSON.stringify({ text: 't' })), 't');
  assert.equal(extractAgentText(JSON.stringify({ output: 'o' })), 'o');
  assert.equal(extractAgentText(JSON.stringify({ response: 'r' })), 'r');
});

test('returns trimmed stdout when non-json', () => {
  assert.equal(extractAgentText('  plain text  '), 'plain text');
});

test('returns empty string on empty input', () => {
  assert.equal(extractAgentText(''), '');
  assert.equal(extractAgentText(null), '');
});
