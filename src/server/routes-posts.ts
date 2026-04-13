import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { notify, unnotify } from './notify';
import { canAccessTimeline } from './routes-communities';

export const postRoutes = new Hono<{ Variables: { user: User | null } }>();

// 投稿作成: コミュニティ内 (timelineId 必須 or community のホーム TL 自動)
postRoutes.post('/', requireAuth, async (c) => {
  const me = c.get('user')!;
  const input = await c.req.json<{
    body: string;
    communityId: string;
    timelineId?: string;
    parentPostId?: string;
  }>();
  const body = String(input.body || '').trim();
  if (!body) return c.json({ error: '本文は必須です' }, 400);
  if (body.length > 50000) return c.json({ error: '本文が長すぎます (50000 文字まで)' }, 400);
  if (!input.communityId) return c.json({ error: 'communityId が必要です' }, 400);

  // メンバーチェック
  const m = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: me.id, communityId: input.communityId } },
  });
  if (!m) return c.json({ error: 'コミュニティのメンバーではありません' }, 403);

  // timelineId 検証 / なければ ホーム に振る
  let timelineId = input.timelineId || null;
  if (timelineId) {
    const t = await prisma.communityTimeline.findUnique({ where: { id: timelineId } });
    if (!t || t.communityId !== input.communityId) {
      timelineId = null;
    } else {
      // 投稿可能なタイムラインか (閲覧権限 = 投稿権限とする)
      if (!(await canAccessTimeline(t, me))) {
        return c.json({ error: 'このタイムラインへの投稿権限がありません' }, 403);
      }
    }
  }
  if (!timelineId) {
    const home =
      (await prisma.communityTimeline.findFirst({
        where: { communityId: input.communityId, name: 'ホーム' },
      })) ||
      (await prisma.communityTimeline.create({
        data: { communityId: input.communityId, name: 'ホーム', visibility: 'members_only' },
      }));
    timelineId = home.id;
  }

  // parentPostId の検証
  let parentPostId: string | null = null;
  if (input.parentPostId) {
    const parent = await prisma.post.findUnique({ where: { id: input.parentPostId } });
    if (!parent || parent.communityId !== input.communityId) {
      return c.json({ error: '親投稿が見つかりません' }, 400);
    }
    parentPostId = parent.id;
  }

  // SNS 投稿は記事と違って即承認 (運用シンプル化のため。後で community.requireApprovalForPosts を入れる余地)
  const created = await prisma.post.create({
    data: {
      authorId: me.id,
      communityId: input.communityId,
      timelineId,
      parentPostId,
      body,
      approvalStatus: 'approved',
    },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });
  return c.json(serializePost(created, me.id));
});

// タイムライン上の投稿一覧
postRoutes.get('/timeline/:timelineId', async (c) => {
  const me = c.get('user');
  const tlId = c.req.param('timelineId');
  const tl = await prisma.communityTimeline.findUnique({ where: { id: tlId } });
  if (!tl) return c.json({ error: 'not found' }, 404);

  // visibility check (共通ヘルパー)
  if (!(await canAccessTimeline(tl, me))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const posts = await prisma.post.findMany({
    where: {
      timelineId: tlId,
      approvalStatus: 'approved',
      parentPostId: null, // トップレベルだけ。リプライは別途取得
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
      // 自分がいいねしているかは別 query にする
    },
  });

  // 自分が like 済みの post id セット
  let likedSet = new Set<string>();
  if (me) {
    const liked = await prisma.postLike.findMany({
      where: { userId: me.id, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true },
    });
    likedSet = new Set(liked.map((l) => l.postId));
  }

  return c.json(posts.map((p) => serializePost(p, me?.id, likedSet)));
});

postRoutes.get('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const p = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });
  if (!p) return c.json({ error: 'not found' }, 404);

  // visibility (community private + members only)
  if (p.communityId) {
    const com = await prisma.community.findUnique({ where: { id: p.communityId } });
    if (com?.visibility === 'private') {
      if (!me) return c.json({ error: 'not found' }, 404);
      const isMember = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: me.id, communityId: p.communityId } },
      });
      if (!isMember) return c.json({ error: 'not found' }, 404);
    }
  }
  return c.json(serializePost(p, me?.id));
});

postRoutes.delete('/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const p = await prisma.post.findUnique({ where: { id } });
  if (!p) return c.json({ error: 'not found' }, 404);
  // 作者または community owner だけ削除可
  let canDelete = p.authorId === me.id;
  if (!canDelete && p.communityId) {
    const m = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: me.id, communityId: p.communityId } },
    });
    canDelete = m?.role === 'owner';
  }
  if (!canDelete) return c.json({ error: 'forbidden' }, 403);
  await prisma.post.delete({ where: { id } });
  return c.json({ ok: true });
});

postRoutes.post('/:id/like', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const p = await prisma.post.findUnique({ where: { id } });
  if (!p) return c.json({ error: 'not found' }, 404);
  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: id, userId: me.id } },
  });
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    await unnotify({ userId: p.authorId, actorId: me.id, kind: 'like_post', postId: id });
  } else {
    await prisma.postLike.create({ data: { postId: id, userId: me.id } });
    await notify({ userId: p.authorId, actorId: me.id, kind: 'like_post', postId: id });
  }
  const count = await prisma.postLike.count({ where: { postId: id } });
  return c.json({ liked: !existing, count });
});

function serializePost(
  p: any,
  meId?: string | null,
  likedSet?: Set<string>
) {
  return {
    id: p.id,
    body: p.body,
    authorId: p.authorId,
    author: p.author,
    communityId: p.communityId,
    timelineId: p.timelineId,
    parentPostId: p.parentPostId,
    likeCount: p._count?.likes ?? 0,
    commentCount: p._count?.comments ?? 0,
    likedByMe: likedSet ? likedSet.has(p.id) : false,
    isMine: meId ? p.authorId === meId : false,
    createdAt: p.createdAt,
  };
}
