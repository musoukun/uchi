import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomSummary, PublicRoom, User } from '../types';

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('ルーム名を入力してください'); return; }
    setSubmitting(true);
    try {
      const room = await api.createChatRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        emoji,
        visibility,
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

        <label>ルーム名 *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 雑談部屋"
          maxLength={100}
          autoFocus
        />

        <label>説明</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ルームの説明 (任意)"
          maxLength={500}
        />

        <label>アイコン絵文字</label>
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={8}
          style={{ width: 60, textAlign: 'center', fontSize: '1.5rem' }}
        />

        <label>公開設定</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
          <option value="private">🔒 非公開 (招待のみ)</option>
          <option value="public">🌐 公開 (検索可能・自由参加)</option>
        </select>

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
