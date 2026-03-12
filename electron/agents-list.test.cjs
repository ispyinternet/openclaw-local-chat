const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAgentsListOutput, normalizeAgentsPayload } = require('./agents-list.cjs');

test('normalizeAgentsPayload keeps valid ids and derives display names', () => {
  const result = normalizeAgentsPayload([
    { id: 'main', name: 'Primary', model: 'openai/gpt-5.3-codex' },
    { id: 'ops', model: 'openai/gpt-5.1-codex' },
    { id: '   ' },
    null
  ]);

  assert.deepEqual(result, [
    { id: 'main', displayName: 'Primary', model: 'openai/gpt-5.3-codex' },
    { id: 'ops', displayName: 'ops', model: 'openai/gpt-5.1-codex' }
  ]);
});

test('parseAgentsListOutput parses direct JSON arrays', () => {
  const result = parseAgentsListOutput('[{"id":"main","name":"Primary"}]');
  assert.deepEqual(result, [{ id: 'main', displayName: 'Primary', model: '' }]);
});

test('parseAgentsListOutput parses data: wrapped arrays from noisy output', () => {
  const output = [
    '[info] loading config',
    'data: [{"id":"main"},{"id":"work","name":"Work Agent","model":"openai/gpt-5.1-codex"}]',
    '[done]'
  ].join('\n');

  const result = parseAgentsListOutput(output);
  assert.deepEqual(result, [
    { id: 'main', displayName: 'main', model: '' },
    { id: 'work', displayName: 'Work Agent', model: 'openai/gpt-5.1-codex' }
  ]);
});

test('parseAgentsListOutput unwraps json-encoded string arrays', () => {
  const output = '"[{\\"id\\":\\"main\\",\\"name\\":\\"Primary\\"}]"';
  const result = parseAgentsListOutput(output);
  assert.deepEqual(result, [{ id: 'main', displayName: 'Primary', model: '' }]);
});

test('parseAgentsListOutput unwraps nested data payload objects', () => {
  const output = 'data: {"agents":"[{\\"id\\":\\"ops\\",\\"name\\":\\"Ops\\"}]"}';
  const result = parseAgentsListOutput(output);
  assert.deepEqual(result, [{ id: 'ops', displayName: 'Ops', model: '' }]);
});

test('parseAgentsListOutput handles deeply nested wrapper keys', () => {
  const output = JSON.stringify({
    data: {
      result: {
        items: [{ id: 'work', name: 'Work Agent', model: 'openai/gpt-5.1-codex' }]
      }
    }
  });

  const result = parseAgentsListOutput(output);
  assert.deepEqual(result, [{ id: 'work', displayName: 'Work Agent', model: 'openai/gpt-5.1-codex' }]);
});

test('parseAgentsListOutput handles json-string wrappers around payload containers', () => {
  const output = JSON.stringify({
    payload: JSON.stringify({
      data: JSON.stringify({
        agents: JSON.stringify([{ id: 'main', name: 'Primary' }])
      })
    })
  });

  const result = parseAgentsListOutput(output);
  assert.deepEqual(result, [{ id: 'main', displayName: 'Primary', model: '' }]);
});
