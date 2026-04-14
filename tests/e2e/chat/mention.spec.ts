import { test, expect, Page } from '@playwright/test';
import { registerAndLogin, enableFeatureForTest } from '../helpers';

const SCREENSHOT_DIR = 'screenshots/chat-mention';

/** 2ユーザーをセットアップし、チャットルームを作成してメンバー追加する */
async function setupChatRoom(
  pageA: Page,
  pageB: Page,
): Promise<{ roomId: string; userA: string; userB: string; nameA: string; nameB: string }> {
  // ユーザーA: ルーム作成者
  const a = await registerAndLogin(pageA, 'mentionA');
  // ユーザーB: メンバー
  const b = await registerAndLogin(pageB, 'mentionB');

  // ユーザーBのIDを取得
  const meB = await pageB.request.get('/api/me');
  const { id: userBId } = await meB.json();

  // ユーザーAでルームを作成
  const createRes = await pageA.request.post('/api/chat/rooms', {
    data: { name: `test-mention-${Date.now()}`, visibility: 'public' },
  });
  const room = await createRes.json();

  // ユーザーBをメンバーに追加
  await pageA.request.post(`/api/chat/rooms/${room.id}/members`, {
    data: { userId: userBId },
  });

  // ユーザーAのIDを取得
  const meA = await pageA.request.get('/api/me');
  const { id: userAId } = await meA.json();

  return { roomId: room.id, userA: userAId, userB: userBId, nameA: a.name, nameB: b.name };
}

test.describe('チャット @メンション機能', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await enableFeatureForTest(p, 'chat');
    await ctx.close();
  });

  test('@ 入力でメンションピッカーが表示される', async ({ page }) => {
    const { name } = await registerAndLogin(page, 'mention-pick');

    // ルーム作成
    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `picker-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    // チャットルームに移動
    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    // @ を入力
    const input = page.locator('.dc-input');
    await input.fill('@');
    // テキストエリアの入力イベントを発火させるため、type を使う
    await input.clear();
    await input.type('@');

    // メンションピッカーが表示される
    await expect(page.locator('.mention-picker')).toBeVisible({ timeout: 5000 });

    // @everyone が候補に含まれている
    await expect(page.locator('.mention-picker-item').filter({ hasText: 'everyone' })).toBeVisible();

    // 自分の名前も候補に含まれている
    await expect(page.locator('.mention-picker-item').filter({ hasText: name })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-mention-picker-visible.png`, fullPage: false });
  });

  test('メンション候補を検索でフィルタできる', async ({ page }) => {
    const { name } = await registerAndLogin(page, 'mention-filter');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `filter-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    const input = page.locator('.dc-input');
    // @every と入力 → everyone のみ表示
    await input.type('@every');

    await expect(page.locator('.mention-picker')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.mention-picker-item').filter({ hasText: 'everyone' })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-mention-filter-everyone.png`, fullPage: false });

    // @存在しないクエリ → ピッカーが消える
    await input.clear();
    await input.type('@xyznonexistent');

    await expect(page.locator('.mention-picker')).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-mention-filter-no-match.png`, fullPage: false });
  });

  test('メンション候補をクリックで選択するとメンション形式で挿入される', async ({ page }) => {
    const { name } = await registerAndLogin(page, 'mention-sel');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `select-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    const input = page.locator('.dc-input');
    await input.type('@every');

    await expect(page.locator('.mention-picker')).toBeVisible({ timeout: 5000 });

    // キーボードで選択 (click がviewport外で失敗する場合の対策)
    await page.keyboard.press('Enter');

    // テキストエリアにメンション形式が挿入されている
    const value = await input.inputValue();
    expect(value).toContain('@[everyone](everyone)');

    // ピッカーが閉じている
    await expect(page.locator('.mention-picker')).not.toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-mention-inserted.png`, fullPage: false });
  });

  test('メンション付きメッセージを送信するとハイライト表示される', async ({ page }) => {
    await registerAndLogin(page, 'mention-render');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `render-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    const input = page.locator('.dc-input');
    // メンション形式を直接入力して送信
    await input.fill('こんにちは @[everyone](everyone) テスト');
    await page.keyboard.press('Enter');

    // メッセージ内でメンションがハイライトされている
    await expect(page.locator('.mention-inline').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.mention-everyone').first()).toBeVisible();
    await expect(page.locator('.mention-everyone').first()).toHaveText('@everyone');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-mention-rendered.png`, fullPage: false });
  });

  test('メンションをクリックするとミニプロフィールカードが表示される', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const { roomId, userB, nameB } = await setupChatRoom(pageA, pageB);

    // ユーザーAでチャットルームに移動
    await pageA.goto(`/chat/${roomId}`);
    await pageA.waitForSelector('.dc-input');

    // メンション形式のメッセージを直接入力して送信
    const input = pageA.locator('.dc-input');
    await input.fill(`こんにちは @[${nameB}](${userB}) さん！`);
    await pageA.keyboard.press('Enter');

    // メンションインラインが表示されるのを待つ
    await expect(pageA.locator('.mention-inline').first()).toBeVisible({ timeout: 5000 });

    await pageA.screenshot({ path: `${SCREENSHOT_DIR}/06-mention-message-sent.png`, fullPage: false });

    // メンションをクリック
    await pageA.locator('.mention-inline').first().click();

    // ミニプロフィールカードが表示される
    await expect(pageA.locator('.mini-profile-card')).toBeVisible({ timeout: 5000 });
    await expect(pageA.locator('.mini-profile-name')).toBeVisible();

    await pageA.screenshot({ path: `${SCREENSHOT_DIR}/07-mini-profile-card.png`, fullPage: false });

    // 閉じる
    await pageA.keyboard.press('Escape');
    await expect(pageA.locator('.mini-profile-card')).not.toBeVisible({ timeout: 3000 });

    await contextA.close();
    await contextB.close();
  });

  test('自分のメンションをクリックすると「プロフィールを編集」が表示される', async ({ page }) => {
    const { name } = await registerAndLogin(page, 'mention-self');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `self-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    // 自分のIDを取得
    const meRes = await page.request.get('/api/me');
    const me = await meRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    // 自分へのメンション付きメッセージを送信
    const input = page.locator('.dc-input');
    await input.fill(`テスト @[${name}](${me.id}) メッセージ`);
    await page.keyboard.press('Enter');

    // メンションが表示されるのを待つ
    await expect(page.locator('.mention-inline').first()).toBeVisible({ timeout: 5000 });

    // メンションをクリック
    await page.locator('.mention-inline').first().click();

    // ミニプロフィールカードが表示される
    await expect(page.locator('.mini-profile-card')).toBeVisible({ timeout: 5000 });

    // 「プロフィールを編集」リンクがある
    await expect(page.locator('.mini-profile-btn').filter({ hasText: 'プロフィールを編集' })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-self-mention-edit-profile.png`, fullPage: false });

    // 閉じる
    await page.keyboard.press('Escape');
  });

  test('@everyone メンションクリックではミニプロフィールが開かない', async ({ page }) => {
    await registerAndLogin(page, 'mention-everyone-nocard');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `everyone-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    const input = page.locator('.dc-input');
    await input.fill('全員 @[everyone](everyone) へ');
    await page.keyboard.press('Enter');

    await expect(page.locator('.mention-everyone').first()).toBeVisible({ timeout: 5000 });

    // @everyone をクリック
    await page.locator('.mention-everyone').first().click();

    // ミニプロフィールは表示されない
    await expect(page.locator('.mini-profile-card')).not.toBeVisible({ timeout: 2000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-everyone-no-profile.png`, fullPage: false });
  });

  test('キーボードでメンション候補を選択できる (ArrowDown + Enter)', async ({ page }) => {
    await registerAndLogin(page, 'mention-kb');

    const createRes = await page.request.post('/api/chat/rooms', {
      data: { name: `kb-test-${Date.now()}`, visibility: 'public' },
    });
    const room = await createRes.json();

    await page.goto(`/chat/${room.id}`);
    await page.waitForSelector('.dc-input');

    const input = page.locator('.dc-input');
    await input.type('@');

    await expect(page.locator('.mention-picker')).toBeVisible({ timeout: 5000 });

    // ArrowDown で2番目の候補に移動
    await page.keyboard.press('ArrowDown');

    // 2番目の候補が selected になっているか確認 (state 更新を待つ)
    const secondItem = page.locator('.mention-picker-item').nth(1);
    await expect(secondItem).toHaveClass(/selected/, { timeout: 3000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-keyboard-navigation.png`, fullPage: false });

    // Enter で選択
    await page.keyboard.press('Enter');

    // ピッカーが閉じている
    await expect(page.locator('.mention-picker')).not.toBeVisible();

    // テキストエリアにメンション形式が挿入されている
    const value = await input.inputValue();
    expect(value).toMatch(/@\[.+\]\(.+\)/);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-keyboard-selected.png`, fullPage: false });
  });
});
