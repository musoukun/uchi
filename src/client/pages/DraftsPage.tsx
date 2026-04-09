import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ArticleListItem } from '../types';

export function DraftsPage() {
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  useEffect(() => {
    api.myDrafts().then(setItems).catch(() => setItems([]));
  }, []);
  return (
    <div className="container">
      <h2>自分の投稿</h2>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">まだありません</div>
      ) : (
        items.map((a) => (
          <div className="article-card" key={a.id}>
            <div className="article-emoji">{a.emoji || '📝'}</div>
            <div className="article-meta">
              <h3 className="article-title">{a.title || '(無題)'}</h3>
              <div className="article-sub">
                <span>{a.published ? '✅ 公開中' : '📝 下書き'}</span>
                <span>·</span>
                <span>{(a.updatedAt || '').slice(0, 10)}</span>
              </div>
            </div>
            <div>
              <Link to={`/editor/${a.id}`} className="btn btn-ghost">
                編集
              </Link>{' '}
              {a.published && (
                <Link to={`/articles/${a.id}`} className="btn">
                  表示
                </Link>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
