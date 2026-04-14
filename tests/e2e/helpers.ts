import type { Page } from '@playwright/test';

// uniq なテストユーザーを作成してログインする
export async function registerAndLogin(page: Page, prefix = 'e2e'): Promise<{
  email: string;
  password: string;
  name: string;
}> {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;

  await page.goto('/register');
  // フォームは label + input (placeholder無し)。順序は 表示名 → メール → パスワード
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });

  return { email, password, name };
}

const E2E_ADMIN_FIXED = { email: 'e2e-admin@example.test', password: 'e2eadmin12345', name: 'E2E Admin' };

/** テスト用: 管理者セッションを確立 (init または login) して機能フラグを ON に */
export async function enableFeatureForTest(page: Page, key: 'chat' | 'pulse') {
  const existsRes = await page.request.get('/api/admin/exists');
  const { exists } = await existsRes.json();
  if (!exists) {
    await page.request.post('/api/admin/init', { data: E2E_ADMIN_FIXED });
  } else {
    const meRes = await page.request.get('/api/admin/me');
    if (!meRes.ok()) {
      await page.request.post('/api/admin/auth/login', {
        data: { email: E2E_ADMIN_FIXED.email, password: E2E_ADMIN_FIXED.password },
      });
    }
  }
  await page.request.put(`/api/admin/features/${key}`, { data: { enabled: true } });
}

export async function createArticleViaApi(
  page: Page,
  input: { title: string; body: string; topicNames?: string[]; published?: boolean }
) {
  const r = await page.request.post('/api/articles', {
    data: {
      title: input.title,
      emoji: '✅',
      type: 'howto',
      body: input.body,
      topicNames: input.topicNames || ['e2e'],
      published: input.published ?? true,
    },
  });
  if (!r.ok()) throw new Error('createArticleViaApi failed: ' + r.status() + ' ' + (await r.text()));
  return r.json();
}
