import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ArticleListItem, Topic, User } from '../types';
import { ArticleCard } from '../components/ArticleCard';

export function FollowingPage() {
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  const [followed, setFollowed] = useState<{ users: User[]; topics: Topic[] }>({
    users: [],
    topics: [],
  });

  useEffect(() => {
    api.myFollowingArticles().then(setItems).catch(() => setItems([]));
    api.myFollowing().then(setFollowed).catch(() => {});
  }, []);

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>👥 Following</h2>
      {(followed.users.length > 0 || followed.topics.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          {followed.users.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 13, color: 'var(--muted)' }}>ユーザー: </b>
              {followed.users.map((u) => (
                <Link key={u.id} to={`/users/${u.id}`} style={{ marginRight: 8 }}>
                  {u.name}
                </Link>
              ))}
            </div>
          )}
          {followed.topics.length > 0 && (
            <div>
              <b style={{ fontSize: 13, color: 'var(--muted)' }}>トピック: </b>
              {followed.topics.map((t) => (
                <Link key={t.id} to={`/topics/${t.slug}`} className="tag" style={{ margin: '0 4px' }}>
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          フォロー中のユーザー/トピックの記事はまだありません。
          <br />
          プロフィールやトピックページから Follow してみよう。
        </div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
