import { test, expect, type Page } from '@playwright/test';

const stamp = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

const E2E_ADMIN = { email: 'e2e-admin@example.test', password: 'e2eadmin12345', name: 'E2E Admin' };

async function ensureAdminLogin(page: Page) {
  const existsRes = await page.request.get('/api/admin/exists');
  const { exists } = await existsRes.json();
  if (!exists) {
    const r = await page.request.post('/api/admin/init', { data: E2E_ADMIN });
    expect(r.ok()).toBeTruthy();
    return;
  }
  const meRes = await page.request.get('/api/admin/me');
  if (meRes.ok()) return;
  const r = await page.request.post('/api/admin/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  if (!r.ok()) test.skip(true, 'E2E 管理者で login できない');
}

async function registerUser(page: Page) {
  const s = stamp();
  const creds = { email: `ffuser-${s}@example.test`, password: `pw-${s}`, name: `FFUser-${s}` };
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(creds.name);
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
  return creds;
}

test.describe('機能フラグ (任意機能の ON/OFF)', () => {
  test('デフォルト OFF: Chat/Pulse リンクが表示されず、API も 404', async ({ browser }) => {
    // 管理者で両機能を OFF に戻す (ベースライン)
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await ensureAdminLogin(adminPage);
    await adminPage.request.put('/api/admin/features/chat', { data: { enabled: false } });
    await adminPage.request.put('/api/admin/features/pulse', { data: { enabled: false } });
    await adminCtx.close();

    // 一般ユーザー
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerUser(page);

    await page.goto('/');
    // Header のナビにチャット/パルスが無い
    await expect(page.getByRole('link', { name: /Chat/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Pulse/ })).toHaveCount(0);

    // URL 直打ちも 404 (リダイレクトで / に戻される)
    await page.goto('/chat');
    await expect(page).toHaveURL('http://localhost:5173/');
    await page.goto('/pulse');
    await expect(page).toHaveURL('http://localhost:5173/');

    // API も 404
    const r1 = await page.request.get('/api/chat/rooms');
    expect(r1.status()).toBe(404);
    const r2 = await page.request.get('/api/pulse/me/current');
    expect(r2.status()).toBe(404);

    await ctx.close();
  });

  test('管理者が Chat を ON にすると Chat リンクが出る (Pulse は OFF のまま)', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await ensureAdminLogin(adminPage);

    // 管理者ページから Chat を ON
    await adminPage.goto('/admin-setting');
    await adminPage.getByRole('button', { name: '機能設定' }).click();
    await expect(adminPage.getByRole('heading', { name: '機能の有効化' })).toBeVisible();

    // Pulse を OFF にリセット (他テストの影響回避)
    await adminPage.request.put('/api/admin/features/pulse', { data: { enabled: false } });

    // 現在の Chat 状態を見て、OFF なら有効化ボタンを押す
    const chatRow = adminPage.locator('li', { hasText: 'チャット' });
    const statusText = await chatRow.locator('span').filter({ hasText: /^(ON|OFF)$/ }).textContent();
    if (statusText?.trim() === 'OFF') {
      await chatRow.getByRole('button', { name: '有効化' }).click();
      await expect(adminPage.locator('.toast')).toContainText('チャットをONにしました');
    }

    await adminPage.screenshot({ path: 'screenshots/feature-flags-admin.png', fullPage: true });
    await adminCtx.close();

    // 一般ユーザー視点
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerUser(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Chat/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pulse/ })).toHaveCount(0);

    // /chat に直接遷移できる
    await page.goto('/chat');
    await expect(page).not.toHaveURL('http://localhost:5173/');

    await ctx.close();

    // クリーンアップ: Chat を OFF に戻す
    const cleanupCtx = await browser.newContext();
    const cp = await cleanupCtx.newPage();
    await ensureAdminLogin(cp);
    await cp.request.put('/api/admin/features/chat', { data: { enabled: false } });
    await cleanupCtx.close();
  });
});
