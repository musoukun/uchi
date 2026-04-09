import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import type { Post } from '../types';
import { api } from '../api';
import { renderMd } from '../markdown';

const FOLD_LENGTH = 600;
const URL_RE = /(https?:\/\/[^\s<]+)/g;

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

// 本文から URL だけ抽出してカード一覧化 (OGP は Phase 4 で取得。今は素朴な UrlCard)
function extractUrls(body: string): string[] {
  const urls = body.match(URL_RE) || [];
  return Array.from(new Set(urls)).slice(0, 3);
}

export function PostCard({
  post,
  onChanged,
  onDeleted,
}: {
  post: Post;
  onChanged?: (p: Post) => void;
  onDeleted?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = post.body.length > FOLD_LENGTH;
  const shown = !isLong || expanded ? post.body : post.body.slice(0, FOLD_LENGTH) + '…';
  const urls = extractUrls(post.body);
  const html = renderMd(shown);

  const onLike = async () => {
    const r = await api.togglePostLike(post.id);
    onChanged?.({ ...post, likedByMe: r.liked, likeCount: r.count });
  };

  const onDelete = async () => {
    if (!confirm('この投稿を削除しますか？')) return;
    await api.deletePost(post.id);
    onDeleted?.(post.id);
  };

  return (
    <article className="post-card">
      <div className="post-head">
        <Link to={`/users/${post.author.id}`} className="post-avatar-link">
          <Avatar user={{ name: post.author.name, avatarUrl: post.author.avatarUrl }} />
        </Link>
        <div className="post-meta">
          <Link to={`/users/${post.author.id}`} className="post-author">
            {post.author.name}
          </Link>
          <span className="post-time">{relativeTime(post.createdAt)}</span>
        </div>
        {post.isMine && (
          <button className="post-delete" onClick={onDelete} title="削除">
            🗑
          </button>
        )}
      </div>
      <div className="post-body md" dangerouslySetInnerHTML={{ __html: html }} />
      {isLong && !expanded && (
        <button className="post-fold" onClick={() => setExpanded(true)}>
          続きを読む ({post.body.length} 文字)
        </button>
      )}
      {isLong && expanded && (
        <button className="post-fold" onClick={() => setExpanded(false)}>
          折りたたむ
        </button>
      )}
      {urls.length > 0 && (
        <div className="post-url-cards">
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="post-url-card">
              <div className="post-url-card-host">🔗 {safeHost(u)}</div>
              <div className="post-url-card-url">{u}</div>
            </a>
          ))}
        </div>
      )}
      <div className="post-actions">
        <button
          className={'post-action ' + (post.likedByMe ? 'liked' : '')}
          onClick={onLike}
          title="いいね"
        >
          {post.likedByMe ? '❤' : '🤍'} {post.likeCount}
        </button>
        <button className="post-action" title="コメント (Phase2)" disabled>
          💬 {post.commentCount}
        </button>
      </div>
    </article>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
