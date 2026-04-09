import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Notification } from '../types';
import { Avatar } from './Avatar';

const POLL_MS = 30_000; // 30秒ごとに未読数 poll

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

function describe(n: Notification): { text: string; href: string } {
  const actor = n.actor?.name || '誰か';
  const target = n.article ? `「${n.article.title}」` : n.post ? `「${n.post.excerpt}」` : '';
  const href = n.article
    ? `/articles/${n.article.id}`
    : n.post
    ? n.post.communityId
      ? `/communities/${n.post.communityId}`
      : '/'
    : n.actor
    ? `/users/${n.actor.id}`
    : '/';
  switch (n.kind) {
    case 'like_article':
      return { text: `${actor}さんが${target}にいいねしました`, href };
    case 'like_post':
      return { text: `${actor}さんがあなたの投稿${target}にいいねしました`, href };
    case 'bookmark_article':
      return { text: `${actor}さんが${target}をブックマークしました`, href };
    case 'comment_article':
      return { text: `${actor}さんが${target}にコメントしました`, href };
    case 'comment_post':
      return { text: `${actor}さんがあなたの投稿${target}にコメントしました`, href };
    case 'follow_user':
      return { text: `${actor}さんがあなたをフォローしました`, href };
    default:
      return { text: actor, href };
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'comment'>('all');
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 起動時 + poll で未読数取得
  useEffect(() => {
    let stopped = false;
    const tick = () => {
      api.notificationUnreadCount()
        .then((r) => { if (!stopped) setUnread(r.count); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  // 開いた時に一覧取得 + 既読化
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listNotifications(tab).then((r) => {
      setItems(r);
      setLoading(false);
    });
    // バッジは即 0 に
    api.markAllNotificationsRead().then(() => setUnread(0));
  }, [open, tab]);

  // クリックアウトで閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="notif-bell" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        title="通知"
      >
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-tabs">
            <button
              className={tab === 'all' ? 'active' : ''}
              onClick={() => setTab('all')}
            >
              すべて
            </button>
            <button
              className={tab === 'comment' ? 'active' : ''}
              onClick={() => setTab('comment')}
            >
              コメント
            </button>
          </div>
          {loading ? (
            <div className="notif-loading">読み込み中…</div>
          ) : items.length === 0 ? (
            <div className="notif-empty">通知はまだありません</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const d = describe(n);
                return (
                  <li key={n.id} className="notif-item">
                    <Link to={d.href} onClick={() => setOpen(false)}>
                      <Avatar user={{ name: n.actor?.name || '?', avatarUrl: n.actor?.avatarUrl || null }} />
                      <div className="notif-text">
                        <div className="notif-line">{d.text}</div>
                        <div className="notif-time">{relativeTime(n.createdAt)}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
