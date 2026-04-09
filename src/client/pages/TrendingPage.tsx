import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleListItem } from '../types';
import { ArticleCard } from '../components/ArticleCard';

export function TrendingPage() {
  const [type, setType] = useState<'tech' | 'idea'>('tech');
  const [items, setItems] = useState<ArticleListItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    api
      .trending(type)
      .then((r) => setItems(r.items || []))
      .catch(() => setItems([]));
  }, [type]);

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>🔥 Trending</h2>
      <div className="tabs">
        <button className={type === 'tech' ? 'active' : ''} onClick={() => setType('tech')}>
          Tech
        </button>
        <button className={type === 'idea' ? 'active' : ''} onClick={() => setType('idea')}>
          Idea
        </button>
      </div>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">該当する記事はまだありません</div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
