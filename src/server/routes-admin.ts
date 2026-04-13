import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { setCookie } from 'hono/cookie';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { hashPassword } from './password';
import { createSession, SESSION_COOKIE } from './session';

export const adminRoutes = new Hono<{ Variables: { user: User | null } }>();

// ---- 管理者必須 middleware ----
const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user') as User | null;
  if (!user) return c.json({ error: 'not logged in' }, 401);
  if (!user.isAdmin) return c.json({ error: '管理者権限が必要です' }, 403);
  await next();
};

// ---- 管理者がまだ存在しないか? (公開) ----
adminRoutes.get('/exists', async (c) => {
  const count = await prisma.user.count({ where: { isAdmin: true } });
  return c.json({ exists: count > 0 });
});

// ---- 初回管理者作成 (公開、ただし既に存在すれば 409) ----
adminRoutes.post('/init', async (c) => {
  const existing = await prisma.user.count({ where: { isAdmin: true } });
  if (existing > 0) {
    return c.json({ error: '管理者は既に存在します。ログイン画面からログインしてください。' }, 409);
  }
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '管理者').trim().slice(0, 50) || '管理者';
  if (!email || !email.includes('@')) return c.json({ error: 'メールアドレスが不正です' }, 400);
  if (password.length < 8) return c.json({ error: 'パスワードは8文字以上必要です' }, 400);

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) {
    // 既存ユーザを管理者に昇格 (パスワードは変更しない)
    if (dup.passwordHash) {
      const promoted = await prisma.user.update({
        where: { id: dup.id },
        data: { isAdmin: true },
      });
      const session = await createSession(promoted.id);
      setCookie(c, SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        expires: session.expiresAt,
      });
      const { passwordHash: _, ...safe } = promoted;
      return c.json({ ...safe, promoted: true });
    }
    return c.json({ error: 'このメールアドレスは既に登録されています' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({
    data: { email, name, passwordHash, isAdmin: true },
  });
  const session = await createSession(created.id);
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    expires: session.expiresAt,
  });
  const { passwordHash: _, ...safe } = created;
  return c.json(safe);
});

// ---- /me が管理者か? (要ログイン) ----
adminRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user')!;
  return c.json({ isAdmin: !!user.isAdmin });
});

// ---- ユーザ一覧 (管理者) ----
adminRoutes.get('/users', requireAdmin, async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      isRetired: true,
      createdAt: true,
      affiliations: { include: { affiliation: true } },
    },
  });
  return c.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
      isRetired: u.isRetired,
      createdAt: u.createdAt,
      affiliations: u.affiliations.map((a) => ({
        id: a.affiliation.id,
        name: a.affiliation.name,
      })),
    }))
  );
});

// ---- ユーザ退職 (管理者) ----
// 投稿は一切削除せず、isRetired=true にしてセッションを全削除する。
// 全チャットルームで管理者不在になったルームは自動削除。
adminRoutes.post('/users/:id/retire', requireAdmin, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  if (id === me.id) return c.json({ error: '自分自身は退職にできません' }, 400);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'ユーザが見つかりません' }, 404);
  if (target.isRetired) return c.json({ error: '既に退職済みです' }, 400);

  // 退職フラグを立てる + 全セッション無効化
  await prisma.user.update({ where: { id }, data: { isRetired: true } });
  await prisma.session.deleteMany({ where: { userId: id } });

  // チャットルーム: このユーザーが所属するルームの管理者不在チェック
  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId: id },
    select: { roomId: true },
  });

  for (const { roomId } of memberships) {
    await cleanupRoomIfNoActiveOwner(roomId);
  }

  return c.json({ ok: true });
});

// ---- ユーザ退職取消 (管理者) ----
adminRoutes.post('/users/:id/unretire', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'ユーザが見つかりません' }, 404);
  if (!target.isRetired) return c.json({ error: '退職済みではありません' }, 400);
  await prisma.user.update({ where: { id }, data: { isRetired: false } });
  return c.json({ ok: true });
});

// ---- ユーザの所属を上書き設定 (管理者) ----
adminRoutes.put('/users/:id/affiliations', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const { affiliationIds } = await c.req.json<{ affiliationIds: string[] }>();
  const ids = (affiliationIds || []).slice(0, 50);
  await prisma.userAffiliation.deleteMany({ where: { userId: id } });
  if (ids.length > 0) {
    await prisma.userAffiliation.createMany({
      data: ids.map((aid) => ({ userId: id, affiliationId: aid })),
    });
  }
  return c.json({ ok: true });
});

// ---- ユーザ削除 (管理者) ----
adminRoutes.delete('/users/:id', requireAdmin, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  if (id === me.id) return c.json({ error: '自分自身は削除できません' }, 400);
  // 他に管理者がいない & 削除対象が管理者なら拒否
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'ユーザが見つかりません' }, 404);
  if (target.isAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { isAdmin: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      return c.json({ error: '最後の管理者は削除できません' }, 400);
    }
  }
  await prisma.user.delete({ where: { id } });
  return c.json({ ok: true });
});

// ---- 既存の affiliation 一覧 (管理者) ----
// ---- 新規作成 (管理者) ----
adminRoutes.post('/affiliations', requireAdmin, async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) return c.json({ error: 'name は必須です' }, 400);
  const slug =
    trimmed
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_]/g, '')
      .slice(0, 40) || 'team';
  const existing = await prisma.affiliation.findFirst({
    where: { OR: [{ name: trimmed }, { slug }] },
  });
  if (existing) return c.json(existing);
  const created = await prisma.affiliation.create({ data: { name: trimmed, slug } });
  return c.json(created);
});

adminRoutes.delete('/affiliations/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  await prisma.affiliation.delete({ where: { id } });
  return c.json({ ok: true });
});

// ---- ヘルパー: チャットルームの管理者不在チェック → 全員退職なら自動削除 ----
async function cleanupRoomIfNoActiveOwner(roomId: string) {
  // ルームの全メンバーを取得
  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    include: { user: { select: { isRetired: true } } },
  });
  // アクティブ (非退職) なメンバーが1人でもいればスキップ
  const hasActiveMembers = members.some((m) => !m.user.isRetired);
  if (hasActiveMembers) return;

  // 全員退職 → ルーム自動削除 (cascade でメッセージ等も消える)
  await prisma.chatRoom.delete({ where: { id: roomId } }).catch(() => {});
}
