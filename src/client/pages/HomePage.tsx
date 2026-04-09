import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { ArticleListItem } from '../types';
import { ArticleCard } from '../components/ArticleCard';
import { Sidebar } from '../components/Sidebar';

export function HomePage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [items, setItems] = useState<ArticleListItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    api
      .listArticles({ q, limit: 50 })
      .then(setItems)
      .catch((e) => {
        console.error(e);
        setItems([]);
      });
  }, [q]);

  return (
    <div className="container">
      <div className="grid">
        <div>
          <h2 style={{ marginTop: 0 }}>{q ? `「${q}」の検索結果` : '新着記事'}</h2>
          {items === null ? (
            <div className="loading">読み込み中…</div>
          ) : items.length === 0 ? (
            <div className="empty">記事がまだありません</div>
          ) : (
            items.map((a) => <ArticleCard key={a.id} a={a} />)
          )}
        </div>
        <aside>
          <Sidebar />
        </aside>
      </div>
    </div>
  );
}
