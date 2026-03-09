function summarizeExecError(error, fallback = 'unknown error') {
  if (!error) return fallback;

  const messageParts = [];

  if (error.code === 'ENOENT') {
    return 'OpenClaw CLI not found on PATH.';
  }

  if (error.killed || error.signal === 'SIGTERM') {
    messageParts.push('command timed out');
  }

  if (typeof error.code === 'number') {
    messageParts.push(`exit code ${error.code}`);
  } else if (typeof error.code === 'string' && error.code && error.code !== 'ENOENT') {
    messageParts.push(error.code);
  }

  if (error.signal && error.signal !== 'SIGTERM') {
    messageParts.push(`signal ${error.signal}`);
  }

  const stderr = String(error.stderr || '').trim();
  const stdout = String(error.stdout || '').trim();
  const detail = stderr || stdout || String(error.message || '').trim();

  if (detail) {
    messageParts.push(detail);
  }

  return messageParts.length > 0 ? messageParts.join(' — ') : fallback;
}

module.exports = {
  summarizeExecError
};
