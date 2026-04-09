import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { ArticleListItem, Topic } from '../types';
import { ArticleCard } from '../components/ArticleCard';

export function TopicPage() {
  const { slug = '' } = useParams();
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    api.listArticles({ topicSlug: slug }).then(setItems).catch(() => setItems([]));
    api.listTopics().then((ts) => {
      const t = ts.find((x) => x.slug === slug) || null;
      setTopic(t);
      if (t) api.isFollowing('topic', t.id).then((r) => setFollowing(r.following));
    });
  }, [slug]);

  const onFollow = () => {
    if (!topic) return;
    api.toggleFollow('topic', topic.id).then((r) => setFollowing(r.following));
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}># {topic ? topic.name : slug}</h2>
        {topic && (
          <button className={'follow-btn' + (following ? ' on' : '')} onClick={onFollow}>
            {following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">このトピックの記事はまだありません</div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
