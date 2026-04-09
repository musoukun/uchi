// セッション Cookie を読み取って `c.var.user` に注入する middleware。
// 認証必須エンドポイントでは requireAuth を併用する。
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE, validateSession } from './session';
import type { User } from '@prisma/client';

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
  }
}

// 任意 — ユーザーがいれば取得、いなくてもエラーにしない (公開 GET 用)
export const loadUser: MiddlewareHandler = async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    const result = await validateSession(sid);
    c.set('user', result?.user ?? null);
  } else {
    c.set('user', null);
  }
  await next();
};

// 必須 — 未ログインなら 401
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'not logged in' }, 401);
  await next();
};
