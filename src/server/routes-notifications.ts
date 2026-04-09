import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';

export const notificationRoutes = new Hono<{ Variables: { user: User | null } }>();

// 通知一覧。filter で kind を絞れる (タブ用): kind=comment で comment_* のみ
notificationRoutes.get('/', requireAuth, async (c) => {
  const me = c.get('user')!;
  const kindFilter = c.req.query('kind'); // "all" | "comment"
  const where: any = { userId: me.id };
  if (kindFilter === 'comment') {
    where.kind = { in: ['comment_article', 'comment_post'] };
  }
  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // actor / target の補助情報を一括で取る
  const actorIds = Array.from(new Set(items.map((i) => i.actorId)));
  const articleIds = Array.from(new Set(items.map((i) => i.articleId).filter(Boolean) as string[]));
  const postIds = Array.from(new Set(items.map((i) => i.postId).filter(Boolean) as string[]));

  const [actors, articles, posts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, avatarUrl: true },
    }),
    articleIds.length
      ? prisma.article.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true, emoji: true },
        })
      : Promise.resolve([]),
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, body: true, communityId: true },
        })
      : Promise.resolve([]),
  ]);

  const actorMap = new Map(actors.map((a) => [a.id, a]));
  const articleMap = new Map(articles.map((a) => [a.id, a]));
  const postMap = new Map(posts.map((p) => [p.id, p]));

  return c.json(
    items.map((n) => ({
      id: n.id,
      kind: n.kind,
      actor: actorMap.get(n.actorId) || null,
      article: n.articleId ? articleMap.get(n.articleId) || null : null,
      post: n.postId
        ? (() => {
            const p = postMap.get(n.postId);
            if (!p) return null;
            const excerpt = (p.body || '').slice(0, 80);
            return { id: p.id, excerpt, communityId: p.communityId };
          })()
        : null,
      readAt: n.readAt,
      createdAt: n.createdAt,
    }))
  );
});

// 未読数 (ベルバッジ用)
notificationRoutes.get('/unread-count', requireAuth, async (c) => {
  const me = c.get('user')!;
  const count = await prisma.notification.count({
    where: { userId: me.id, readAt: null },
  });
  return c.json({ count });
});

// 全部既読化 (通知ドロップダウンを開いた時に呼ぶ)
notificationRoutes.post('/mark-all-read', requireAuth, async (c) => {
  const me = c.get('user')!;
  await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  return c.json({ ok: true });
});
