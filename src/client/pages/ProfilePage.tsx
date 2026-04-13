import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../useMe';
import type { ArticleListItem, Post, UserProfile } from '../types';
import { Avatar } from '../components/Avatar';
import { ArticleCard } from '../components/ArticleCard';
import { PostCard } from '../components/PostCard';
import { ProfileEditor } from '../components/ProfileEditor';

type Tab = 'articles' | 'posts';

export function ProfilePage() {
  const { id = '' } = useParams();
  const me = useMe();
  const [u, setU] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<Tab>('articles');

  // 自分のプロフィールを編集モード終了時に再フェッチ (最新の name/bio/avatarUrl 反映)
  const reloadProfile = () => {
    api.getUser(id).then(setU);
  };

  useEffect(() => {
    reloadProfile();
    api.listArticles({ authorId: id }).then(setItems);
    api.getUserPosts(id).then(setPosts).catch(() => setPosts([]));
    api.isFollowing('user', id).then((r) => setFollowing(r.following));
  }, [id]);

  // me が更新されたら自分のプロフィールも追随 (アバター変更後の即時反映)
  useEffect(() => {
    if (me && me.id === id) reloadProfile();
  }, [me?.avatarUrl, me?.name, me?.bio]);

  const onFollow = () => {
    api.toggleFollow('user', id).then((r) => {
      setFollowing(r.following);
      setU((prev) =>
        prev && prev.stats
          ? {
              ...prev,
              stats: {
                ...prev.stats,
                followerCount: prev.stats.followerCount + (r.following ? 1 : -1),
              },
            }
          : prev
      );
    });
  };

  if (!u)
    return (
      <div className="container">
        <div className="loading">…</div>
      </div>
    );
  const isMe = me && me.id === u.id;
  const stats = u.stats || { articleCount: 0, postCount: 0, followerCount: 0, followingCount: 0 };

  return (
    <div className="container">
      {/* ========== Hero ========== */}
      <div className="profile-hero">
        {editing && isMe ? (
          <ProfileEditor onDone={() => { setEditing(false); reloadProfile(); }} />
        ) : (
          <div className="profile-hero-main">
            <div className="profile-avatar-wrap">
              <Avatar user={u} size="lg" />
              {isMe && (
                <button
                  className="profile-avatar-edit"
                  onClick={() => setEditing(true)}
                  aria-label="プロフィールを編集"
                  title="プロフィールを編集"
                >
                  ✎
                </button>
              )}
            </div>
            <div className="profile-hero-info">
              <h1 className="profile-name">
                {u.name}
                {u.isRetired && <span className="badge-retired">退職済</span>}
              </h1>
              {u.bio && <p className="profile-bio">{u.bio}</p>}
              {u.affiliations && u.affiliations.length > 0 && (
                <div className="profile-affiliations">
                  {u.affiliations.map((a) => (
                    <span key={a.id} className="affiliation-tag">
                      🏷 {a.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="profile-actions">
                {isMe ? (
                  <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                    ✎ プロフィール編集
                  </button>
                ) : (
                  <button
                    className={'follow-btn' + (following ? ' on' : '')}
                    onClick={onFollow}
                  >
                    {following ? 'Following' : '+ Follow'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* stats */}
        <div className="profile-stats">
          <div className="profile-stat">
            <div className="profile-stat-num">{stats.articleCount}</div>
            <div className="profile-stat-label">記事</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-num">{stats.postCount}</div>
            <div className="profile-stat-label">SNS投稿</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-num">{stats.followerCount}</div>
            <div className="profile-stat-label">フォロワー</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-num">{stats.followingCount}</div>
            <div className="profile-stat-label">フォロー中</div>
          </div>
        </div>
      </div>

      {/* ========== Tabs ========== */}
      <div className="profile-tabs">
        <button
          className={'profile-tab' + (tab === 'articles' ? ' active' : '')}
          onClick={() => setTab('articles')}
        >
          📝 記事 ({stats.articleCount})
        </button>
        <button
          className={'profile-tab' + (tab === 'posts' ? ' active' : '')}
          onClick={() => setTab('posts')}
        >
          💬 SNS投稿 ({stats.postCount})
        </button>
      </div>

      {/* ========== Tab content ========== */}
      {tab === 'articles' &&
        (items.length === 0 ? (
          <div className="empty">まだ記事がありません</div>
        ) : (
          <div className="articles-grid">
            {items.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
        ))}

      {tab === 'posts' &&
        (posts.length === 0 ? (
          <div className="empty">まだSNS投稿がありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                meId={me?.id}
                onChanged={(np) => setPosts((prev) => prev.map((x) => (x.id === np.id ? np : x)))}
                onDeleted={(pid) => setPosts((prev) => prev.filter((x) => x.id !== pid))}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
