function toText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (typeof item.text === 'string') return item.text;
          if (typeof item.content === 'string') return item.content;
          if (typeof item.value === 'string') return item.value;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    return joined;
  }

  if (value && typeof value === 'object') {
    if (typeof value.message === 'string') return value.message;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (typeof value.value === 'string') return value.value;
    if (Array.isArray(value.content)) return toText(value.content);
  }

  return '';
}

function extractTextFromPayload(payload) {
  return (
    toText(payload?.reply?.message) ||
    toText(payload?.reply) ||
    toText(payload?.result?.payloads) ||
    toText(payload?.payloads) ||
    toText(payload?.result?.message) ||
    toText(payload?.message) ||
    toText(payload?.text) ||
    toText(payload?.output) ||
    toText(payload?.response) ||
    ''
  );
}

function collectJsonCandidates(raw) {
  const candidates = [];
  const lines = raw
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

  const fencedJson = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    candidates.unshift(fencedJson[1].trim());
  }

  return candidates;
}

function extractAgentText(stdout) {
  if (!stdout) return '';

  const raw = String(stdout).trim();
  if (!raw) return '';

  try {
    return extractTextFromPayload(JSON.parse(raw));
  } catch {
    const candidates = collectJsonCandidates(raw);

    for (const candidate of candidates) {
      try {
        return extractTextFromPayload(JSON.parse(candidate));
      } catch {
        // Continue scanning for a valid JSON payload.
      }
    }

    return raw;
  }
}

module.exports = { extractAgentText };
