import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { CommunitySummary } from '../types';
import { Avatar } from '../components/Avatar';

export function CommunitiesPage() {
  const [items, setItems] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<'public'>('public');
  const [creating, setCreating] = useState(false);

  const reload = () => api.listCommunities().then((r) => { setItems(r); setLoading(false); });
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.createCommunity({ name: name.trim(), description: desc.trim() || undefined, visibility });
      setName('');
      setDesc('');
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="container"><div className="loading">読み込み中…</div></div>;

  const mine = items.filter((c) => c.isMember);
  const others = items.filter((c) => !c.isMember);

  const renderCard = (c: CommunitySummary) => (
    <Link to={`/communities/${c.id}`} key={c.id} className="article-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Avatar user={{ name: c.name, avatarUrl: c.avatarUrl, avatarColor: c.avatarColor }} size="lg" />
      <div className="article-meta">
        <div className="article-title">{c.name}</div>
        <div className="article-sub">
          <span>{c.memberCount} メンバー</span>
          {c.ownerCount === 0 && (
            <span className="badge badge-no-owner" title="代表者が不在です。活動停止中の可能性があります">
              👻 代表者なし
            </span>
          )}
          {c.isMember && <span className={`badge badge-${c.visibility}`}>参加中</span>}
        </div>
        {c.description && <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 15 }}>{c.description}</div>}
      </div>
    </Link>
  );

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>コミュニティ</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>新しいコミュニティを作る</h3>
        <input
          type="text"
          placeholder="コミュニティ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }}
        />
        <textarea
          placeholder="説明 (任意)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', minHeight: 60, marginBottom: 8 }}
        />
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>🌐 全体に公開されます (所属による制限は作成後に設定できます)</span>
        </div>
        <button className="btn" disabled={creating} onClick={create}>
          {creating ? '作成中…' : '作成'}
        </button>
      </div>

      <h3 style={{ marginTop: 24 }}>あなたが参加中 ({mine.length})</h3>
      {mine.length === 0 ? (
        <div className="empty">まだ参加しているコミュニティがありません</div>
      ) : (
        mine.map(renderCard)
      )}

      <h3 style={{ marginTop: 32 }}>公開コミュニティ ({others.length})</h3>
      {others.length === 0 ? (
        <div className="empty">公開コミュニティはまだありません</div>
      ) : (
        others.map(renderCard)
      )}
    </div>
  );
}
