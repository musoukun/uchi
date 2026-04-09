import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Topic } from '../types';
import { useMe } from '../useMe';

export function Sidebar() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const me = useMe();

  useEffect(() => {
    api.listTopics().then(setTopics).catch(console.error);
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>トピック</h3>
      {topics.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>まだトピックがありません</p>
      ) : (
        <div>
          {topics.map((t) => (
            <Link key={t.id} to={`/topics/${t.slug}`} className="tag" style={{ margin: 4 }}>
              {t.name}
            </Link>
          ))}
        </div>
      )}
      {me && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          <Link to="/me/drafts" style={{ display: 'block', fontSize: 14 }}>
            📝 自分の投稿
          </Link>
        </>
      )}
    </div>
  );
}
