import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../useMe';

// 未ログインなら /login にリダイレクトするラッパー
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me === undefined) return <div className="container"><div className="loading">…</div></div>;
  if (me === null) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
