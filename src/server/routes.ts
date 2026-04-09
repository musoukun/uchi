import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import { requireAuth } from './auth';
import type { User } from '@prisma/client';

export const api = new Hono<{ Variables: { user: User | null } }>();

// ---------- file uploads (画像/GIF) ----------

const UPLOAD_DIR = path.resolve('uploads');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([m, e]) => [e, m])
);

// id -> filename(<id>.<ext>) のキャッシュ。初回ヒット時にディレクトリを舐める
const fileCache = new Map<string, string>();

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function findUploadFile(id: string): Promise<string | null> {
  if (fileCache.has(id)) return fileCache.get(id)!;
  await ensureUploadDir();
  const files = await fs.readdir(UPLOAD_DIR);
  for (const f of files) {
    const dot = f.indexOf('.');
    const fid = dot >= 0 ? f.slice(0, dot) : f;
    if (!fileCache.has(fid)) fileCache.set(fid, f);
  }
  return fileCache.get(id) || null;
}

api.post('/files', requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    return c.json({ error: 'file フィールドが必要です' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'ファイルサイズは 50MB までです' }, 413);
  }
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return c.json({ error: '画像 (png/jpeg/gif/webp/svg) のみアップロードできます' }, 400);
  }
  await ensureUploadDir();
  const id = randomBytes(12).toString('hex');
  const filename = `${id}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
  fileCache.set(id, filename);
  return c.json({
    id,
    url: `/api/files/${id}`,
    name: file.name,
    size: file.size,
    mime: file.type,
  });
});

api.get('/files/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[a-f0-9]{16,}$/.test(id)) return c.json({ error: 'invalid id' }, 400);
  const fname = await findUploadFile(id);
  if (!fname) return c.json({ error: 'not found' }, 404);
  const ext = fname.slice(fname.lastIndexOf('.') + 1).toLowerCase();
  const mime = EXT_TO_MIME[ext] || 'application/octet-stream';
  const data = await fs.readFile(path.join(UPLOAD_DIR, fname));
  return c.body(data, 200, {
    'content-type': mime,
    'cache-control': 'public, max-age=31536000, immutable',
  });
});

// ---------- helpers ----------

function slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 40);
}

async function ensureTopic(name: string) {
  const slug = slugify(name);
  if (!slug) return null;
  const existing = await prisma.topic.findFirst({ where: { OR: [{ slug }, { name }] } });
  if (existing) return existing;
  return prisma.topic.create({ data: { name, slug } });
}

function decorateMany<T extends {
  id: string; topics: { topic: { id: string; name: string; slug: string } }[];
  _count: { likes: number; bookmarks: number };
}>(articles: T[]) {
  return articles.map((a) => ({
    ...a,
    topics: a.topics.map((t) => t.topic),
    likeCount: a._count.likes,
    bookmarkCount: a._count.bookmarks,
  }));
}

const listSelect = {
  id: true,
  authorId: true,
  slug: true,
  title: true,
  emoji: true,
  type: true,
  body: false,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  topics: { select: { topic: { select: { id: true, name: true, slug: true } } } },
  _count: { select: { likes: true, bookmarks: true } },
} as const;

// ログインユーザー取得 (passwordHash 除去)
function safeUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------- me / users ----------

api.get('/me', async (c) => {
  const me = c.get('user');
  if (!me) return c.json(null);
  return c.json(safeUser(me));
});

api.patch('/me', requireAuth, async (c) => {
  const me = c.get('user')!;
  const body = await c.req.json<{ name?: string; bio?: string; avatarUrl?: string }>();
  const data: any = {};
  if (body.name !== undefined) data.name = String(body.name).slice(0, 100);
  if (body.bio !== undefined) data.bio = String(body.bio).slice(0, 500);
  if (body.avatarUrl !== undefined) data.avatarUrl = String(body.avatarUrl).slice(0, 500);
  const updated = await prisma.user.update({ where: { id: me.id }, data });
  return c.json(safeUser(updated));
});

api.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return c.json({ error: 'not found' }, 404);
  return c.json(safeUser(u));
});

// ---------- topics ----------

api.get('/topics', async (c) => {
  const topics = await prisma.topic.findMany({ orderBy: { createdAt: 'asc' } });
  return c.json(topics);
});

// ---------- articles ----------

api.get('/articles', async (c) => {
  const q = c.req.query('q');
  const topicSlug = c.req.query('topicSlug');
  const authorId = c.req.query('authorId');
  const type = c.req.query('type');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  const where: any = { published: true };
  if (authorId) where.authorId = authorId;
  if (type === 'tech' || type === 'idea') where.type = type;
  if (q) where.title = { contains: q };
  if (topicSlug) where.topics = { some: { topic: { slug: topicSlug } } };

  const articles = await prisma.article.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: listSelect,
  });
  return c.json(decorateMany(articles));
});

api.get('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const a = await prisma.article.findUnique({
    where: { id },
    select: { ...listSelect, body: true },
  });
  if (!a) return c.json({ error: 'not found' }, 404);

  let liked = null,
    bookmarked = null,
    followingAuthor = null;
  if (me) {
    [liked, bookmarked, followingAuthor] = await Promise.all([
      prisma.like.findUnique({
        where: { userId_articleId: { userId: me.id, articleId: id } },
      }),
      prisma.bookmark.findUnique({
        where: { userId_articleId: { userId: me.id, articleId: id } },
      }),
      prisma.follow.findUnique({
        where: {
          userId_targetType_targetId: {
            userId: me.id,
            targetType: 'user',
            targetId: a.authorId,
          },
        },
      }),
    ]);
  }

  const decorated = decorateMany([a as any])[0];
  return c.json({
    ...decorated,
    body: (a as any).body,
    likedByMe: !!liked,
    bookmarkedByMe: !!bookmarked,
    followingAuthor: !!followingAuthor,
    isMine: !!(me && me.id === a.authorId),
  });
});

api.post('/articles', requireAuth, async (c) => {
  const me = c.get('user')!;
  const input = await c.req.json<any>();
  return c.json(await saveArticle(me.id, null, input));
});

api.put('/articles/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const input = await c.req.json<any>();
  return c.json(await saveArticle(me.id, id, input));
});

api.delete('/articles/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'not found' }, 404);
  if (existing.authorId !== me.id) return c.json({ error: 'forbidden' }, 403);
  await prisma.article.delete({ where: { id } });
  return c.json({ ok: true });
});

async function saveArticle(
  meId: string,
  id: string | null,
  input: {
    title?: string;
    emoji?: string;
    type?: string;
    body?: string;
    topicNames?: string[];
    published?: boolean;
  }
) {
  const title = String(input.title || '').slice(0, 200);
  const emoji = String(input.emoji || '📝').slice(0, 8);
  const body = String(input.body || '').slice(0, 49000);
  const published = !!input.published;
  const type = input.type === 'idea' ? 'idea' : input.type === 'tech' ? 'tech' : '';
  const topicNames = (input.topicNames || []).slice(0, 5);

  if (published) {
    if (!title.trim()) throw new Error('タイトルは必須です');
    if (type !== 'tech' && type !== 'idea') throw new Error('カテゴリ(Tech/Idea)を選択してください');
    if (topicNames.length === 0) throw new Error('トピックを最低1つ指定してください');
  }

  const topics = (await Promise.all(topicNames.map((n) => ensureTopic(n)))).filter(Boolean) as {
    id: string;
  }[];

  if (id) {
    const existing = await prisma.article.findUnique({ where: { id } });
    if (!existing) throw new Error('not found');
    if (existing.authorId !== meId) throw new Error('forbidden');
    await prisma.article.update({
      where: { id },
      data: {
        title,
        emoji,
        type: type || existing.type,
        body,
        published,
        publishedAt: published ? existing.publishedAt ?? new Date() : null,
        topics: {
          deleteMany: {},
          create: topics.map((t) => ({ topicId: t.id })),
        },
      },
    });
    return getArticleFull(id, meId);
  } else {
    const created = await prisma.article.create({
      data: {
        authorId: meId,
        slug: '',
        title,
        emoji,
        type: type || 'tech',
        body,
        published,
        publishedAt: published ? new Date() : null,
        topics: { create: topics.map((t) => ({ topicId: t.id })) },
      },
    });
    await prisma.article.update({ where: { id: created.id }, data: { slug: created.id } });
    return getArticleFull(created.id, meId);
  }
}

async function getArticleFull(id: string, meId: string) {
  const a = await prisma.article.findUnique({
    where: { id },
    select: { ...listSelect, body: true },
  });
  if (!a) return null;
  const [liked, bookmarked, followingAuthor] = await Promise.all([
    prisma.like.findUnique({ where: { userId_articleId: { userId: meId, articleId: id } } }),
    prisma.bookmark.findUnique({ where: { userId_articleId: { userId: meId, articleId: id } } }),
    prisma.follow.findUnique({
      where: {
        userId_targetType_targetId: { userId: meId, targetType: 'user', targetId: a.authorId },
      },
    }),
  ]);
  const decorated = decorateMany([a as any])[0];
  return {
    ...decorated,
    body: (a as any).body,
    likedByMe: !!liked,
    bookmarkedByMe: !!bookmarked,
    followingAuthor: !!followingAuthor,
    isMine: meId === a.authorId,
  };
}

// ---------- drafts / my ----------

api.get('/me/drafts', requireAuth, async (c) => {
  const me = c.get('user')!;
  const articles = await prisma.article.findMany({
    where: { authorId: me.id },
    orderBy: { updatedAt: 'desc' },
    select: listSelect,
  });
  return c.json(decorateMany(articles));
});

api.get('/me/bookmarks', requireAuth, async (c) => {
  const me = c.get('user')!;
  const bms = await prisma.bookmark.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'desc' },
    include: { article: { select: { ...listSelect, body: false } } },
  });
  const articles = bms.map((b) => b.article).filter((a) => a.published);
  return c.json(decorateMany(articles as any));
});

api.get('/me/following', requireAuth, async (c) => {
  const me = c.get('user')!;
  const follows = await prisma.follow.findMany({ where: { userId: me.id } });
  const userIds = follows.filter((f) => f.targetType === 'user').map((f) => f.targetId);
  const topicIds = follows.filter((f) => f.targetType === 'topic').map((f) => f.targetId);
  const [users, topics] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatarUrl: true },
    }),
    prisma.topic.findMany({ where: { id: { in: topicIds } } }),
  ]);
  return c.json({ users, topics });
});

api.get('/me/following/articles', requireAuth, async (c) => {
  const me = c.get('user')!;
  const follows = await prisma.follow.findMany({ where: { userId: me.id } });
  const userIds = follows.filter((f) => f.targetType === 'user').map((f) => f.targetId);
  const topicIds = follows.filter((f) => f.targetType === 'topic').map((f) => f.targetId);
  if (userIds.length === 0 && topicIds.length === 0) return c.json([]);
  const articles = await prisma.article.findMany({
    where: {
      published: true,
      OR: [
        userIds.length > 0 ? { authorId: { in: userIds } } : undefined,
        topicIds.length > 0 ? { topics: { some: { topicId: { in: topicIds } } } } : undefined,
      ].filter(Boolean) as any,
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: listSelect,
  });
  return c.json(decorateMany(articles));
});

// ---------- likes / bookmarks / follows ----------

api.post('/articles/:id/like', requireAuth, async (c) => {
  const me = c.get('user')!;
  const articleId = c.req.param('id');
  const existing = await prisma.like.findUnique({
    where: { userId_articleId: { userId: me.id, articleId } },
  });
  if (existing) await prisma.like.delete({ where: { id: existing.id } });
  else await prisma.like.create({ data: { userId: me.id, articleId } });
  const count = await prisma.like.count({ where: { articleId } });
  return c.json({ liked: !existing, count });
});

api.post('/articles/:id/bookmark', requireAuth, async (c) => {
  const me = c.get('user')!;
  const articleId = c.req.param('id');
  const existing = await prisma.bookmark.findUnique({
    where: { userId_articleId: { userId: me.id, articleId } },
  });
  if (existing) await prisma.bookmark.delete({ where: { id: existing.id } });
  else await prisma.bookmark.create({ data: { userId: me.id, articleId } });
  const count = await prisma.bookmark.count({ where: { articleId } });
  return c.json({ bookmarked: !existing, count });
});

api.post('/follows', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { targetType, targetId } = await c.req.json<{ targetType: string; targetId: string }>();
  if (targetType !== 'user' && targetType !== 'topic')
    return c.json({ error: 'invalid targetType' }, 400);
  if (!targetId) return c.json({ error: 'invalid targetId' }, 400);
  if (targetType === 'user' && targetId === me.id)
    return c.json({ error: '自分自身はフォローできません' }, 400);

  const existing = await prisma.follow.findUnique({
    where: { userId_targetType_targetId: { userId: me.id, targetType, targetId } },
  });
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return c.json({ following: false });
  } else {
    await prisma.follow.create({ data: { userId: me.id, targetType, targetId } });
    return c.json({ following: true });
  }
});

api.get('/follows/check', requireAuth, async (c) => {
  const me = c.get('user')!;
  const targetType = c.req.query('targetType');
  const targetId = c.req.query('targetId');
  if (!targetType || !targetId) return c.json({ following: false });
  const f = await prisma.follow.findUnique({
    where: { userId_targetType_targetId: { userId: me.id, targetType, targetId } },
  });
  return c.json({ following: !!f });
});

// ---------- trending ----------

api.get('/trending', async (c) => {
  const type = c.req.query('type') === 'idea' ? 'idea' : 'tech';
  const days = Math.min(30, Math.max(1, parseInt(c.req.query('days') || '7', 10) || 7));
  const since = new Date(Date.now() - days * 86400 * 1000);

  const recent = await prisma.like.groupBy({
    by: ['articleId'],
    where: { createdAt: { gte: since } },
    _count: { articleId: true },
  });
  const counts = new Map(recent.map((r) => [r.articleId, r._count.articleId]));
  const ids = recent.map((r) => r.articleId);
  if (ids.length === 0) return c.json({ days, items: [] });

  const articles = await prisma.article.findMany({
    where: { id: { in: ids }, published: true, type },
    select: listSelect,
  });
  const decorated = decorateMany(articles);
  decorated.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
  return c.json({ days, items: decorated });
});

// ---------- config ----------

api.get('/config', (c) =>
  c.json({ trendingDays: 7, trendingDaysMin: 1, trendingDaysMax: 30 })
);
