// 管理者専用セッション管理 — session.ts と同構造、別テーブル・別 Cookie
import { randomBytes } from 'node:crypto';
import { prisma } from './db';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 日
const SESSION_REFRESH_MS = 15 * 24 * 60 * 60 * 1000;  // 残り <15日 で延長
export const ADMIN_SESSION_COOKIE = 'uchi_admin_session';

function generateSessionId(): string {
  return randomBytes(20).toString('base64url');
}

export async function createAdminSession(adminId: string) {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await prisma.adminSession.create({ data: { id, adminId, expiresAt } });
  return { id, expiresAt };
}

export async function validateAdminSession(sessionId: string) {
  const session = await prisma.adminSession.findUnique({
    where: { id: sessionId },
    include: { admin: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.adminSession.delete({ where: { id: sessionId } });
    return null;
  }

  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < SESSION_REFRESH_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiresAt },
    });
    session.expiresAt = newExpiresAt;
  }

  return { session, admin: session.admin };
}

export async function invalidateAdminSession(sessionId: string) {
  await prisma.adminSession.delete({ where: { id: sessionId } }).catch(() => {});
}
