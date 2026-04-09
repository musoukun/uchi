import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ArticleFull } from '../types';
import { Avatar } from '../components/Avatar';
import { renderMd } from '../markdown';

export function ArticlePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState<ArticleFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getArticle(id)
      .then((r) => {
        setA(r);
        setLoading(false);
      })
      .catch(() => {
        setA(null);
        setLoading(false);
      });
  }, [id]);

  const onLike = useCallback(() => {
    api.toggleLike(id).then((r) => {
      setA((prev) => (prev ? { ...prev, likedByMe: r.liked, likeCount: r.count } : prev));
    });
  }, [id]);

  const onBookmark = useCallback(() => {
    api.toggleBookmark(id).then((r) => {
      setA((prev) =>
        prev ? { ...prev, bookmarkedByMe: r.bookmarked, bookmarkCount: r.count } : prev
      );
    });
  }, [id]);

  const onFollowAuthor = useCallback(() => {
    if (!a) return;
    api.toggleFollow('user', a.authorId).then((r) => {
      setA((prev) => (prev ? { ...prev, followingAuthor: r.following } : prev));
    });
  }, [a]);

  const onDelete = useCallback(() => {
    if (!confirm('この記事を削除しますか？')) return;
    api.deleteArticle(id).then(() => nav('/'));
  }, [id, nav]);

  if (loading) return <div className="container"><div className="loading">読み込み中…</div></div>;
  if (!a) return <div className="container"><div className="empty">記事が見つかりません</div></div>;

  return (
    <div className="container">
      <article className="article-detail">
        <div className="article-hero">
          <div className="emoji">{a.emoji || '📝'}</div>
          <h1>{a.title}</h1>
          <div style={{ marginBottom: 8 }}>
            <span className={'type-badge ' + a.type}>{a.type === 'idea' ? 'IDEA' : 'TECH'}</span>
          </div>
          <div className="article-author">
            <Avatar user={a.author} />
            <Link to={`/users/${a.authorId}`}>{a.author ? a.author.name : '匿名'}</Link>
            {!a.isMine && (
              <button
                className={'follow-btn' + (a.followingAuthor ? ' on' : '')}
                onClick={onFollowAuthor}
              >
                {a.followingAuthor ? 'Following' : 'Follow'}
              </button>
            )}
            <span>·</span>
            <span>{(a.publishedAt || a.createdAt || '').slice(0, 10)}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {a.topics?.map((t) => (
              <Link key={t.id} to={`/topics/${t.slug}`} className="tag" style={{ margin: '0 4px' }}>
                {t.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(a.body) }} />
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0' }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button className={'like-btn' + (a.likedByMe ? ' liked' : '')} onClick={onLike}>
            ♥ {a.likeCount || 0}
          </button>
          <button className={'bm-btn' + (a.bookmarkedByMe ? ' on' : '')} onClick={onBookmark}>
            🔖 {a.bookmarkCount || 0}
          </button>
          {a.isMine && (
            <Link to={`/editor/${a.id}`} className="btn btn-ghost">
              編集
            </Link>
          )}
          {a.isMine && (
            <button className="btn btn-danger" onClick={onDelete}>
              削除
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
