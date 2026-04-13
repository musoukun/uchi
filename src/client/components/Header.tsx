import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { useMe, setMe } from '../useMe';
import { useTheme } from '../useTheme';
import { api } from '../api';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const me = useMe();
  const nav = useNavigate();
  const [theme, , toggleTheme] = useTheme();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const onLogout = async () => {
    setMenuOpen(false);
    await api.logout().catch(() => {});
    setMe(null);
    nav('/login');
  };

  // クリックアウトで閉じる
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

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
        {me && (
          <NavLink to="/chat" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            💬 Chat
          </NavLink>
        )}
        <input
          className="search"
          placeholder="記事 / コミュニティ / 投稿を検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) nav('/search?q=' + encodeURIComponent(q));
          }}
        />
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
          title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        {me === undefined ? null : me ? (
          <>
            <Link to="/editor" className="btn">
              投稿する
            </Link>
            <NavLink to="/me/summarize" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              ✨要約
            </NavLink>
            <NavLink to="/me/aggregate" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              🪡まとめ記事作成
            </NavLink>
            <NotificationBell />
            {/* アバター → プルダウンメニュー */}
            <div className="account-menu" ref={menuRef}>
              <button
                className="account-menu-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="アカウントメニュー"
              >
                <Avatar user={me} />
              </button>
              {menuOpen && (
                <div className="account-menu-panel">
                  {/* 上部: 自分のアカウント情報 (クリックでプロフィール) */}
                  <Link
                    to={`/users/${me.id}`}
                    className="account-menu-header"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Avatar user={me} />
                    <div className="account-menu-id">
                      <div className="account-menu-name">{me.name}</div>
                      <div className="account-menu-email">{me.email || ''}</div>
                    </div>
                  </Link>
                  <div className="account-menu-divider" />
                  <Link
                    to={`/users/${me.id}`}
                    className="account-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    👤 プロフィール
                  </Link>
                  <Link
                    to="/me/drafts"
                    className="account-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    📝 自分の投稿
                  </Link>
                  <Link
                    to="/me/settings"
                    className="account-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    ⚙ 設定
                  </Link>
                  <div className="account-menu-divider" />
                  <button
                    className="account-menu-item account-menu-logout"
                    onClick={onLogout}
                  >
                    🚪 ログアウト
                  </button>
                </div>
              )}
            </div>
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
