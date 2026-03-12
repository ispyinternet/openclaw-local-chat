function isGatewaySessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function normalizeAgentId(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'main';
}

function buildAgentCommandArgs({ sessionId, content, agentId }) {
  if (isGatewaySessionId(sessionId)) {
    return ['agent', '--session-id', sessionId, '--message', content, '--json'];
  }

  return ['agent', '--agent', normalizeAgentId(agentId), '--message', content, '--json'];
}

module.exports = {
  isGatewaySessionId,
  normalizeAgentId,
  buildAgentCommandArgs
};
