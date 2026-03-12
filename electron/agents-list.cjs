function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function extractInlineJsonArray(line) {
  const start = line.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < line.length; index += 1) {
    const char = line[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return line.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeAgentsPayload(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) return null;
        return {
          id,
          displayName: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id,
          model: typeof item.model === 'string' ? item.model : ''
        };
      })
      .filter(Boolean);
  }

  if (value && typeof value === 'object' && value.agents !== undefined) {
    return normalizeAgentsPayload(unwrapJsonStrings(value.agents));
  }

  return [];
}

function unwrapJsonStrings(value, depthLimit = 4) {
  let current = value;
  for (let depth = 0; depth < depthLimit; depth += 1) {
    if (typeof current !== 'string') return current;
    const trimmed = current.trim();
    if (!trimmed) return current;

    const looksJson =
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'));

    if (!looksJson) return current;

    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }

  return current;
}

function parseAgentsListOutput(stdout) {
  const raw = stripAnsi(stdout);
  if (!raw) return [];

  const candidates = [raw];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dataPrefix = trimmed.match(/^data:\s*(.+)$/i);
    if (dataPrefix?.[1]) candidates.push(dataPrefix[1]);

    const inlineArray = extractInlineJsonArray(trimmed);
    if (inlineArray) candidates.push(inlineArray);
  }

  for (const candidate of candidates) {
    try {
      const parsed = unwrapJsonStrings(candidate);
      const normalized = normalizeAgentsPayload(parsed);
      if (normalized.length > 0) return normalized;
    } catch {
      // keep scanning
    }
  }

  return [];
}

module.exports = {
  parseAgentsListOutput,
  normalizeAgentsPayload
};
