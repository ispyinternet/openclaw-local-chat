const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAgentCommandArgs, normalizeAgentId, isGatewaySessionId } = require('./send-routing.cjs');

test('isGatewaySessionId detects UUID-backed session ids', () => {
  assert.equal(isGatewaySessionId('d6d72af5-8b93-49ba-8cd3-4449155183ed'), true);
  assert.equal(isGatewaySessionId('sess-local-1'), false);
});

test('normalizeAgentId falls back to main for blank values', () => {
  assert.equal(normalizeAgentId(''), 'main');
  assert.equal(normalizeAgentId('   '), 'main');
  assert.equal(normalizeAgentId(undefined), 'main');
  assert.equal(normalizeAgentId('gpt-5.3'), 'gpt-5.3');
});

test('buildAgentCommandArgs routes UUID sessions via --session-id', () => {
  const args = buildAgentCommandArgs({
    sessionId: 'd6d72af5-8b93-49ba-8cd3-4449155183ed',
    content: 'hello'
  });

  assert.deepEqual(args, [
    'agent',
    '--session-id',
    'd6d72af5-8b93-49ba-8cd3-4449155183ed',
    '--message',
    'hello',
    '--json'
  ]);
});

test('buildAgentCommandArgs routes local sessions via selected agent', () => {
  const args = buildAgentCommandArgs({
    sessionId: 'sess-local-1',
    content: 'hello',
    agentId: 'openai/gpt-5.3-codex'
  });

  assert.deepEqual(args, [
    'agent',
    '--agent',
    'openai/gpt-5.3-codex',
    '--message',
    'hello',
    '--json'
  ]);
});
