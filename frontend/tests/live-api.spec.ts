import { test, expect } from '@playwright/test';

// Opt-in: uses the Vite proxy and an existing MariaDB account, with no data writes.
test.skip(!process.env.CO560_USERNAME || !process.env.CO560_PASSWORD, 'Set credentials to test a running backend.');

test('live proxy authenticates with MariaDB and runs access checks', async ({ page }) => {
  test.skip(!process.env.CO560_USERNAME || !process.env.CO560_PASSWORD, 'Set CO560_USERNAME and CO560_PASSWORD to test a running backend.');
  await page.goto('/');
  await page.getByLabel('MariaDB username').fill(process.env.CO560_USERNAME!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.CO560_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Session verified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Access lab', exact: true }).click();
  await page.getByRole('button', { name: 'Run access checks' }).click();
  await expect(page.getByText('HTTP 200 · 1 row(s) returned', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.check-row')).toHaveCount(4);
  await expect(page.locator('.check-row').getByText('Error', { exact: true })).toHaveCount(0);
});
