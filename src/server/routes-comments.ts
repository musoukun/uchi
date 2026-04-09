import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { notify } from './notify';

export const commentRoutes = new Hono<{ Variables: { user: User | null } }>();

// 仕様:
// - コメントは記事 (Article) または SNS 投稿 (Post) にぶら下がる。articleId か postId のどちらか必須。
// - 返信は parentCommentId を指定。
// - 表示上は親→子の1段だけインデント、孫以降は子と同列でフラットに連なる (UI 側で制御)。
// - サーバでは flat list (parentCommentId 含む) を返し、フロントで木を組む。
// - markdown は body にそのまま入っている (描画はクライアント)。

commentRoutes.get('/', async (c) => {
  const articleId = c.req.query('articleId') || null;
  const postId = c.req.query('postId') || null;
  if (!articleId && !postId) return c.json({ error: 'articleId か postId が必要です' }, 400);

  // private community 投稿のコメントは visibility をチェック
  if (postId) {
    const me = c.get('user');
    const p = await prisma.post.findUnique({ where: { id: postId } });
    if (!p) return c.json({ error: 'not found' }, 404);
    if (p.communityId) {
      const com = await prisma.community.findUnique({ where: { id: p.communityId } });
      if (com?.visibility === 'private') {
        if (!me) return c.json({ error: 'not found' }, 404);
        const m = await prisma.communityMember.findUnique({
          where: { userId_communityId: { userId: me.id, communityId: p.communityId } },
        });
        if (!m) return c.json({ error: 'not found' }, 404);
      }
    }
  }

  const comments = await prisma.comment.findMany({
    where: articleId ? { articleId } : { postId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const me = c.get('user');
  return c.json(
    comments.map((c2) => ({
      id: c2.id,
      body: c2.body,
      authorId: c2.authorId,
      author: c2.author,
      parentCommentId: c2.parentCommentId,
      isMine: me ? c2.authorId === me.id : false,
      createdAt: c2.createdAt,
      updatedAt: c2.updatedAt,
    }))
  );
});

commentRoutes.post('/', requireAuth, async (c) => {
  const me = c.get('user')!;
  const input = await c.req.json<{
    body: string;
    articleId?: string;
    postId?: string;
    parentCommentId?: string;
  }>();
  const body = String(input.body || '').trim();
  if (!body) return c.json({ error: '本文は必須です' }, 400);
  if (body.length > 10000) return c.json({ error: '本文が長すぎます (10000字まで)' }, 400);
  if (!input.articleId && !input.postId)
    return c.json({ error: 'articleId または postId が必要です' }, 400);

  // 親コメントのある場合は parent と同じ article/post に揃える
  let parentCommentId: string | null = null;
  let articleId = input.articleId || null;
  let postId = input.postId || null;
  if (input.parentCommentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentCommentId },
    });
    if (!parent) return c.json({ error: '親コメントが見つかりません' }, 404);
    parentCommentId = parent.id;
    articleId = parent.articleId;
    postId = parent.postId;
  }

  // private community Post の場合のメンバーチェック
  if (postId) {
    const p = await prisma.post.findUnique({ where: { id: postId } });
    if (!p) return c.json({ error: 'not found' }, 404);
    if (p.communityId) {
      const m = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: me.id, communityId: p.communityId } },
      });
      if (!m) return c.json({ error: 'forbidden' }, 403);
    }
  }

  const created = await prisma.comment.create({
    data: {
      authorId: me.id,
      body,
      articleId,
      postId,
      parentCommentId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  // 通知: 記事/投稿の著者に + 親コメントの著者にも (自分自身でない場合)
  if (articleId) {
    const a = await prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } });
    if (a) await notify({ userId: a.authorId, actorId: me.id, kind: 'comment_article', articleId, commentId: created.id });
  }
  if (postId) {
    const p = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (p) await notify({ userId: p.authorId, actorId: me.id, kind: 'comment_post', postId, commentId: created.id });
  }
  if (parentCommentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentCommentId }, select: { authorId: true } });
    if (parent) {
      await notify({
        userId: parent.authorId,
        actorId: me.id,
        kind: articleId ? 'comment_article' : 'comment_post',
        articleId: articleId || null,
        postId: postId || null,
        commentId: created.id,
      });
    }
  }

  return c.json({
    id: created.id,
    body: created.body,
    authorId: created.authorId,
    author: created.author,
    parentCommentId: created.parentCommentId,
    isMine: true,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  });
});

commentRoutes.patch('/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const { body } = await c.req.json<{ body: string }>();
  const trimmed = String(body || '').trim();
  if (!trimmed) return c.json({ error: '本文は必須です' }, 400);
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'not found' }, 404);
  if (existing.authorId !== me.id) return c.json({ error: 'forbidden' }, 403);
  const updated = await prisma.comment.update({
    where: { id },
    data: { body: trimmed },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return c.json({
    id: updated.id,
    body: updated.body,
    authorId: updated.authorId,
    author: updated.author,
    parentCommentId: updated.parentCommentId,
    isMine: true,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

commentRoutes.delete('/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'not found' }, 404);
  // 作者本人 OR 記事/投稿の作者 OR community owner なら削除可
  let canDelete = existing.authorId === me.id;
  if (!canDelete && existing.articleId) {
    const a = await prisma.article.findUnique({ where: { id: existing.articleId } });
    if (a?.authorId === me.id) canDelete = true;
  }
  if (!canDelete && existing.postId) {
    const p = await prisma.post.findUnique({ where: { id: existing.postId } });
    if (p?.authorId === me.id) canDelete = true;
    if (!canDelete && p?.communityId) {
      const m = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: me.id, communityId: p.communityId } },
      });
      if (m?.role === 'owner') canDelete = true;
    }
  }
  if (!canDelete) return c.json({ error: 'forbidden' }, 403);
  await prisma.comment.delete({ where: { id } });
  return c.json({ ok: true });
});
