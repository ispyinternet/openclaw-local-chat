function extractBalancedJson(text, startIndex) {
  if (startIndex < 0 || startIndex >= text.length) return null;

  const opening = text[startIndex];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : null;
  if (!closing) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

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

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
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
    const candidate = extractBalancedJson(line, startIndex);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function collectJsonCandidates(raw) {
  const candidates = [];
  const text = String(raw);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim());
  const nonEmptyLines = lines.filter(Boolean);

  for (let index = nonEmptyLines.length - 1; index >= 0; index -= 1) {
    const line = nonEmptyLines[index];
    candidates.push(line);

    const dataPrefix = line.match(/^data:\s*(.+)$/i);
    if (dataPrefix?.[1]) {
      candidates.push(dataPrefix[1]);
    }

    const inlineJson = extractInlineJson(line);
    if (inlineJson) {
      candidates.push(inlineJson);
    }
  }

  const combinedDataLines = [];
  for (const line of lines) {
    const dataPrefix = line.match(/^data:\s?(.*)$/i);
    if (dataPrefix) {
      combinedDataLines.push(dataPrefix[1]);
      continue;
    }

    if (combinedDataLines.length > 0) {
      candidates.push(combinedDataLines.join('\n').trim());
      combinedDataLines.length = 0;
    }
  }
  if (combinedDataLines.length > 0) {
    candidates.push(combinedDataLines.join('\n').trim());
  }

  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let index = 0; index < fencedBlocks.length; index += 1) {
    const candidate = fencedBlocks[index]?.[1]?.trim();
    if (candidate) {
      candidates.unshift(candidate);
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate || seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
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

function parseJsonCandidate(candidate) {
  let parsed = JSON.parse(candidate);

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof parsed !== 'string') break;

    const trimmed = parsed.trim();
    if (!trimmed || !/^[\[{\"]/.test(trimmed)) break;

    parsed = JSON.parse(trimmed);
  }

  return normalizeGatewaySessionsPayload(parsed);
}

function parseGatewaySessionsOutput(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return [];

  try {
    return parseJsonCandidate(raw);
  } catch {
    const candidates = collectJsonCandidates(raw);

    for (const candidate of candidates) {
      try {
        const sessions = parseJsonCandidate(candidate);
        if (sessions.length > 0) {
          return sessions;
        }
      } catch {
        // keep scanning
      }
    }

    return [];
  }
}

module.exports = { normalizeGatewaySessionsPayload, parseGatewaySessionsOutput };
