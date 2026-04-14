import { useEffect, useState } from 'react';

export type Features = { chat: boolean; pulse: boolean };

const DEFAULT: Features = { chat: false, pulse: false };

let cache: Features | null = null;
let inflight: Promise<Features> | null = null;
let listeners: ((f: Features) => void)[] = [];

export async function fetchFeatures(): Promise<Features> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/config/features', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : DEFAULT))
    .then((f: Features) => {
      cache = { chat: !!f.chat, pulse: !!f.pulse };
      listeners.forEach((l) => l(cache!));
      return cache!;
    })
    .catch(() => DEFAULT)
    .finally(() => { inflight = null; });
  return inflight;
}

export function invalidateFeatures() {
  cache = null;
}

export function useFeatures(): Features {
  const [f, setF] = useState<Features>(cache ?? DEFAULT);
  useEffect(() => {
    listeners.push(setF);
    if (!cache) fetchFeatures();
    return () => { listeners = listeners.filter((l) => l !== setF); };
  }, []);
  return f;
}
