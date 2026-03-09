function normalizeGatewaySessionsPayload(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (Array.isArray(raw.sessions)) {
    return raw.sessions;
  }

  if (Array.isArray(raw.data)) {
    return raw.data;
  }

  if (raw.sessions && Array.isArray(raw.sessions.items)) {
    return raw.sessions.items;
  }

  return [];
}

module.exports = { normalizeGatewaySessionsPayload };
