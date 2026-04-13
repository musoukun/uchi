import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// タイムライン可視性テスト (2段シンプルモデル)
// 3 ユーザー: Alice (owner) / Bob (メンバー) / Carol (部外者)
//
// テスト観点:
//   1. open TL → コミュニティメンバー (Alice, Bob) は見える、非メンバー (Carol) は見えない
//   2. private TL → TLメンバーに追加された人 + owner のみ見える
//   3. owner は private TL も常にアクセス可
//   4. 非メンバーはどの TL も見えない

async function registerInContext(
  ctx: BrowserContext,
  prefix: string
): Promise<{ page: Page; email: string; name: string; userId: string }> {
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
  return { page, email, name, userId: j.id };
}

test.describe('タイムライン可視性 (open / private)', () => {
  test.setTimeout(180_000);

  test('open / private の可視性が正しく動く', async ({ browser }) => {
    // ========== 0. ユーザー準備 ==========
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();

    const alice = await registerInContext(aliceCtx, 'tl-alice');
    const bob = await registerInContext(bobCtx, 'tl-bob');
    const carol = await registerInContext(carolCtx, 'tl-carol');
    console.log('USERS:', { alice: alice.userId, bob: bob.userId, carol: carol.userId });

    // ========== 1. Alice が public コミュニティを作る ==========
    const cname = 'tl-test-' + Date.now();
    const createRes = await alice.page.request.post('/api/communities', {
      data: { name: cname, description: 'タイムラインテスト用', visibility: 'public' },
    });
    expect(createRes.ok()).toBeTruthy();
    const community = await createRes.json();
    const cid = community.id;
    console.log('COMMUNITY:', cid);

    // Bob をメンバーに追加
    const addBob = await alice.page.request.post(`/api/communities/${cid}/members`, {
      data: { userId: bob.userId },
    });
    expect(addBob.ok()).toBeTruthy();

    // ========== 2. Alice が 2 つのタイムラインを作る ==========

    // (a) open TL (メンバー全員)
    const openTlRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: { name: 'オープンチャンネル', visibility: 'open' },
    });
    expect(openTlRes.ok()).toBeTruthy();
    const openTl = await openTlRes.json();
    expect(openTl.visibility).toBe('open');
    console.log('OPEN TL:', openTl.id);

    // (b) private TL — Bob のみメンバーとして追加
    const privateTlRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: {
        name: 'プライベートチャンネル',
        visibility: 'private',
        memberIds: [bob.userId],
      },
    });
    expect(privateTlRes.ok()).toBeTruthy();
    const privateTl = await privateTlRes.json();
    expect(privateTl.visibility).toBe('private');
    console.log('PRIVATE TL:', privateTl.id);

    // ========== 3. 各 TL に SNS 投稿 ==========
    const postSns = async (body: string, timelineId: string) => {
      const res = await alice.page.request.post('/api/posts', {
        data: { body, communityId: cid, timelineId },
      });
      expect(res.ok(), `post create: ${res.status()}`).toBeTruthy();
      return res.json();
    };

    await postSns('オープンTLの投稿です', openTl.id);
    await postSns('プライベートTLの投稿です', privateTl.id);

    // ========== 4. Carol (非メンバー) → どちらも見えない ==========
    const carolOpenPosts = await carol.page.request.get(`/api/posts/timeline/${openTl.id}`);
    expect(carolOpenPosts.status(), 'Carol cannot see open TL (not a community member)').toBe(403);

    const carolPrivPosts = await carol.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(carolPrivPosts.status(), 'Carol cannot see private TL').toBe(403);

    // ========== 5. Bob (メンバー) の可視性チェック ==========

    // 5a. open TL → メンバーなので見える
    const bobOpenPosts = await bob.page.request.get(`/api/posts/timeline/${openTl.id}`);
    expect(bobOpenPosts.ok(), 'Bob sees open TL (he is a member)').toBeTruthy();
    const bobOpenPostList = await bobOpenPosts.json();
    expect(bobOpenPostList.some((p: any) => p.body.includes('オープンTLの投稿'))).toBeTruthy();

    // 5b. private TL → Bob は TLメンバーに追加されているので見える
    const bobPrivPosts = await bob.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(bobPrivPosts.ok(), 'Bob sees private TL (he is a TL member)').toBeTruthy();
    const bobPrivPostList = await bobPrivPosts.json();
    expect(bobPrivPostList.some((p: any) => p.body.includes('プライベートTLの投稿'))).toBeTruthy();

    // ========== 6. Alice (owner) → 全部見える ==========
    const aliceOpenPosts = await alice.page.request.get(`/api/posts/timeline/${openTl.id}`);
    expect(aliceOpenPosts.ok()).toBeTruthy();

    const alicePrivPosts = await alice.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(alicePrivPosts.ok(), 'Alice (owner) sees private TL').toBeTruthy();

    // ========== 7. コミュニティ詳細 API の timelines フィルタ ==========

    // Carol: 非メンバーなので TL は見えない (コミュニティ詳細は見えるが TL は空)
    const carolDetail = await carol.page.request.get(`/api/communities/${cid}`);
    expect(carolDetail.ok()).toBeTruthy();
    const carolDetailJ = await carolDetail.json();
    const carolTlNames = carolDetailJ.timelines.map((t: any) => t.name);
    console.log('Carol visible TLs:', carolTlNames);
    expect(carolTlNames).not.toContain('オープンチャンネル');
    expect(carolTlNames).not.toContain('プライベートチャンネル');

    // Bob: open + ホーム は見える、private も見える (TLメンバー)
    const bobDetail = await bob.page.request.get(`/api/communities/${cid}`);
    const bobDetailJ = await bobDetail.json();
    const bobTlNames = bobDetailJ.timelines.map((t: any) => t.name);
    console.log('Bob visible TLs:', bobTlNames);
    expect(bobTlNames).toContain('ホーム');
    expect(bobTlNames).toContain('オープンチャンネル');
    expect(bobTlNames).toContain('プライベートチャンネル');

    // Alice: 全部見える
    const aliceDetail = await alice.page.request.get(`/api/communities/${cid}`);
    const aliceDetailJ = await aliceDetail.json();
    const aliceTlNames = aliceDetailJ.timelines.map((t: any) => t.name);
    console.log('Alice visible TLs:', aliceTlNames);
    expect(aliceTlNames).toContain('ホーム');
    expect(aliceTlNames).toContain('オープンチャンネル');
    expect(aliceTlNames).toContain('プライベートチャンネル');

    // ========== 8. private TL から Bob を外す → 見えなくなる ==========
    const removeBobRes = await alice.page.request.patch(
      `/api/communities/${cid}/timelines/${privateTl.id}`,
      { data: { memberIds: [] } } // 空にする = Bob を外す
    );
    expect(removeBobRes.ok()).toBeTruthy();

    const bobPrivAfter = await bob.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(bobPrivAfter.status(), 'Bob cannot see private TL after removal').toBe(403);

    // owner (Alice) はまだ見える
    const alicePrivAfter = await alice.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(alicePrivAfter.ok(), 'Alice (owner) still sees private TL').toBeTruthy();

    // ========== 9. visibility 変更: private → open ==========
    const patchRes = await alice.page.request.patch(
      `/api/communities/${cid}/timelines/${privateTl.id}`,
      { data: { visibility: 'open' } }
    );
    expect(patchRes.ok()).toBeTruthy();
    const patchedTl = await patchRes.json();
    expect(patchedTl.visibility).toBe('open');

    // Bob が再び見えるようになる
    const bobPrivAfterOpen = await bob.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(bobPrivAfterOpen.ok(), 'Bob sees TL after it became open').toBeTruthy();

    // Carol はまだ見えない (コミュニティメンバーではない)
    const carolPrivAfterOpen = await carol.page.request.get(`/api/posts/timeline/${privateTl.id}`);
    expect(carolPrivAfterOpen.status(), 'Carol still cannot see (not a community member)').toBe(403);

    // ========== 10. Carol がコミュニティに参加 → open TL が見えるようになる ==========
    const carolJoin = await carol.page.request.post(`/api/communities/${cid}/join`, { data: {} });
    expect(carolJoin.ok()).toBeTruthy();

    const carolOpenAfterJoin = await carol.page.request.get(`/api/posts/timeline/${openTl.id}`);
    expect(carolOpenAfterJoin.ok(), 'Carol sees open TL after joining community').toBeTruthy();

    // cleanup
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
    console.log('✅ Timeline visibility tests passed');
  });
});
