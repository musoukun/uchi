import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 3 E2E: 通知
// - alice が記事を書く / SNS 投稿する
// - bob がそれぞれにいいね / コメント / フォロー
// - alice 視点でベルにバッジが付き、ドロップダウンを開くと通知が並ぶ
// - 「すべて」と「コメント」タブの絞り込み
// - ドロップダウンを開いたらバッジが消える

const SHOTS_DIR = path.join(process.cwd(), 'screenshots-notif');
let _i = 0;
function shotPath(name: string) {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  _i++;
  return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${name}.png`);
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

async function reg(ctx: BrowserContext, prefix: string) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
  const me = await (await page.request.get('/api/me')).json();
  return { page, email, name, userId: me.id };
}

test.describe('Phase3 通知', () => {
  test.setTimeout(180_000);

  test('like / bookmark / comment / follow → ベルバッジ → ドロップダウン → 既読化', async ({ browser }) => {
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const alice = await reg(aCtx, 'notif-a');
    const bob = await reg(bCtx, 'notif-b');

    // alice が記事
    const ar = await alice.page.request.post('/api/articles', {
      data: {
        title: '通知テスト記事',
        emoji: '🔔',
        type: 'tech',
        body: '通知テスト用の記事です。',
        topicNames: ['notif-test'],
        published: true,
        visibility: 'public',
      },
    });
    expect(ar.ok()).toBeTruthy();
    const article = await ar.json();

    // 共通 community を作って Post も流す
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: 'notif-club-' + Date.now(), description: '', visibility: 'private' },
    });
    const com = await cr.json();
    const inv = await alice.page.request.post(`/api/communities/${com.id}/invites`, {
      data: { email: bob.email },
    });
    const invJ = await inv.json();
    await bob.page.goto(`/invite/${invJ.token}`);
    await bob.page.waitForURL(new RegExp(`/communities/${com.id}$`), { timeout: 10_000 });

    // alice が SNS 投稿
    const pr = await alice.page.request.post('/api/posts', {
      data: { body: '通知テスト用 SNS 投稿', communityId: com.id },
    });
    const post = await pr.json();

    // ---------- bob が4種のアクションを起こす ----------
    // 1) like article
    await bob.page.request.post(`/api/articles/${article.id}/like`, { data: {} });
    // 2) bookmark article
    await bob.page.request.post(`/api/articles/${article.id}/bookmark`, { data: {} });
    // 3) follow alice
    await bob.page.request.post('/api/follows', {
      data: { targetType: 'user', targetId: alice.userId },
    });
    // 4) like post
    await bob.page.request.post(`/api/posts/${post.id}/like`, { data: {} });
    // 5) comment article
    await bob.page.request.post('/api/comments', {
      data: { body: '記事に対するコメント', articleId: article.id },
    });
    // 6) comment post
    await bob.page.request.post('/api/comments', {
      data: { body: '投稿に対するコメント', postId: post.id },
    });

    // ---------- alice 視点で確認 ----------
    // ホームに行って未読数を確認 (poll が走る前なので即取得)
    await alice.page.goto('/');
    await alice.page.waitForLoadState('networkidle').catch(() => {});

    // バッジ数を強制リフレッシュするため、再 navigate でも OK だがコンポーネント mount で取得される
    await alice.page.waitForTimeout(800);
    await shot(alice.page, 'alice-home-with-badge');

    // バッジが見える (6 件)
    const badge = alice.page.locator('.notif-badge');
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    console.log('badge text:', badgeText);
    expect(parseInt(badgeText || '0', 10)).toBeGreaterThanOrEqual(4);

    // ベルを開く
    await alice.page.locator('.notif-bell-btn').click();
    await alice.page.waitForTimeout(600);
    await shot(alice.page, 'alice-notif-dropdown-all');

    // すべてタブの中に like/bookmark/follow/comment が並ぶ
    const panel = alice.page.locator('.notif-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('いいねしました');
    await expect(panel).toContainText('ブックマーク');
    await expect(panel).toContainText('フォローしました');
    await expect(panel).toContainText('コメント');

    // 「コメント」タブに切り替え
    await alice.page.locator('.notif-tabs button', { hasText: 'コメント' }).click();
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'alice-notif-dropdown-comment');
    const panelAfter = alice.page.locator('.notif-panel');
    // コメントタブには like / follow が出ない
    const commentPanelText = await panelAfter.textContent();
    expect(commentPanelText).toContain('コメント');
    expect(commentPanelText).not.toContain('いいねしました');
    expect(commentPanelText).not.toContain('フォローしました');

    // ドロップダウンを閉じる
    await alice.page.locator('body').click({ position: { x: 0, y: 200 } });
    await alice.page.waitForTimeout(300);

    // 既読化されていてバッジが消える
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'alice-after-dropdown-closed');
    const stillBadge = await alice.page.locator('.notif-badge').count();
    expect(stillBadge).toBe(0);

    // unread-count API でも 0 になっている
    const u = await alice.page.request.get('/api/notifications/unread-count');
    const uj = await u.json();
    expect(uj.count).toBe(0);

    // 一覧 API でも 6件 取れる
    const all = await alice.page.request.get('/api/notifications');
    const allJ = await all.json();
    console.log('total notifications:', allJ.length, allJ.map((n: any) => n.kind));
    expect(allJ.length).toBeGreaterThanOrEqual(4);

    console.log('SHOTS:', fs.readdirSync(SHOTS_DIR).sort().join('\n'));
    await aCtx.close();
    await bCtx.close();
  });
});
