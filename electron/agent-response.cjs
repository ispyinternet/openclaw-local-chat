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
    toText(payload?.message) ||
    toText(payload?.text) ||
    toText(payload?.output) ||
    toText(payload?.response) ||
    ''
  );
}

function extractAgentText(stdout) {
  if (!stdout) return '';

  const raw = String(stdout).trim();
  if (!raw) return '';

  try {
    return extractTextFromPayload(JSON.parse(raw));
  } catch {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return extractTextFromPayload(JSON.parse(lines[index]));
      } catch {
        // Continue scanning earlier lines for a valid JSON payload.
      }
    }

    return raw;
  }
}

module.exports = { extractAgentText };
