// 管理者認証ルート (loadUser 不要、独立した認証フロー)
import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { prisma } from './db';
import { verifyPassword } from './password';
import { createAdminSession, invalidateAdminSession, ADMIN_SESSION_COOKIE } from './admin-session';

export const adminAuthRoutes = new Hono();

const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
const cookieBase = {
  httpOnly: true,
  secure,
  sameSite: 'Lax' as const,
  path: '/',
};

// POST /api/admin/auth/login
adminAuthRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const admin = await prisma.admin.findUnique({ where: { email } });
  const dummyHash =
    'scrypt$131072$8$1$00000000000000000000000000000000$' + '0'.repeat(128);
  const ok = await verifyPassword(password, admin?.passwordHash || dummyHash);
  if (!admin || !ok) return c.json({ error: 'メールまたはパスワードが違います' }, 401);

  const session = await createAdminSession(admin.id);
  setCookie(c, ADMIN_SESSION_COOKIE, session.id, {
    ...cookieBase,
    expires: session.expiresAt,
  });

  const { passwordHash: _, ...safe } = admin;
  return c.json(safe);
});

// POST /api/admin/auth/logout
adminAuthRoutes.post('/logout', async (c) => {
  const sid = getCookie(c, ADMIN_SESSION_COOKIE);
  if (sid) await invalidateAdminSession(sid);
  deleteCookie(c, ADMIN_SESSION_COOKIE, { ...cookieBase });
  return c.json({ ok: true });
});
