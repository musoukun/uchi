import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomSummary, PublicRoom, User } from '../types';

type UserCandidate = { id: string; name: string; avatarUrl: string | null };

export function ChatRoomsPage() {
  const me = useMe();
  const nav = useNavigate();
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [tab, setTab] = useState<'my' | 'discover'>('my');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadMyRooms = useCallback(async () => {
    try {
      const data = await api.listChatRooms();
      setRooms(data);
    } catch {}
  }, []);

  useEffect(() => { loadMyRooms(); }, [loadMyRooms]);

  useEffect(() => {
    if (tab !== 'discover') return;
    api.listPublicRooms(searchQ || undefined).then(setPublicRooms).catch(() => {});
  }, [tab, searchQ]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const joinPublicRoom = async (roomId: string) => {
    try {
      await api.addChatRoomMember(roomId);
      setToast('ルームに参加しました');
      await loadMyRooms();
      nav(`/chat/${roomId}`);
    } catch (e: any) {
      setToast(e.message || 'エラー');
    }
  };

  return (
    <main className="container">
      <div className="page-header">
        <h1>💬 チャット</h1>
        <button className="btn" onClick={() => setShowCreate(true)}>
          + ルーム作成
        </button>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>
          マイルーム
        </button>
        <button className={`tab${tab === 'discover' ? ' active' : ''}`} onClick={() => setTab('discover')}>
          公開ルームを探す
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {tab === 'my' && (
        <div className="chat-room-list">
          {rooms.length === 0 && (
            <p className="empty">参加しているルームはありません。新しく作成するか、公開ルームに参加しましょう。</p>
          )}
          {rooms.map((room) => (
            <Link to={`/chat/${room.id}`} className="chat-room-item" key={room.id}>
              <div className="chat-room-icon">
                {room.avatarUrl ? (
                  <img src={room.avatarUrl} alt="" />
                ) : (
                  <span className="chat-room-emoji">{room.emoji || '💬'}</span>
                )}
              </div>
              <div className="chat-room-info">
                <div className="chat-room-name">
                  {room.name}
                  {room.visibility === 'private' && <span className="badge-private">🔒</span>}
                </div>
                {room.lastMessage && (
                  <div className="chat-room-preview">
                    <span className="chat-room-preview-author">{room.lastMessage.authorName}:</span>
                    {' '}{room.lastMessage.body}
                  </div>
                )}
              </div>
              {room.unreadCount > 0 && (
                <span className="chat-unread-badge">{room.unreadCount}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {tab === 'discover' && (
        <>
          <input
            className="search"
            placeholder="公開ルームを検索..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <div className="chat-room-list">
            {publicRooms.length === 0 && <p className="empty">公開ルームが見つかりません</p>}
            {publicRooms.map((room) => (
              <div className="chat-room-item" key={room.id}>
                <div className="chat-room-icon">
                  {room.avatarUrl ? (
                    <img src={room.avatarUrl} alt="" />
                  ) : (
                    <span className="chat-room-emoji">{room.emoji || '💬'}</span>
                  )}
                </div>
                <div className="chat-room-info">
                  <div className="chat-room-name">{room.name}</div>
                  {room.description && <div className="chat-room-desc">{room.description}</div>}
                  <div className="chat-room-meta">{room.memberCount}人のメンバー</div>
                </div>
                {room.myRole ? (
                  <Link to={`/chat/${room.id}`} className="btn btn-sm">開く</Link>
                ) : (
                  <button className="btn btn-sm" onClick={() => joinPublicRoom(room.id)}>参加</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <CreateRoomDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            loadMyRooms();
            nav(`/chat/${id}`);
          }}
        />
      )}
    </main>
  );
}

// ---------- ルーム作成ダイアログ ----------

function CreateRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const me = useMe();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [members, setMembers] = useState<UserCandidate[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 検索
  const [searchQ, setSearchQ] = useState('');
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setCandidates([]); setShowDropdown(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(q.trim());
        const excluded = new Set([...(members.map((m) => m.id)), me?.id || '']);
        const filtered = (res.items || res).filter((u: UserCandidate) => !excluded.has(u.id));
        setCandidates(filtered.slice(0, 8));
        setShowDropdown(filtered.length > 0);
      } catch { setCandidates([]); }
    }, 300);
  }, [members, me]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addMember = (u: UserCandidate) => {
    setMembers((prev) => [...prev, u]);
    setSearchQ('');
    setCandidates([]);
    setShowDropdown(false);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('ルーム名を入力してください'); return; }
    setSubmitting(true);
    try {
      const room = await api.createChatRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        emoji,
        visibility,
        memberIds: members.map((m) => m.id),
      });
      onCreated(room.id);
    } catch (e: any) {
      setError(e.message || 'エラー');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>チャットルーム作成</h2>
        {error && <div className="error">{error}</div>}

        <div className="chat-settings-form">
          <div className="form-group">
            <label>ルーム名 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 雑談部屋" maxLength={100} autoFocus />
          </div>
          <div className="form-group">
            <label>説明</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ルームの説明 (任意)" maxLength={500} />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ width: 80 }}>
              <label>絵文字</label>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="emoji-input" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>公開設定</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                <option value="private">🔒 非公開 (招待のみ)</option>
                <option value="public">🌐 公開 (検索可能・自由参加)</option>
              </select>
            </div>
          </div>

          {/* メンバー追加 */}
          <div className="form-group">
            <label>メンバーを追加</label>
            {members.length > 0 && (
              <div className="create-room-members">
                {members.map((m) => (
                  <span key={m.id} className="create-room-member-chip">
                    <Avatar user={m} size={20} />
                    {m.name}
                    <button onClick={() => removeMember(m.id)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="user-search-add" ref={wrapRef}>
              <input
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); doSearch(e.target.value); }}
                onFocus={() => { if (candidates.length > 0) setShowDropdown(true); }}
                placeholder="名前またはメールで検索..."
              />
              {showDropdown && (
                <div className="user-search-dropdown">
                  {candidates.map((u) => (
                    <button key={u.id} className="user-search-candidate" onClick={() => addMember(u)}>
                      <Avatar user={u} size={28} />
                      <span>{u.name}</span>
                      <span className="user-search-add-label">追加</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '作成中...' : '作成'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
