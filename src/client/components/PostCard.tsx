import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import type { Post } from '../types';
import { api } from '../api';
import { renderMd } from '../markdown';
import { CommentSection } from './CommentSection';

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
  meId,
  onChanged,
  onDeleted,
}: {
  post: Post;
  meId?: string | null;
  onChanged?: (p: Post) => void;
  onDeleted?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
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
      {post.title && (
        <h2 className="post-title">{post.title}</h2>
      )}
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
            <OgpUrlCard key={u} url={u} />
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
        <button
          className="post-action"
          onClick={() => setShowComments((v) => !v)}
          title="コメント"
        >
          💬 {post.commentCount}
        </button>
      </div>
      {showComments && (
        <div className="post-comments">
          <CommentSection postId={post.id} meId={meId || null} />
        </div>
      )}
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

// OGP を非同期取得して URL カードを装飾。失敗時は素朴な host だけ表示。
function OgpUrlCard({ url }: { url: string }) {
  const [data, setData] = React.useState<{
    title: string | null;
    description: string | null;
    image: string | null;
    host: string;
    siteName: string | null;
  } | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .fetchOgp(url)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed || (data && !data.title && !data.image)) {
    // 取れなかった: ホストだけのシンプルカード
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="post-url-card simple">
        <div className="post-url-card-host">🔗 {data?.host || safeHost(url)}</div>
        <div className="post-url-card-url">{url}</div>
      </a>
    );
  }
  if (!data) {
    // 取得中
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="post-url-card loading">
        <div className="post-url-card-host">🔗 {safeHost(url)}</div>
        <div className="post-url-card-url" style={{ opacity: 0.5 }}>読み込み中…</div>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="post-url-card rich">
      {data.image && (
        <div
          className="post-url-card-image"
          style={{ backgroundImage: `url(${JSON.stringify(data.image).slice(1, -1)})` }}
        />
      )}
      <div className="post-url-card-text">
        <div className="post-url-card-host">{data.siteName || data.host}</div>
        {data.title && <div className="post-url-card-title">{data.title}</div>}
        {data.description && <div className="post-url-card-desc">{data.description}</div>}
      </div>
    </a>
  );
}
