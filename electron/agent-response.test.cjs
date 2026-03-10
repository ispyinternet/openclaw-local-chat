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

test('extracts text from gateway result payloads', () => {
  const value = extractAgentText(JSON.stringify({
    result: {
      payloads: [
        { text: 'hello from payload 1' },
        { text: 'hello from payload 2' }
      ]
    }
  }));

  assert.equal(value, 'hello from payload 1\nhello from payload 2');
});

test('extracts text from object and block payloads', () => {
  assert.equal(extractAgentText(JSON.stringify({ reply: { message: { content: 'from-content' } } })), 'from-content');
  assert.equal(
    extractAgentText(
      JSON.stringify({
        reply: {
          message: {
            content: [
              { type: 'text', text: 'first line' },
              { type: 'text', text: 'second line' }
            ]
          }
        }
      })
    ),
    'first line\nsecond line'
  );
});

test('extracts JSON payload when output contains log lines', () => {
  const stdout = [
    'INFO starting OpenClaw agent',
    '{"reply":{"message":"hello from json line"}}'
  ].join('\n');

  assert.equal(extractAgentText(stdout), 'hello from json line');
});

test('extracts JSON payload when wrapped in markdown code fences', () => {
  const stdout = [
    'Agent output follows:',
    '```json',
    '{"reply":{"message":"from fenced json"}}',
    '```'
  ].join('\n');

  assert.equal(extractAgentText(stdout), 'from fenced json');
});

test('extracts inline JSON object from prefixed log line', () => {
  const stdout = 'INFO tool-result: {"reply":{"message":"from inline object"}}';
  assert.equal(extractAgentText(stdout), 'from inline object');
});

test('returns trimmed stdout when non-json', () => {
  assert.equal(extractAgentText('  plain text  '), 'plain text');
});

test('returns empty string on empty input', () => {
  assert.equal(extractAgentText(''), '');
  assert.equal(extractAgentText(null), '');
});
