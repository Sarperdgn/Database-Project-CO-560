import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page, role = 'readonly') {
  const state = { username: 'alice', password: 'test-password-123', offline: false };
  await page.route('**/api/**', async route => {
    if (state.offline) return route.fulfill({ status: 503, json: { error: 'Database unavailable' } });
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/register')) {
      expect(request.postDataJSON()).toEqual({ username: 'signup_student', password: state.password });
      return route.fulfill({ status: 201, json: { username: 'signup_student' } });
    }
    const auth = Buffer.from(request.headers().authorization?.slice(6) || '', 'base64').toString();
    if (!auth.endsWith(`:${state.password}`)) return route.fulfill({ status: 401, json: { error: 'MariaDB authentication failed' } });
    if (path === '/api/me') return route.fulfill({ json: [{ account: `${auth.split(':')[0]}@%`, role: `role_${role}` }] });
    if (path.endsWith('change-password')) { state.password = request.postDataJSON().newPassword; return route.fulfill({ json: { message: 'Password changed' } }); }
    if (path === '/api/audit') return route.fulfill({ status: 403, json: { error: 'MariaDB denied this operation' } });
    if (request.method() === 'PATCH') {
      expect(path).toBe('/api/users/1');
      if (role === 'readonly') return route.fulfill({ status: 403, json: { error: 'MariaDB denied this operation' } });
      state.username = request.postDataJSON().username;
      return route.fulfill({ json: { message: 'Update executed' } });
    }
    return route.fulfill({ json: [{ id: 1, username: state.username, email: 'alice@example.test' }] });
  });
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  return state;
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('MariaDB username').fill('project_reader');
  await page.getByLabel('Password', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access control lab' })).toBeVisible();
}
test('reader sees real denials, checks access and compares permissions', async ({ page }) => {
  await mockApi(page); await login(page);
  await page.getByRole('button', { name: 'Audit table', exact: true }).click();
  await expect(page.getByText('HTTP 403 · DATABASE DENIED')).toBeVisible();
  await page.getByRole('button', { name: 'Access lab', exact: true }).click();
  await page.getByRole('button', { name: 'Run access checks' }).click();
  await expect(page.getByText('HTTP 200 · 1 row(s) returned')).toHaveCount(2);
  await expect(page.getByText('HTTP 403 · MariaDB denied this operation')).toBeVisible();
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(5);
});
test('employee edit persists through refresh', async ({ page }) => {
  await mockApi(page, 'employee'); await login(page);
  await page.getByRole('button', { name: 'User directory', exact: true }).click();
  await page.getByRole('button', { name: /Edit/ }).click();
  await page.locator('.edit-input').fill('updated_user');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('updated_user', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('updated_user', { exact: true })).toBeVisible();
});
test('reload clears the in-memory session', async ({ page }) => {
  await mockApi(page); await login(page);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Access your workspace' })).toBeVisible();
});
test('unavailable backend is not presented as verified', async ({ page }) => {
  const state = await mockApi(page); await login(page);
  await expect(page.getByText('Session verified', { exact: true })).toBeVisible();
  state.offline = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Connection unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4);
});
test('mobile navigation and access lab fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page); await login(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Access lab', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access lab' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('registration sends the backend contract and signs in', async ({ page }) => {
  await mockApi(page); await page.goto('/');
  await page.getByRole('tab', { name: 'Register', exact: true }).click();
  await page.getByLabel('MariaDB username').fill('signup_student');
  await page.getByLabel('Password', { exact: true }).fill('test-password-123');
  await page.getByLabel('Confirm password').fill('test-password-123');
  await page.getByRole('button', { name: 'Create account & sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Access control lab' })).toBeVisible();
});
test('reader edit is rejected without changing displayed data', async ({ page }) => {
  await mockApi(page); await login(page);
  await page.getByRole('button', { name: 'User directory', exact: true }).click();
  await page.getByRole('button', { name: /Edit/ }).click();
  await page.locator('.edit-input').fill('forbidden_update');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('MariaDB denied this operation', { exact: true })).toBeVisible();
});
test('offline preview mirrors the empty audit table and sends no API requests', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (/\/(api\/|health)/.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  await page.goto('/?preview=1');
  await expect(page.getByText('student@example.invalid', { exact: true })).toBeVisible();
  await expect(page.getByText('No stored audit rows', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Audit table', exact: true }).click();
  await expect(page.getByText('No stored audit rows', { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
});
