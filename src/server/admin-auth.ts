// 管理者セッション Cookie を読み取って c.var.admin に注入するミドルウェア
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { ADMIN_SESSION_COOKIE, validateAdminSession } from './admin-session';
import type { Admin } from '@prisma/client';

declare module 'hono' {
  interface ContextVariableMap {
    admin: Admin | null;
  }
}

export const loadAdmin: MiddlewareHandler = async (c, next) => {
  const sid = getCookie(c, ADMIN_SESSION_COOKIE);
  if (sid) {
    const result = await validateAdminSession(sid);
    c.set('admin', result?.admin ?? null);
  } else {
    c.set('admin', null);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const admin = c.get('admin');
  if (!admin) return c.json({ error: '管理者ログインが必要です' }, 401);
  await next();
};
