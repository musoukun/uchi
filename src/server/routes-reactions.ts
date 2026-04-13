// Post リアクション API

import { Hono } from 'hono';
import { prisma } from './db';
import { requireAuth } from './auth';
import type { User } from '@prisma/client';

export const reactionRoutes = new Hono<{ Variables: { user: User | null } }>();

// ---------- Post リアクショントグル ----------

reactionRoutes.post('/posts/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const postId = c.req.param('id');
  const { emoji } = await c.req.json<{ emoji: string }>();
  if (!emoji) throw new Error('emoji は必須です');

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('not found');

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId_emoji: { postId, userId: me.id, emoji } },
  });

  if (existing) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.postReaction.create({ data: { postId, userId: me.id, emoji } });
  }

  // グループ化して返す
  const reactions = await getPostReactions(postId, me.id);
  return c.json({ toggled: !existing, reactions });
});

// ---------- Post リアクション一覧 ----------

reactionRoutes.get('/posts/:id', async (c) => {
  const me = c.get('user');
  const postId = c.req.param('id');
  const reactions = await getPostReactions(postId, me?.id ?? '');
  return c.json(reactions);
});

// ---------- ヘルパー ----------

async function getPostReactions(postId: string, meId: string) {
  const reactions = await prisma.postReaction.findMany({
    where: { postId },
    include: { user: { select: { id: true, name: true } } },
  });

  const groups = new Map<string, { emoji: string; count: number; userIds: string[]; userNames: string[]; reacted: boolean }>();
  for (const r of reactions) {
    let g = groups.get(r.emoji);
    if (!g) {
      g = { emoji: r.emoji, count: 0, userIds: [], userNames: [], reacted: false };
      groups.set(r.emoji, g);
    }
    g.count++;
    g.userIds.push(r.user.id);
    g.userNames.push(r.user.name);
    if (r.userId === meId) g.reacted = true;
  }
  return Array.from(groups.values());
}
