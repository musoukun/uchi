import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { prisma } from './db';
import { hashPassword, verifyPassword } from './password';
import { createSession, invalidateSession, SESSION_COOKIE } from './session';

export const authRoutes = new Hono();

// Cookie 共通オプション (COOKIE_SECURE=false で HTTP 環境でも動作可能)
const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
const cookieBase = {
  httpOnly: true,
  secure,
  sameSite: 'Lax' as const,
  path: '/',
};

function setSessionCookie(c: any, sessionId: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    ...cookieBase,
    expires: expiresAt,
  });
}

function clearSessionCookie(c: any) {
  deleteCookie(c, SESSION_COOKIE, { ...cookieBase });
}

// ---- 入力バリデーション ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(email: string) {
  if (typeof email !== 'string') throw new Error('メールアドレスが不正です');
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw new Error('メールアドレスが不正です');
  return e;
}
function validatePassword(pw: string) {
  if (typeof pw !== 'string' || pw.length < 8) throw new Error('パスワードは8文字以上必要です');
  if (pw.length > 200) throw new Error('パスワードが長すぎます');
  return pw;
}
function validateName(name: string) {
  if (typeof name !== 'string') throw new Error('名前が不正です');
  const n = name.trim();
  if (n.length < 1 || n.length > 50) throw new Error('名前は1〜50文字で入力してください');
  return n;
}

// ---- POST /api/auth/register ----
authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = validateEmail(body.email || '');
  const password = validatePassword(body.password || '');
  const name = validateName(body.name || '');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return c.json({ error: 'このメールアドレスは既に登録されています' }, 409);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  });

  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);

  // パスワードハッシュは絶対に返さない
  const { passwordHash: _, ...safe } = user;
  return c.json(safe);
});

// ---- POST /api/auth/login ----
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = validateEmail(body.email || '');
  const password = String(body.password || '');

  const user = await prisma.user.findUnique({ where: { email } });
  // ユーザー有無に関わらず常に verify を走らせる (タイミング攻撃対策)
  const dummyHash =
    'scrypt$131072$8$1$00000000000000000000000000000000$' + '0'.repeat(128);
  const ok = await verifyPassword(password, user?.passwordHash || dummyHash);
  if (!user || !ok) return c.json({ error: 'メールまたはパスワードが違います' }, 401);

  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);

  const { passwordHash: _, ...safe } = user;
  return c.json(safe);
});

// ---- POST /api/auth/logout ----
authRoutes.post('/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await invalidateSession(sid);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
