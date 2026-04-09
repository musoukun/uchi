import React from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import type { ArticleListItem } from '../types';

export function ArticleCard({ a }: { a: ArticleListItem }) {
  const date = (a.publishedAt || a.createdAt || '').slice(0, 10);
  return (
    <Link to={`/articles/${a.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="article-card">
        <div className="article-emoji">{a.emoji || '📝'}</div>
        <div className="article-meta">
          <h3 className="article-title">{a.title || '(無題)'}</h3>
          <div className="article-sub">
            {a.type && (
              <span className={'type-badge ' + a.type}>
                {a.type === 'idea' ? 'IDEA' : 'TECH'}
              </span>
            )}
            <Avatar user={a.author} />
            <span>{a.author ? a.author.name : '匿名'}</span>
            <span>·</span>
            <span>{date}</span>
            {a.topics?.map((t) => (
              <span className="tag" key={t.id}>
                {t.name}
              </span>
            ))}
            <span>·</span>
            <span>♥ {a.likeCount || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
