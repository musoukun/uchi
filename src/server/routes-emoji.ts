// カスタム絵文字 CRUD API

import { Hono } from 'hono';
import { prisma } from './db';
import { requireAuth } from './auth';
import type { User } from '@prisma/client';

export const emojiRoutes = new Hono<{ Variables: { user: User | null } }>();

// ---------- カスタム絵文字一覧 ----------

emojiRoutes.get('/custom', async (c) => {
  const emojis = await prisma.customEmoji.findMany({
    orderBy: { createdAt: 'asc' },
  });
  return c.json(emojis);
});

// ---------- カスタム絵文字アップロード ----------
// name + fileUrl (先に /api/files でアップロードして URL を取得する前提)

emojiRoutes.post('/custom', requireAuth, async (c) => {
  const me = c.get('user')!;
  const input = await c.req.json<{ name: string; fileUrl: string; aliases?: string }>();

  let name = String(input.name || '').trim().toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '')
    .slice(0, 32);
  if (!name) throw new Error('絵文字名は必須です (英数字・_・- のみ)');

  const fileUrl = String(input.fileUrl || '').trim();
  if (!fileUrl) throw new Error('画像URLは必須です');

  // 重複チェック
  const existing = await prisma.customEmoji.findUnique({ where: { name } });
  if (existing) throw new Error(`":${name}:" は既に登録されています`);

  // aliases のバリデーション
  const aliases = (input.aliases || '')
    .split(';')
    .map((a) => a.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, ''))
    .filter(Boolean)
    .slice(0, 5)
    .join(';');

  const emoji = await prisma.customEmoji.create({
    data: { name, fileUrl, aliases, createdById: me.id },
  });

  return c.json(emoji, 201);
});

// ---------- カスタム絵文字削除 (作成者 or admin) ----------

emojiRoutes.delete('/custom/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');

  const emoji = await prisma.customEmoji.findUnique({ where: { id } });
  if (!emoji) throw new Error('not found');
  if (emoji.createdById !== me.id && !me.isAdmin) throw new Error('forbidden');

  await prisma.customEmoji.delete({ where: { id } });
  return c.json({ ok: true });
});
