import { useEffect, useState } from 'react';
import { api } from './api';
import type { User } from './types';

// 簡易グローバル: 全コンポーネントが同じ me を共有
// undefined = 未取得 (loading), null = 未ログイン, User = ログイン中
let cachedMe: User | null | undefined = undefined;
let listeners: ((u: User | null | undefined) => void)[] = [];
let inflight: Promise<User | null> | null = null;

export function setMe(u: User | null) {
  cachedMe = u;
  listeners.forEach((l) => l(u));
}

export async function refreshMe() {
  if (inflight) return inflight;
  inflight = api
    .getMe()
    .then((u) => {
      setMe(u);
      return u;
    })
    .catch(() => {
      setMe(null);
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useMe(): User | null | undefined {
  const [me, setLocal] = useState<User | null | undefined>(cachedMe);
  useEffect(() => {
    listeners.push(setLocal);
    if (cachedMe === undefined) refreshMe();
    return () => {
      listeners = listeners.filter((l) => l !== setLocal);
    };
  }, []);
  return me;
}
