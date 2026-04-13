import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

// 所属ベースのコミュニティ可視性テスト
// admin が affiliation_in コミュニティを作り、所属外ユーザーからは見えないことを検証。
// タイムラインの投稿もアクセスできないことを確認。

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Prisma の DB を直接操作して isAdmin フラグを設定する
const DB_URL = `file:${path.join(PROJECT_ROOT, 'prisma', 'dev.db')}`;

function setAdmin(userId: string, isAdmin: boolean) {
  execSync(
    `npx prisma db execute --url "${DB_URL}" --stdin`,
    {
      cwd: PROJECT_ROOT,
      input: `UPDATE User SET isAdmin = ${isAdmin ? 1 : 0} WHERE id = '${userId}';`,
      timeout: 10_000,
    }
  );
}

async function registerInContext(
  ctx: BrowserContext,
  prefix: string
): Promise<{ page: Page; email: string; password: string; name: string; userId: string }> {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });
  const me = await page.request.get('/api/me');
  const j = await me.json();
  return { page, email, password, name, userId: j.id };
}

test.describe('所属ベースのコミュニティ可視性', () => {
  test.setTimeout(120_000);

  test('affiliation_in コミュニティは所属外ユーザーから見えない', async ({ browser }) => {
    // ========== 0. ユーザー準備 ==========
    const adminCtx = await browser.newContext();
    const memberCtx = await browser.newContext();
    const outsiderCtx = await browser.newContext();

    const admin = await registerInContext(adminCtx, 'aff-admin');
    const member = await registerInContext(memberCtx, 'aff-member');
    const outsider = await registerInContext(outsiderCtx, 'aff-outsider');
    console.log('USERS:', { admin: admin.userId, member: member.userId, outsider: outsider.userId });

    // ========== 1. admin を管理者に昇格 (DB 直接操作) ==========
    setAdmin(admin.userId, true);
    // セッションをリフレッシュして isAdmin を反映
    await admin.page.reload();
    const adminMe = await admin.page.request.get('/api/me');
    const adminMeJ = await adminMe.json();
    expect(adminMeJ.isAdmin, 'admin should have isAdmin=true').toBeTruthy();

    // ========== 2. 所属 (affiliation) を作成 ==========
    const affName = 'team-' + Date.now();
    const affRes = await admin.page.request.post('/api/affiliations', {
      data: { name: affName },
    });
    expect(affRes.ok()).toBeTruthy();
    const aff = await affRes.json();
    console.log('AFFILIATION:', aff.id, aff.name);

    // ========== 3. member に所属を付与、outsider には付与しない ==========
    const assignRes = await admin.page.request.put(
      `/api/admin/users/${member.userId}/affiliations`,
      { data: { affiliationIds: [aff.id] } }
    );
    expect(assignRes.ok(), 'assign affiliation to member').toBeTruthy();

    // admin にも所属付与 (community 作成者として参加するため)
    const assignAdminRes = await admin.page.request.put(
      `/api/admin/users/${admin.userId}/affiliations`,
      { data: { affiliationIds: [aff.id] } }
    );
    expect(assignAdminRes.ok()).toBeTruthy();

    // ========== 4. affiliation_in コミュニティを作成 ==========
    const cRes = await admin.page.request.post('/api/communities', {
      data: {
        name: 'aff-only-' + Date.now(),
        description: '所属限定コミュニティ',
        visibility: 'affiliation_in',
        visibilityAffiliationIds: [aff.id],
      },
    });
    expect(cRes.ok(), 'create affiliation community: ' + cRes.status()).toBeTruthy();
    const community = await cRes.json();
    const cid = community.id;
    console.log('COMMUNITY:', cid);

    // member をメンバーに追加
    const addMemberRes = await admin.page.request.post(`/api/communities/${cid}/members`, {
      data: { userId: member.userId },
    });
    expect(addMemberRes.ok()).toBeTruthy();

    // ========== 5. タイムラインに投稿 ==========
    // ホームTL を取得
    const detailRes = await admin.page.request.get(`/api/communities/${cid}`);
    const detail = await detailRes.json();
    const homeTl = detail.timelines.find((t: any) => t.name === 'ホーム');
    expect(homeTl).toBeTruthy();
    console.log('HOME TL:', homeTl.id);

    // SNS 投稿
    const postRes = await admin.page.request.post('/api/posts', {
      data: { body: '所属限定の投稿です', communityId: cid, timelineId: homeTl.id },
    });
    expect(postRes.ok(), 'post to affiliation community').toBeTruthy();

    // ========== 6. outsider (所属なし) の可視性チェック ==========

    // 6a. コミュニティ一覧 → 見えない
    const outsiderListRes = await outsider.page.request.get('/api/communities');
    const outsiderList = await outsiderListRes.json();
    const found = outsiderList.find((c: any) => c.id === cid);
    expect(found, 'outsider should NOT see affiliation community in list').toBeUndefined();

    // 6b. コミュニティ詳細 → 404
    const outsiderDetailRes = await outsider.page.request.get(`/api/communities/${cid}`);
    expect(outsiderDetailRes.status(), 'outsider detail should be 404').toBe(404);

    // 6c. タイムライン記事・投稿 → 403 (メンバーでない)
    const outsiderTlPostsRes = await outsider.page.request.get(`/api/posts/timeline/${homeTl.id}`);
    expect(outsiderTlPostsRes.status(), 'outsider timeline posts should be 403').toBe(403);

    // 6d. URL直アクセスでもコミュニティページが見えない
    await outsider.page.goto(`/communities/${cid}`);
    await outsider.page.waitForLoadState('networkidle').catch(() => {});
    // 404ページ or コミュニティ一覧にリダイレクトされるはず
    const pageText = await outsider.page.locator('body').textContent();
    expect(pageText).not.toContain('所属限定コミュニティ');

    // ========== 7. member (所属あり) の可視性チェック ==========

    // 7a. コミュニティ一覧 → 見える
    const memberListRes = await member.page.request.get('/api/communities');
    const memberList = await memberListRes.json();
    const memberFound = memberList.find((c: any) => c.id === cid);
    expect(memberFound, 'member should see affiliation community').toBeTruthy();

    // 7b. コミュニティ詳細 → 200
    const memberDetailRes = await member.page.request.get(`/api/communities/${cid}`);
    expect(memberDetailRes.ok(), 'member detail should be 200').toBeTruthy();

    // 7c. タイムライン投稿 → 見える
    const memberTlPostsRes = await member.page.request.get(`/api/posts/timeline/${homeTl.id}`);
    expect(memberTlPostsRes.ok(), 'member timeline posts should be 200').toBeTruthy();
    const memberPosts = await memberTlPostsRes.json();
    expect(memberPosts.some((p: any) => p.body.includes('所属限定'))).toBeTruthy();

    // ========== cleanup ==========
    setAdmin(admin.userId, false); // admin フラグを戻す
    await adminCtx.close();
    await memberCtx.close();
    await outsiderCtx.close();
    console.log('OK: affiliation visibility test passed');
  });
});
