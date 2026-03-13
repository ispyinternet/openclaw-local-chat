function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function extractBalancedInlineJson(line, startIndex) {
  if (startIndex < 0 || startIndex >= line.length) return null;

  const opening = line[startIndex];
  const closing = opening === '[' ? ']' : opening === '{' ? '}' : null;
  if (!closing) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < line.length; index += 1) {
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

    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return line.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function extractInlineJson(line) {
  const firstBrace = line.indexOf('{');
  const firstBracket = line.indexOf('[');

  const starts = [firstBrace, firstBracket]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b);

  for (const startIndex of starts) {
    const candidate = extractBalancedInlineJson(line, startIndex);
    if (candidate) return candidate;
  }

  return null;
}

function normalizeAgentsPayload(value) {
  if (Array.isArray(value)) {
    const normalizedRows = value
      .map((item) => {
        if (typeof item === 'string') {
          const id = item.trim();
          if (!id) return null;
          return { id, displayName: id, model: '' };
        }

        if (!item || typeof item !== 'object') return null;

        const idCandidate = item.id ?? item.agentId ?? item.agent_id ?? item.key;
        const id = typeof idCandidate === 'string' ? idCandidate.trim() : '';
        if (!id) return null;

        const displayNameCandidate = item.name ?? item.displayName ?? item.display_name ?? item.title;
        const modelCandidate = item.model ?? item.modelId ?? item.model_id;

        return {
          id,
          displayName: typeof displayNameCandidate === 'string' && displayNameCandidate.trim()
            ? displayNameCandidate.trim()
            : id,
          model: typeof modelCandidate === 'string' ? modelCandidate.trim() : ''
        };
      })
      .filter(Boolean);

    const deduped = [];
    const seenIds = new Set();
    for (const row of normalizedRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      deduped.push(row);
    }

    return deduped;
  }

  if (value && typeof value === 'object') {
    const candidateKeys = ['agents', 'data', 'payload', 'result', 'items'];
    for (const key of candidateKeys) {
      if (value[key] === undefined) continue;
      const nested = normalizeAgentsPayload(unwrapJsonStrings(value[key]));
      if (nested.length) {
        return nested;
      }
    }
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

    const inlineJson = extractInlineJson(trimmed);
    if (inlineJson) candidates.push(inlineJson);
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const key = typeof candidate === 'string' ? candidate.trim() : JSON.stringify(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
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
