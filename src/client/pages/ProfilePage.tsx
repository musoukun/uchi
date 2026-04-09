import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useMe, setMe as setGlobalMe } from '../useMe';
import type { ArticleListItem, User } from '../types';
import { Avatar } from '../components/Avatar';
import { ArticleCard } from '../components/ArticleCard';

export function ProfilePage() {
  const { id = '' } = useParams();
  const me = useMe();
  const [u, setU] = useState<User | null>(null);
  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    api.getUser(id).then((p) => {
      setU(p);
      setName(p?.name || '');
      setBio(p?.bio || '');
    });
    api.listArticles({ authorId: id }).then(setItems);
    api.isFollowing('user', id).then((r) => setFollowing(r.following));
  }, [id]);

  const save = () => {
    api.updateMe({ name, bio }).then((p) => {
      setU(p);
      setGlobalMe(p);
      setEditing(false);
    });
  };

  const onFollow = () => {
    api.toggleFollow('user', id).then((r) => setFollowing(r.following));
  };

  if (!u) return <div className="container"><div className="loading">…</div></div>;
  const isMe = me && me.id === u.id;

  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center' }}>
        <Avatar user={u} size="lg" />
        {editing ? (
          <div style={{ marginTop: 16 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                fontSize: 20,
                textAlign: 'center',
                border: '1px solid var(--border)',
                padding: '6px 12px',
                borderRadius: 6,
              }}
            />
            <br />
            <br />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="自己紹介"
              style={{
                width: '80%',
                height: 80,
                border: '1px solid var(--border)',
                padding: 8,
                borderRadius: 6,
              }}
            />
            <br />
            <br />
            <button className="btn" onClick={save}>
              保存
            </button>{' '}
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              キャンセル
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: '12px 0 4px' }}>{u.name}</h2>
            <p style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
              {u.bio || '(自己紹介なし)'}
            </p>
            {isMe ? (
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                プロフィール編集
              </button>
            ) : (
              <button
                className={'follow-btn' + (following ? ' on' : '')}
                style={{ fontSize: 14, padding: '6px 18px' }}
                onClick={onFollow}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </>
        )}
      </div>
      <h3 style={{ marginTop: 32 }}>投稿</h3>
      {items.length === 0 ? (
        <div className="empty">まだ投稿がありません</div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
