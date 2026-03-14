function isGatewaySessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function normalizeAgentId(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'main';
}

function buildAgentCommandArgs({ sessionId, content, agentId }) {
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';

  if (isGatewaySessionId(normalizedSessionId)) {
    return ['agent', '--session-id', normalizedSessionId, '--message', content, '--json'];
  }

  const args = ['agent', '--agent', normalizeAgentId(agentId)];
  if (normalizedSessionId) {
    args.push('--session-id', normalizedSessionId);
  }

  args.push('--message', content, '--json');
  return args;
}

module.exports = {
  isGatewaySessionId,
  normalizeAgentId,
  buildAgentCommandArgs
};
