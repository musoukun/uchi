import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import { requireAuth } from './auth';
import type { User } from '@prisma/client';
import { affiliationRoutes } from './routes-affiliations';
import { communityRoutes } from './routes-communities';
import { aiRoutes } from './routes-ai';
import { aggregationRoutes } from './routes-aggregation';
import { postRoutes } from './routes-posts';
import { commentRoutes } from './routes-comments';
import { notificationRoutes } from './routes-notifications';
import { ogpRoutes } from './routes-ogp';
import { searchRoutes } from './routes-search';
import { adminRoutes } from './routes-admin';
import { chatRoutes } from './routes-chat';
import { reactionRoutes } from './routes-reactions';
import { emojiRoutes } from './routes-emoji';
import { notify, unnotify } from './notify';

export const api = new Hono<{ Variables: { user: User | null } }>();

// 拡張ルートを mount
api.route('/affiliations', affiliationRoutes);
api.route('/communities', communityRoutes);
api.route('/ai', aiRoutes);
api.route('/aggregation', aggregationRoutes);
api.route('/posts', postRoutes);
api.route('/comments', commentRoutes);
api.route('/notifications', notificationRoutes);
api.route('/ogp', ogpRoutes);
api.route('/search', searchRoutes);
api.route('/admin', adminRoutes);
api.route('/chat', chatRoutes);
api.route('/reactions', reactionRoutes);
api.route('/emoji', emojiRoutes);

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
  scheduledAt: true,
  visibility: true,
  visibilityAffiliationIds: true,
  communityId: true,
  timelineId: true,
  approvalStatus: true,
  approvalNote: true,
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
  const body = await c.req.json<{ name?: string; bio?: string; avatarUrl?: string | null; avatarColor?: string | null }>();
  const data: any = {};
  if (body.name !== undefined) data.name = String(body.name).slice(0, 100);
  if (body.bio !== undefined) data.bio = String(body.bio).slice(0, 500);
  if (body.avatarUrl !== undefined) {
    data.avatarUrl = body.avatarUrl === null ? null : String(body.avatarUrl).slice(0, 500);
  }
  if (body.avatarColor !== undefined) {
    data.avatarColor = body.avatarColor === null ? null : String(body.avatarColor).slice(0, 7);
  }
  const updated = await prisma.user.update({ where: { id: me.id }, data });
  return c.json(safeUser(updated));
});

api.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      affiliations: { include: { affiliation: true } },
    },
  });
  if (!u) return c.json({ error: 'not found' }, 404);
  // 統計情報 (記事数 / SNS投稿数 / フォロワー数 / フォロー中数)
  const [articleCount, postCount, followerCount, followingCount] = await Promise.all([
    prisma.article.count({ where: { authorId: id, published: true, approvalStatus: 'approved' } }),
    prisma.post.count({ where: { authorId: id, approvalStatus: 'approved', parentPostId: null } }),
    prisma.follow.count({ where: { targetType: 'user', targetId: id } }),
    prisma.follow.count({ where: { userId: id, targetType: 'user' } }),
  ]);
  const { passwordHash, affiliations, ...rest } = u as any;
  return c.json({
    ...rest,
    affiliations: (affiliations as any[]).map((a) => ({
      id: a.affiliation.id,
      name: a.affiliation.name,
      slug: a.affiliation.slug,
    })),
    stats: { articleCount, postCount, followerCount, followingCount },
  });
});

// ユーザーの SNS 投稿一覧 (公開コミュニティのみ)
api.get('/users/:id/posts', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10) || 30, 100);

  const posts = await prisma.post.findMany({
    where: {
      authorId: id,
      approvalStatus: 'approved',
      parentPostId: null,
      // private community の投稿はメンバーのみ閲覧可
      OR: [
        { communityId: null },
        { community: { visibility: 'public' } },
        ...(me
          ? [
              {
                community: {
                  visibility: 'private' as any,
                  members: { some: { userId: me.id } },
                },
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });

  let likedSet = new Set<string>();
  if (me) {
    const liked = await prisma.postLike.findMany({
      where: { userId: me.id, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true },
    });
    likedSet = new Set(liked.map((l) => l.postId));
  }

  return c.json(
    posts.map((p: any) => ({
      id: p.id,
      body: p.body,
      authorId: p.authorId,
      author: p.author,
      communityId: p.communityId,
      timelineId: p.timelineId,
      parentPostId: p.parentPostId,
      likeCount: p._count?.likes ?? 0,
      commentCount: p._count?.comments ?? 0,
      likedByMe: likedSet.has(p.id),
      isMine: me ? p.authorId === me.id : false,
      createdAt: p.createdAt,
    }))
  );
});

// ---------- topics ----------

api.get('/topics', async (c) => {
  const topics = await prisma.topic.findMany({ orderBy: { createdAt: 'asc' } });
  return c.json(topics);
});

// ---------- articles ----------

api.get('/articles', async (c) => {
  const me = c.get('user');
  const q = c.req.query('q');
  const topicSlug = c.req.query('topicSlug');
  const authorId = c.req.query('authorId');
  const type = c.req.query('type');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  const where: any = { published: true, approvalStatus: 'approved' };
  if (authorId) where.authorId = authorId;
  if (type === 'howto' || type === 'diary') where.type = type;
  if (q) where.title = { contains: q };
  if (topicSlug) where.topics = { some: { topic: { slug: topicSlug } } };

  const articles = await prisma.article.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit * 2, // visibility 弾きを考慮して多めに引く
    select: listSelect,
  });
  const visible = await filterByVisibility(articles as any, me?.id || null);
  return c.json(decorateMany(visible.slice(0, limit) as any));
});

api.get('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const a = await prisma.article.findUnique({
    where: { id },
    select: { ...listSelect, body: true },
  });
  if (!a) return c.json({ error: 'not found' }, 404);
  // visibility チェック (本人以外には弾く)
  if (a.authorId !== me?.id) {
    const visible = await filterByVisibility([a as any], me?.id || null);
    if (visible.length === 0) return c.json({ error: 'forbidden' }, 403);
  }

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
    // 拡張フィールド
    visibility?: string;
    visibilityAffiliationIds?: string[];
    scheduledAt?: string | null;
    communityId?: string | null;
    timelineId?: string | null;
    approvalStatus?: string; // "draft" | "pending" | "approved"
  }
) {
  const title = String(input.title || '').slice(0, 200);
  const emoji = String(input.emoji || '📝').slice(0, 8);
  const body = String(input.body || '').slice(0, 49000);
  let published = !!input.published;
  const type = input.type === 'diary' ? 'diary' : input.type === 'howto' ? 'howto' : '';
  const topicNames = (input.topicNames || []).slice(0, 5);

  // visibility: "public" | "friends_only"
  const visibility =
    input.visibility === 'friends_only'
      ? 'friends_only'
      : 'public';
  const visibilityAffiliationIds = ''; // レガシー (未使用)

  // schedule
  let scheduledAt: Date | null = null;
  if (input.scheduledAt) {
    const d = new Date(input.scheduledAt);
    if (!isNaN(d.getTime())) scheduledAt = d;
  }
  // 予約があれば「未公開」状態にして後で公開する
  if (scheduledAt && scheduledAt.getTime() > Date.now()) {
    published = false;
  }

  // community
  const communityId = input.communityId || null;
  let timelineId = input.timelineId || null;
  let approvalStatus = input.approvalStatus || 'approved';

  // コミュニティ投稿は member の場合 pending に強制 (owner なら approved 可)
  if (communityId) {
    const m = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: meId, communityId } },
    });
    if (!m) throw new Error('そのコミュニティのメンバーではありません');
    // timelineId 未指定 or 別 community の TL を指定 → ホーム TL に自動振り分け
    let validTl: { id: string; communityId: string } | null = null;
    if (timelineId) {
      const t = await prisma.communityTimeline.findUnique({ where: { id: timelineId } });
      if (t && t.communityId === communityId) validTl = t;
    }
    if (!validTl) {
      const home = await prisma.communityTimeline.findFirst({
        where: { communityId, name: 'ホーム' },
      });
      if (home) {
        timelineId = home.id;
      } else {
        // ホーム TL が無い旧 community 用に作る
        const created = await prisma.communityTimeline.create({
          data: { communityId, name: 'ホーム', visibility: 'members_only' },
        });
        timelineId = created.id;
      }
    }
    if (m.role !== 'owner' && published) {
      approvalStatus = 'pending';
      published = false;
    }
  }

  if (published) {
    if (!title.trim()) throw new Error('タイトルは必須です');
    if (type !== 'howto' && type !== 'diary') throw new Error('カテゴリ (Howto / Diary) を選択してください');
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
        scheduledAt,
        visibility,
        visibilityAffiliationIds,
        communityId,
        timelineId,
        approvalStatus,
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
        type: type || 'howto',
        body,
        published,
        publishedAt: published ? new Date() : null,
        scheduledAt,
        visibility,
        visibilityAffiliationIds,
        communityId,
        timelineId,
        approvalStatus,
        topics: { create: topics.map((t) => ({ topicId: t.id })) },
      },
    });
    await prisma.article.update({ where: { id: created.id }, data: { slug: created.id } });
    return getArticleFull(created.id, meId);
  }
}

// 閲覧者(me)の公開範囲に基づき、記事配列をフィルタリング
// visibility: "public" (全体公開) | "friends_only" (相互フォローのみ)
async function filterByVisibility<T extends {
  visibility: string;
  authorId: string;
  communityId: string | null;
}>(items: T[], meId: string | null): Promise<T[]> {
  let myCommunityIds = new Set<string>();
  let mutualFriendIds = new Set<string>();
  if (meId) {
    const [memberships, iFollow, followMe] = await Promise.all([
      prisma.communityMember.findMany({ where: { userId: meId } }),
      prisma.follow.findMany({ where: { userId: meId, targetType: 'user' }, select: { targetId: true } }),
      prisma.follow.findMany({ where: { targetType: 'user', targetId: meId }, select: { userId: true } }),
    ]);
    myCommunityIds = new Set(memberships.map((x) => x.communityId));
    // 相互フォロー = 自分がフォローしている & 相手もフォローしてくれている
    const iFollowSet = new Set(iFollow.map((x) => x.targetId));
    for (const f of followMe) {
      if (iFollowSet.has(f.userId)) mutualFriendIds.add(f.userId);
    }
  }
  return items.filter((it) => {
    if (it.authorId === meId) return true;
    if (it.communityId) {
      if (!meId || !myCommunityIds.has(it.communityId)) return false;
    }
    if (it.visibility === 'public') return true;
    if (it.visibility === 'friends_only') {
      return meId != null && mutualFriendIds.has(it.authorId);
    }
    return true;
  });
}

export { filterByVisibility };

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
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } });
  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    if (article) await unnotify({ userId: article.authorId, actorId: me.id, kind: 'like_article', articleId });
  } else {
    await prisma.like.create({ data: { userId: me.id, articleId } });
    if (article) await notify({ userId: article.authorId, actorId: me.id, kind: 'like_article', articleId });
  }
  const count = await prisma.like.count({ where: { articleId } });
  return c.json({ liked: !existing, count });
});

api.post('/articles/:id/bookmark', requireAuth, async (c) => {
  const me = c.get('user')!;
  const articleId = c.req.param('id');
  const existing = await prisma.bookmark.findUnique({
    where: { userId_articleId: { userId: me.id, articleId } },
  });
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    if (article) await unnotify({ userId: article.authorId, actorId: me.id, kind: 'bookmark_article', articleId });
  } else {
    await prisma.bookmark.create({ data: { userId: me.id, articleId } });
    if (article) await notify({ userId: article.authorId, actorId: me.id, kind: 'bookmark_article', articleId });
  }
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
    if (targetType === 'user') await unnotify({ userId: targetId, actorId: me.id, kind: 'follow_user' });
    return c.json({ following: false });
  } else {
    await prisma.follow.create({ data: { userId: me.id, targetType, targetId } });
    if (targetType === 'user') await notify({ userId: targetId, actorId: me.id, kind: 'follow_user' });
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

// サーバ起動時に env から固定。デフォルト 30 日。
const TRENDING_DAYS = Math.min(
  365,
  Math.max(1, parseInt(process.env.UCHI_TRENDING_DAYS || '30', 10) || 30)
);

api.get('/trending', async (c) => {
  const type = c.req.query('type') === 'diary' ? 'diary' : 'howto';
  const days = TRENDING_DAYS;
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
  // クライアント側はサーバ設定の値だけ参照する (スライダー廃止)
  c.json({ trendingDays: TRENDING_DAYS })
);
