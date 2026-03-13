const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeExecError } = require('./cli-error.cjs');

test('maps ENOENT to missing CLI message', () => {
  const message = summarizeExecError({ code: 'ENOENT' }, 'fallback');
  assert.equal(message, 'OpenClaw CLI not found on PATH.');
});

test('maps permission errors to executable guidance', () => {
  assert.equal(
    summarizeExecError({ code: 'EACCES' }, 'fallback'),
    'OpenClaw CLI is not executable (permission denied).'
  );

  assert.equal(
    summarizeExecError({ code: 'EPERM' }, 'fallback'),
    'OpenClaw CLI is not executable (permission denied).'
  );
});

test('prefers stderr details and includes timeout/exit context', () => {
  const message = summarizeExecError(
    {
      killed: true,
      signal: 'SIGTERM',
      code: 1,
      stderr: 'gateway timeout after 120000ms'
    },
    'fallback'
  );

  assert.equal(message, 'command timed out — exit code 1 — gateway timeout after 120000ms');
});

test('falls back to stdout or message when stderr missing', () => {
  assert.equal(
    summarizeExecError({ code: 2, stdout: 'some stdout detail' }, 'fallback'),
    'exit code 2 — some stdout detail'
  );

  assert.equal(
    summarizeExecError({ code: 'EFAIL', message: 'bad stuff' }, 'fallback'),
    'EFAIL — bad stuff'
  );
});

test('uses fallback when no error details exist', () => {
  assert.equal(summarizeExecError({}, 'fallback'), 'fallback');
  assert.equal(summarizeExecError(null, 'fallback'), 'fallback');
});
