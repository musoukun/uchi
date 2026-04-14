import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const stamp = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

// 決定論的な E2E 用管理者クレデンシャル。初回 init で作り、以降は login で再利用。
const E2E_ADMIN = { email: 'e2e-admin@example.test', password: 'e2eadmin12345', name: 'E2E Admin' };

/** 管理者セッションを確立する (init 済みなら login) */
async function ensureAdminLogin(page: Page) {
  const existsRes = await page.request.get('/api/admin/exists');
  const { exists } = await existsRes.json();

  if (!exists) {
    const r = await page.request.post('/api/admin/init', { data: E2E_ADMIN });
    expect(r.ok(), `admin/init failed: ${r.status()}`).toBeTruthy();
    return;
  }

  // 既にセッションがあれば何もしない
  const meRes = await page.request.get('/api/admin/me');
  if (meRes.ok()) return;

  // 既存 E2E 管理者でログイン
  const r = await page.request.post('/api/admin/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  if (!r.ok()) {
    test.skip(true, `既存管理者がいるが E2E 用クレデンシャルで login できない (${r.status()})`);
  }
}

test.describe('管理者ページのパルスサーベイ管理', () => {
  test('管理者ページから全社サーベイを作成 → 所属なしユーザーで回答できる', async ({ browser }) => {
    // ---- 1. 管理者として全社サーベイを作成 ----
    const adminCtx: BrowserContext = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await ensureAdminLogin(adminPage);
    // パルスサーベイ機能を ON にする (デフォルト OFF)
    await adminPage.request.put('/api/admin/features/pulse', { data: { enabled: true } });

    await adminPage.goto('/admin-setting');
    await expect(adminPage.locator('h2', { hasText: '管理者ページ' })).toBeVisible();

    // パルスサーベイタブに切り替え
    await adminPage.getByRole('button', { name: 'パルスサーベイ' }).click();
    await expect(adminPage.getByRole('heading', { name: 'サーベイを作成' })).toBeVisible();

    // 全社サーベイを作成 (409 OK: 既に作成済みならスキップ)
    const before = await adminPage.request.get('/api/admin/pulse/surveys');
    const beforeList = await before.json();
    const hasCompanyOpen = (beforeList as any[]).some(
      (s) => s.affiliationId === null && s.status === 'open'
    );

    if (!hasCompanyOpen) {
      await adminPage.getByRole('button', { name: '全社サーベイを開始' }).click();
      await expect(adminPage.locator('.toast')).toContainText(/(全社サーベイを作成しました|既に存在)/);
    }

    await adminPage.screenshot({ path: 'screenshots/admin-pulse-01-surveys.png', fullPage: true });

    // サーベイ一覧に「全社」エントリがある
    await expect(adminPage.locator('.tag', { hasText: '全社' }).first()).toBeVisible();

    // ---- 2. 所属なしの一般ユーザーでログインして回答画面を確認 ----
    const userCtx: BrowserContext = await browser.newContext();
    const userPage = await userCtx.newPage();

    const s = stamp();
    const userCreds = {
      email: `pulseuser-${s}@example.test`,
      password: `pw-${s}`,
      name: `User-${s}`,
    };
    await userPage.goto('/register');
    await userPage.locator('input[type="text"]').first().fill(userCreds.name);
    await userPage.locator('input[type="email"]').fill(userCreds.email);
    await userPage.locator('input[type="password"]').fill(userCreds.password);
    await userPage.getByRole('button', { name: /登録/ }).click();
    await userPage.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });

    await userPage.goto('/pulse');
    await expect(userPage.locator('.pulse-page-title')).toContainText('パルスサーベイ');

    // 所属なしでもサーベイカードが見えること
    await expect(userPage.locator('.pulse-survey-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(userPage.locator('.pulse-aff-name', { hasText: '全社' }).first()).toBeVisible();

    // 「所属が設定されていません」が出ていないこと (旧バグの回帰防止)
    await expect(userPage.getByText('所属が設定されていません')).toHaveCount(0);

    // 管理 UI (サーベイ作成カード) がユーザー側に出ていないこと
    await expect(userPage.locator('.pulse-admin-card')).toHaveCount(0);

    await userPage.screenshot({ path: 'screenshots/admin-pulse-02-user-view.png', fullPage: true });

    // 回答する ボタンが見える
    await expect(
      userPage.locator('.pulse-survey-card').first().getByRole('button', { name: /回答する/ })
    ).toBeVisible();

    await adminCtx.close();
    await userCtx.close();
  });

  test('ユーザーのパルスサーベイ画面に管理者向け UI がないこと', async ({ browser, page }) => {
    // 機能 ON にしておく (別コンテキストで管理者セッション)
    const adminCtx = await browser.newContext();
    const ap = await adminCtx.newPage();
    await ensureAdminLogin(ap);
    await ap.request.put('/api/admin/features/pulse', { data: { enabled: true } });
    await adminCtx.close();

    const s = stamp();
    const creds = { email: `pulseplain-${s}@example.test`, password: `pw-${s}`, name: `Plain-${s}` };
    await page.goto('/register');
    await page.locator('input[type="text"]').first().fill(creds.name);
    await page.locator('input[type="email"]').fill(creds.email);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.getByRole('button', { name: /登録/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });

    await page.goto('/pulse');
    await expect(page.locator('.pulse-page-title')).toBeVisible();

    // 作成カード・クローズボタンが存在しない
    await expect(page.locator('.pulse-admin-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /クローズ/ })).toHaveCount(0);
  });
});
