function collectJsonCandidates(raw) {
  const candidates = [];
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    candidates.push(line);

    const firstBrace = line.indexOf('{');
    const lastBrace = line.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      candidates.push(line.slice(firstBrace, lastBrace + 1));
    }
  }

  const fencedJson = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    candidates.unshift(fencedJson[1].trim());
  }

  return candidates;
}

function normalizeGatewaySessionsPayload(raw, seen = new Set()) {
  if (!raw || seen.has(raw)) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw !== 'object') {
    return [];
  }

  seen.add(raw);

  if (Array.isArray(raw.sessions)) {
    return raw.sessions;
  }

  if (Array.isArray(raw.data)) {
    return raw.data;
  }

  if (Array.isArray(raw.items)) {
    return raw.items;
  }

  if (raw.sessions && Array.isArray(raw.sessions.items)) {
    return raw.sessions.items;
  }

  const nestedCandidates = [
    raw.result,
    raw.payload,
    raw.response,
    raw.output,
    raw.data,
    raw.sessions,
  ];

  for (const candidate of nestedCandidates) {
    const sessions = normalizeGatewaySessionsPayload(candidate, seen);
    if (sessions.length > 0) {
      return sessions;
    }
  }

  return [];
}

function parseGatewaySessionsOutput(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return [];

  try {
    return normalizeGatewaySessionsPayload(JSON.parse(raw));
  } catch {
    const candidates = collectJsonCandidates(raw);

    for (const candidate of candidates) {
      try {
        return normalizeGatewaySessionsPayload(JSON.parse(candidate));
      } catch {
        // keep scanning
      }
    }

    return [];
  }
}

module.exports = { normalizeGatewaySessionsPayload, parseGatewaySessionsOutput };
