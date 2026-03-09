function extractAgentText(stdout) {
  if (!stdout) return '';

  try {
    const payload = JSON.parse(stdout);
    return payload?.reply?.message || payload?.message || payload?.text || payload?.output || payload?.response || '';
  } catch {
    return String(stdout).trim();
  }
}

module.exports = { extractAgentText };
