import { test, expect, type Page } from '@playwright/test';

// ---- ヘルパー ----

const stamp = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

/** 管理者としてログイン (admin/init or 既存管理者) */
async function loginAsAdmin(page: Page) {
  const s = stamp();
  const creds = { email: `admin-${s}@example.test`, password: `pw-${s}`, name: `Admin-${s}` };

  const existsRes = await page.request.get('/api/admin/exists');
  const { exists } = await existsRes.json();

  if (!exists) {
    const res = await page.request.post('/api/admin/init', { data: creds });
    expect(res.ok(), `admin/init failed: ${res.status()}`).toBeTruthy();
  } else {
    // 既に管理者がいる → 通常登録してからページ経由でログイン
    await page.goto('/register');
    await page.locator('input[type="text"]').first().fill(creds.name);
    await page.locator('input[type="email"]').fill(creds.email);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.getByRole('button', { name: /登録/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });
  }

  const meRes = await page.request.get('/api/me');
  const me = await meRes.json();
  return { ...creds, me };
}

/** 通常ユーザーとして登録+ログイン */
async function registerUser(page: Page, prefix = 'pulse') {
  const s = stamp();
  const creds = { email: `${prefix}-${s}@example.test`, password: `pw-${s}`, name: `${prefix}-${s}` };
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(creds.name);
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });
  const meRes = await page.request.get('/api/me');
  const me = await meRes.json();
  return { ...creds, me };
}

// ---- テスト ----

test.describe('パルスサーベイ', () => {
  test('回答 → 結果確認 → 個人トレンド → 所属別結果 の一連フロー', async ({ page }) => {
    // ===== セットアップ (API 直叩き) =====

    // 1. 管理者としてログイン
    const admin = await loginAsAdmin(page);
    // パルスサーベイ機能を ON (デフォルト OFF)
    await page.request.put('/api/admin/features/pulse', { data: { enabled: true } });

    // 2. 所属を作成
    const affName = `Team-${stamp()}`;
    const affRes = await page.request.post('/api/admin/affiliations', { data: { name: affName } });
    if (!affRes.ok()) {
      // admin/init で作った直後は admin フラグあるはず。なければ通常APIで
      const affRes2 = await page.request.post('/api/affiliations', { data: { name: affName } });
      expect(affRes2.ok(), `affiliation create failed`).toBeTruthy();
    }
    // 作成した所属を取得
    const allAff = await (await page.request.get('/api/affiliations')).json();
    const affiliation = allAff.find((a: any) => a.name === affName);
    expect(affiliation, 'affiliation not found').toBeTruthy();

    // 3. 管理者ユーザーを所属に紐付け
    await page.request.put(`/api/admin/users/${admin.me.id}/affiliations`, {
      data: { affiliationIds: [affiliation.id] },
    });

    // 4. サーベイを作成
    const surveyRes = await page.request.post(`/api/pulse/affiliations/${affiliation.id}`, {
      data: {},
    });
    expect(surveyRes.ok() || surveyRes.status() === 409,
      `survey create: ${surveyRes.status()} ${await surveyRes.text()}`
    ).toBeTruthy();

    // ===== Step 1: パルスサーベイページ =====
    await page.goto('/pulse');
    await expect(page.locator('.pulse-page-title')).toContainText('パルスサーベイ');

    // マイサーベイにカードが出るまで待つ
    await expect(page.locator('.pulse-survey-card').first()).toBeVisible({ timeout: 10_000 });

    // スクショ 1: マイサーベイ一覧
    await page.screenshot({ path: 'screenshots/pulse-01-my-surveys.png', fullPage: true });

    // ===== Step 2: 回答する =====
    await page.locator('.pulse-survey-card').first().getByRole('button', { name: /回答する/ }).click();
    await expect(page.locator('.pulse-form')).toBeVisible();
    await expect(page.locator('.pulse-progress-text')).toContainText('0 / 15');

    // スクショ 2: 回答フォーム (空)
    await page.screenshot({ path: 'screenshots/pulse-02-form-empty.png', fullPage: true });

    // 15問全て回答 (7次元: direction/alignment/fairness/leadership/execution/value/safety)
    const scores = [4, 3, 3, 4, 2, 3, 4, 5, 3, 4, 3, 4, 5, 3, 4];
    const questions = page.locator('.pulse-question');
    for (let i = 0; i < 15; i++) {
      await questions.nth(i).locator('.likert-btn').nth(scores[i] - 1).click();
    }

    await expect(page.locator('.pulse-progress-text')).toContainText('15 / 15');

    // コメント入力
    await page.locator('.pulse-comment').fill('E2Eテストからの回答です');

    // スクショ 3: 回答フォーム (入力済み)
    await page.screenshot({ path: 'screenshots/pulse-03-form-filled.png', fullPage: true });

    // 送信
    await page.getByRole('button', { name: /回答を送信/ }).click();

    // トースト確認
    await expect(page.locator('.toast')).toContainText('回答を送信しました');

    // 回答済みバッジ
    await expect(page.locator('.pulse-responded-badge').first()).toBeVisible({ timeout: 10_000 });

    // スクショ 4: 回答済み一覧
    await page.screenshot({ path: 'screenshots/pulse-04-responded.png', fullPage: true });

    // ===== Step 3: 結果を見る =====
    await page.getByRole('button', { name: /結果を見る/ }).first().click();
    await expect(page.locator('.pulse-results')).toBeVisible({ timeout: 10_000 });

    // スクショ 5: 結果画面
    await page.screenshot({ path: 'screenshots/pulse-05-results.png', fullPage: true });

    // 戻る
    await page.getByRole('button', { name: /戻る/ }).click();

    // ===== Step 4: 個人トレンドタブ =====
    await page.getByRole('button', { name: /個人トレンド/ }).click();
    await page.waitForTimeout(1500);

    // スクショ 6: 個人トレンド
    await page.screenshot({ path: 'screenshots/pulse-06-personal-trends.png', fullPage: true });

    // ===== Step 5: 所属別結果タブ =====
    await page.getByRole('button', { name: /所属別結果/ }).click();
    await expect(page.locator('.pulse-aff-selector select')).toBeVisible();

    // 履歴がロードされるまで待つ
    await expect(page.locator('.pulse-history-item').first()).toBeVisible({ timeout: 10_000 });

    // スクショ 7: 所属別結果
    await page.screenshot({ path: 'screenshots/pulse-07-affiliation-results.png', fullPage: true });

    // 履歴をクリックして詳細表示
    await page.locator('.pulse-history-item').first().click();
    await expect(page.locator('.pulse-results')).toBeVisible({ timeout: 10_000 });

    // スクショ 8: 所属別 詳細結果
    await page.screenshot({ path: 'screenshots/pulse-08-affiliation-detail.png', fullPage: true });
  });
});
