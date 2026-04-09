import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleListItem } from '../types';
import { ArticleCard } from '../components/ArticleCard';

export function BookmarksPage() {
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  useEffect(() => {
    api.myBookmarks().then(setItems).catch(() => setItems([]));
  }, []);
  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>🔖 Bookmarks</h2>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          まだブックマークしていません。記事ページの 🔖 ボタンから保存できます
        </div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
