import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { useMe, setMe } from '../useMe';
import { api } from '../api';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const me = useMe();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const onLogout = async () => {
    await api.logout().catch(() => {});
    setMe(null);
    nav('/login');
  };

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          🏠 Uchi
        </Link>
        <NavLink to="/trending" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          🔥 Trending
        </NavLink>
        {me && (
          <NavLink
            to="/following"
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            👥 Following
          </NavLink>
        )}
        {me && (
          <NavLink
            to="/bookmarks"
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            🔖 Bookmarks
          </NavLink>
        )}
        <NavLink to="/communities" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          🌐 Communities
        </NavLink>
        <input
          className="search"
          placeholder="記事を検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') nav('/?q=' + encodeURIComponent(q));
          }}
        />
        {me === undefined ? null : me ? (
          <>
            <Link to="/editor" className="btn">
              投稿する
            </Link>
            <NavLink to="/me/summarize" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              ✨要約
            </NavLink>
            <NavLink to="/me/aggregate" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              🪡記事まとめ作成
            </NavLink>
            <NavLink to="/me/settings" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              ⚙設定
            </NavLink>
            <NotificationBell />
            <Link to={`/users/${me.id}`}>
              <Avatar user={me} />
            </Link>
            <button className="btn btn-ghost" onClick={onLogout} style={{ padding: '6px 12px' }}>
              ログアウト
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">
              ログイン
            </Link>
            <Link to="/register" className="btn">
              新規登録
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
