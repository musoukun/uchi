// Copenhagen Book (https://thecopenhagenbook.com) 準拠のセッション管理。
// - ID は 160bit ランダム (crypto.randomBytes(20))
// - 30 日有効、リクエストごとに半分以上経過していたら sliding extend
// - DB にプレーン保存 (SQLite なので攻撃者が DB に到達した時点でアウト)
import { randomBytes } from 'node:crypto';
import { prisma } from './db';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 日
const SESSION_REFRESH_MS = 15 * 24 * 60 * 60 * 1000;  // 残り <15日 で延長
export const SESSION_COOKIE = 'benn_session';

export function generateSessionId(): string {
  return randomBytes(20).toString('base64url');
}

export async function createSession(userId: string) {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return { id, expiresAt };
}

export async function validateSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;

  // 期限切れ → 削除して null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: sessionId } });
    return null;
  }

  // sliding: 残り <15日 なら延長
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < SESSION_REFRESH_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiresAt },
    });
    session.expiresAt = newExpiresAt;
  }

  return { session, user: session.user };
}

export async function invalidateSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

export async function invalidateAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
