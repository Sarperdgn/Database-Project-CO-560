import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request, ApiError } from '../src/api.ts';
test('UTF-8 Basic credentials and JSON update contract', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const headers = options!.headers as Record<string, string>;
    assert.equal(Buffer.from(headers.Authorization.slice(6), 'base64').toString('utf8'), 'student:pässword:123');
    assert.equal(options!.method, 'PATCH');
    assert.deepEqual(JSON.parse(options!.body as string), { username: 'updated' });
    assert.equal(options!.cache, 'no-store');
    assert.ok(options!.signal);
    return Response.json({ message: 'Update executed' });
  };
  try { assert.deepEqual(await request('/api/users/1', { username: 'student', password: 'pässword:123' }, 'PATCH', { username: 'updated' }), { message: 'Update executed' }); }
  finally { globalThis.fetch = original; }
});
for (const status of [401, 403, 409, 429, 500]) {
  test(`HTTP ${status} retains status for UI error handling`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ error: 'Backend message' }, { status });
    try { await assert.rejects(request('/api/me'), error => error instanceof ApiError && error.status === status && error.message === 'Backend message'); }
    finally { globalThis.fetch = original; }
  });
}
test('unreachable server becomes an actionable error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Network failure'); };
  try { await assert.rejects(request('/api/me'), error => error instanceof ApiError && error.status === 0); }
  finally { globalThis.fetch = original; }
});
test('HTML from a missing proxy is not accepted as API data', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>fallback</html>');
  try { await assert.rejects(request('/api/me'), /Unexpected API response/); }
  finally { globalThis.fetch = original; }
});

test('plain-text rate-limit response keeps HTTP 429', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Too many requests, please try again later.', { status: 429 });
  try { await assert.rejects(request('/api/me'), error => error instanceof ApiError && error.status === 429 && /rate limit/.test(error.message)); }
  finally { globalThis.fetch = original; }
});
test('username colons are rejected before sending ambiguous Basic credentials', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json([]); };
  try {
    await assert.rejects(request('/api/me', { username: 'user:other', password: 'password' }), /without colons/);
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});
test('empty audit table stays empty and nullable IP is preserved', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    assert.deepEqual(await request('/api/audit'), []);
    const row = { id: 1, user_id: null, attempted_email: 'test@example.invalid', success: 0, reason: 'fixture', ip_address: null, created_at: '2026-11-02T10:00:00.000Z' };
    globalThis.fetch = async () => Response.json([row]);
    assert.deepEqual(await request('/api/audit'), [row]);
  } finally { globalThis.fetch = original; }
});
test('timestamp rendering preserves missing values and unknown timezone', async () => {
  const { formatTime } = await import('../src/api.ts');
  assert.equal(formatTime(null), 'Not recorded');
  assert.equal(formatTime('2026-11-02 10:00:00'), '2026-11-02 10:00:00');
  assert.equal(formatTime('bad-date'), 'bad-date');
  assert.notEqual(formatTime('2026-11-02T10:00:00.000Z'), 'Invalid Date');
});
