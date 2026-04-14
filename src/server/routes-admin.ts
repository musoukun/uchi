import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import type { Admin } from '@prisma/client';
import { prisma } from './db';
import { loadAdmin, requireAdmin } from './admin-auth';
import { hashPassword } from './password';
import { createAdminSession, ADMIN_SESSION_COOKIE } from './admin-session';
import { FEATURE_KEYS, getAllFeatures, setFeature, type FeatureKey } from './feature-flags';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
const cookieBase = {
  httpOnly: true,
  secure,
  sameSite: 'Lax' as const,
  path: '/',
};

export const adminRoutes = new Hono<{ Variables: { admin: Admin | null } }>();

// 全ルートに loadAdmin を適用
adminRoutes.use('*', loadAdmin);

// ---- 管理者がまだ存在しないか? (公開) ----
adminRoutes.get('/exists', async (c) => {
  const count = await prisma.admin.count();
  return c.json({ exists: count > 0 });
});

// ---- 初回管理者作成 (公開、ただし既に存在すれば 409) ----
adminRoutes.post('/init', async (c) => {
  const existing = await prisma.admin.count();
  if (existing > 0) {
    return c.json({ error: '管理者は既に存在します。管理者ログイン画面からログインしてください。' }, 409);
  }
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '管理者').trim().slice(0, 50) || '管理者';
  if (!email || !email.includes('@')) return c.json({ error: 'メールアドレスが不正です' }, 400);
  if (password.length < 8) return c.json({ error: 'パスワードは8文字以上必要です' }, 400);

  const dup = await prisma.admin.findUnique({ where: { email } });
  if (dup) return c.json({ error: 'このメールアドレスは既に管理者として登録されています' }, 409);

  const passwordHash = await hashPassword(password);
  const created = await prisma.admin.create({
    data: { email, name, passwordHash },
  });
  const session = await createAdminSession(created.id);
  setCookie(c, ADMIN_SESSION_COOKIE, session.id, {
    ...cookieBase,
    expires: session.expiresAt,
  });
  const { passwordHash: _, ...safe } = created;
  return c.json(safe);
});

// ---- /me (管理者情報) ----
adminRoutes.get('/me', requireAdmin, async (c) => {
  const admin = c.get('admin')!;
  const { passwordHash: _, ...safe } = admin;
  return c.json(safe);
});

// ---- 管理者一覧 ----
adminRoutes.get('/admins', requireAdmin, async (c) => {
  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return c.json(admins);
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
adminRoutes.post('/users/:id/retire', requireAdmin, async (c) => {
  const id = c.req.param('id');

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'ユーザが見つかりません' }, 404);
  if (target.isRetired) return c.json({ error: '既に退職済みです' }, 400);

  await prisma.user.update({ where: { id }, data: { isRetired: true } });
  await prisma.session.deleteMany({ where: { userId: id } });

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
  const id = c.req.param('id');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'ユーザが見つかりません' }, 404);
  await prisma.user.delete({ where: { id } });
  return c.json({ ok: true });
});

// ---- 所属マスタ: 新規作成 (管理者) ----
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

// ---- 所属マスタ一覧 (管理者) ----
adminRoutes.get('/affiliations', requireAdmin, async (c) => {
  const items = await prisma.affiliation.findMany({ orderBy: { createdAt: 'asc' } });
  return c.json(items);
});

// ============================================================
// パルスサーベイ管理
// ============================================================

function getISOWeek(d: Date): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `weekly_${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---- サーベイ一覧 (全件) ----
adminRoutes.get('/pulse/surveys', requireAdmin, async (c) => {
  const surveys = await prisma.pulseSurvey.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      _count: { select: { responses: true } },
      affiliation: { select: { id: true, name: true } },
    },
  });
  const totalUsers = await prisma.user.count({ where: { isRetired: false } });
  const affCounts = await prisma.userAffiliation.groupBy({
    by: ['affiliationId'],
    _count: { _all: true },
  });
  const affCountMap = new Map(affCounts.map((r) => [r.affiliationId, r._count._all]));

  return c.json(
    surveys.map((s) => ({
      id: s.id,
      affiliationId: s.affiliationId,
      affiliationName: s.affiliation?.name ?? '全社',
      periodLabel: s.periodLabel,
      status: s.status,
      responseCount: s._count.responses,
      memberCount: s.affiliationId ? (affCountMap.get(s.affiliationId) ?? 0) : totalUsers,
      opensAt: s.opensAt.toISOString(),
      closesAt: s.closesAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

// ---- 全社サーベイ作成 ----
adminRoutes.post('/pulse/surveys/company', requireAdmin, async (c) => {
  const now = new Date();
  const periodLabel = getISOWeek(now);
  const closesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.pulseSurvey.findFirst({
    where: { affiliationId: null, periodLabel },
  });
  if (existing) {
    return c.json({ error: 'この週の全社サーベイは既に存在します', existingId: existing.id }, 409);
  }

  const survey = await prisma.pulseSurvey.create({
    data: { affiliationId: null, periodLabel, closesAt },
  });
  return c.json({ id: survey.id, periodLabel: survey.periodLabel }, 201);
});

// ---- 所属サーベイ作成 ----
adminRoutes.post('/pulse/surveys/affiliations/:affiliationId', requireAdmin, async (c) => {
  const { affiliationId } = c.req.param();
  const aff = await prisma.affiliation.findUnique({ where: { id: affiliationId } });
  if (!aff) return c.json({ error: '所属が見つかりません' }, 404);

  const now = new Date();
  const periodLabel = getISOWeek(now);
  const closesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.pulseSurvey.findUnique({
    where: { affiliationId_periodLabel: { affiliationId, periodLabel } },
  });
  if (existing) {
    return c.json({ error: 'この週のサーベイは既に存在します', existingId: existing.id }, 409);
  }

  const survey = await prisma.pulseSurvey.create({
    data: { affiliationId, periodLabel, closesAt },
  });
  return c.json({ id: survey.id, periodLabel: survey.periodLabel }, 201);
});

// ============================================================
// 機能フラグ
// ============================================================

adminRoutes.get('/features', requireAdmin, async (c) => {
  const features = await getAllFeatures();
  return c.json(features);
});

adminRoutes.put('/features/:key', requireAdmin, async (c) => {
  const key = c.req.param('key') as FeatureKey;
  if (!(FEATURE_KEYS as readonly string[]).includes(key)) {
    return c.json({ error: 'unknown feature key' }, 400);
  }
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  await setFeature(key, !!enabled);
  return c.json({ ok: true });
});

// ---- サーベイクローズ ----
adminRoutes.patch('/pulse/surveys/:id/close', requireAdmin, async (c) => {
  const { id } = c.req.param();
  const survey = await prisma.pulseSurvey.findUnique({ where: { id } });
  if (!survey) return c.json({ error: 'not found' }, 404);
  if (survey.status === 'closed') return c.json({ error: '既にクローズされています' }, 400);
  await prisma.pulseSurvey.update({ where: { id }, data: { status: 'closed' } });
  return c.json({ ok: true });
});

// ============================================================
// 管理者招待
// ============================================================

// ---- 招待作成 ----
adminRoutes.post('/invites', requireAdmin, async (c) => {
  const admin = c.get('admin')!;
  const token = randomBytes(20).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await prisma.adminInvite.create({
    data: { token, createdById: admin.id, expiresAt },
  });
  return c.json({ id: invite.id, token: invite.token, expiresAt: invite.expiresAt });
});

// ---- 招待一覧 ----
adminRoutes.get('/invites', requireAdmin, async (c) => {
  const invites = await prisma.adminInvite.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });
  return c.json(invites.map((i) => ({
    id: i.id,
    token: i.token,
    createdBy: i.createdBy.name,
    acceptedAt: i.acceptedAt,
    expiresAt: i.expiresAt,
    revokedAt: i.revokedAt,
    createdAt: i.createdAt,
  })));
});

// ---- 招待取消 ----
adminRoutes.delete('/invites/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  await prisma.adminInvite.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return c.json({ ok: true });
});

// ---- 招待トークン検証 (公開) ----
adminRoutes.get('/invites/:token/validate', async (c) => {
  const token = c.req.param('token');
  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    return c.json({ valid: false });
  }
  return c.json({ valid: true });
});

// ---- 招待受諾 + 新管理者登録 (公開) ----
adminRoutes.post('/invites/:token/accept', async (c) => {
  const token = c.req.param('token');
  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite) return c.json({ error: '招待が見つかりません' }, 404);
  if (invite.revokedAt) return c.json({ error: 'この招待は取り消されています' }, 400);
  if (invite.acceptedAt) return c.json({ error: 'この招待は既に使用されています' }, 400);
  if (invite.expiresAt.getTime() < Date.now()) return c.json({ error: 'この招待は有効期限切れです' }, 400);

  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '管理者').trim().slice(0, 50) || '管理者';
  if (!email || !email.includes('@')) return c.json({ error: 'メールアドレスが不正です' }, 400);
  if (password.length < 8) return c.json({ error: 'パスワードは8文字以上必要です' }, 400);

  const dup = await prisma.admin.findUnique({ where: { email } });
  if (dup) return c.json({ error: 'このメールアドレスは既に管理者として登録されています' }, 409);

  const passwordHash = await hashPassword(password);
  const admin = await prisma.admin.create({ data: { email, name, passwordHash } });
  await prisma.adminInvite.update({ where: { token }, data: { acceptedAt: new Date() } });

  const session = await createAdminSession(admin.id);
  setCookie(c, ADMIN_SESSION_COOKIE, session.id, {
    ...cookieBase,
    expires: session.expiresAt,
  });

  const { passwordHash: _, ...safe } = admin;
  return c.json(safe);
});

// ---- ヘルパー: チャットルームの管理者不在チェック → 全員退職なら自動削除 ----
async function cleanupRoomIfNoActiveOwner(roomId: string) {
  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    include: { user: { select: { isRetired: true } } },
  });
  const hasActiveMembers = members.some((m) => !m.user.isRetired);
  if (hasActiveMembers) return;
  await prisma.chatRoom.delete({ where: { id: roomId } }).catch(() => {});
}
