import assert from 'node:assert/strict';
const credentials = {
  reader: ['project_reader', 'local-test-readonly-password'],
  employee: ['project_employee', 'local-test-employee-password'],
  auditor: ['project_auditor', 'local-test-auditor-password'],
  admin: ['project_admin', 'local-test-admin-password'],
};
async function request(actor, path, expected, options = {}) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { Authorization: `Basic ${Buffer.from(credentials[actor].join(':')).toString('base64')}` } : {}),
    },
  });
  assert.equal(response.status, expected, `${actor} ${path}: ${await response.clone().text()}`);
  return response.json();
}
for (const [actor, role] of [['reader','readonly'], ['employee','employee'], ['auditor','auditor'], ['admin','admin']]) {
  const [identity] = await request(actor, '/api/me', 200);
  assert.equal(identity.account, `${credentials[actor][0]}@%`);
  assert.equal(identity.role, `role_${role}`);
}
await request(null, '/api/users', 401);
const patch = { method: 'PATCH', body: JSON.stringify({ username: 'api_updated' }) };
await request('reader', '/api/users/1', 403, patch);
await request('employee', '/api/users/1', 200, patch);
const users = await request('reader', '/api/users', 200);
assert.equal(users[0].username, 'api_updated');
assert.deepEqual(Object.keys(users[0]).sort(), ['email', 'id', 'username']);
await request('reader', '/api/audit', 403);
await request('auditor', '/api/audit', 200);
await request('auditor', '/api/users', 403);
// Concurrent mixed identities must never inherit another caller's permissions.
await Promise.all(Array.from({ length: 5 }, async () => {
  await Promise.all([
    request('employee', '/api/users/1', 200, patch),
    request('reader', '/api/users/1', 403, patch),
    request('auditor', '/api/users', 403),
  ]);
}));
credentials.reader[1] = 'incorrect';
await request('reader', '/api/me', 401);
console.log('PASS: API uses caller identities and preserves database denials');
