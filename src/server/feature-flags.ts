import type { MiddlewareHandler } from 'hono';
import { prisma } from './db';

export const FEATURE_KEYS = ['chat', 'pulse'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// デフォルトは全機能 OFF。ユーザは管理者ページから明示的に ON にする。
const DEFAULT_ENABLED: Record<FeatureKey, boolean> = {
  chat: false,
  pulse: false,
};

export async function getFeature(key: FeatureKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  if (!row) return DEFAULT_ENABLED[key];
  return row.enabled;
}

export async function getAllFeatures(): Promise<Record<FeatureKey, boolean>> {
  const rows = await prisma.featureFlag.findMany({ where: { key: { in: FEATURE_KEYS as unknown as string[] } } });
  const map = new Map(rows.map((r) => [r.key, r.enabled]));
  const out: Record<FeatureKey, boolean> = { ...DEFAULT_ENABLED };
  for (const k of FEATURE_KEYS) {
    if (map.has(k)) out[k] = map.get(k)!;
  }
  return out;
}

export async function setFeature(key: FeatureKey, enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled },
    create: { key, enabled },
  });
}

/** 機能が無効化されている場合は 404 を返すミドルウェア */
export function requireFeature(key: FeatureKey): MiddlewareHandler {
  return async (c, next) => {
    const on = await getFeature(key);
    if (!on) return c.json({ error: 'この機能は無効化されています' }, 404);
    await next();
  };
}
