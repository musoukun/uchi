import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { connectSocket } from '../socket';
import { useChatRoom } from '../hooks/useChatRoom';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomFull } from '../types';

export function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoomFull | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Socket.IO 接続
  useEffect(() => { connectSocket(); }, []);

  const {
    messages,
    typingUsers,
    loading,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    toggleReaction,
    loadMore,
  } = useChatRoom(id!);

  // ルーム情報取得
  useEffect(() => {
    if (!id) return;
    api.getChatRoom(id).then(setRoom).catch(() => nav('/chat'));
  }, [id, nav]);

  // 新着メッセージで自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInputValue('');
    sendTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // タイピング通知 (デバウンス)
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2000);
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop === 0) loadMore();
  };

  const handleLeave = async () => {
    if (!me || !id) return;
    if (!confirm('このルームから退出しますか？')) return;
    try {
      await api.removeChatRoomMember(id, me.id);
      nav('/chat');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  if (!room) return <main className="container"><p>読み込み中...</p></main>;

  const isOwner = room.myRole === 'owner';

  return (
    <main className="chat-page">
      {/* ヘッダー */}
      <div className="chat-header">
        <Link to="/chat" className="chat-back">← 戻る</Link>
        <div className="chat-header-icon">
          {room.emoji || '💬'}
        </div>
        <div className="chat-header-info">
          <h2>{room.name}</h2>
          <span className="chat-header-meta">
            {room.members.length}人のメンバー
            {room.visibility === 'private' && ' 🔒'}
          </span>
        </div>
        <div className="chat-header-actions">
          {isOwner && (
            <button className="btn-sm" onClick={() => setShowSettings(true)}>
              ⚙ 設定
            </button>
          )}
          <button className="btn-sm btn-ghost" onClick={handleLeave}>退出</button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* メッセージ一覧 */}
      <div className="chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
        {hasMore && (
          <button className="btn-sm chat-load-more" onClick={loadMore}>
            過去のメッセージを読み込む
          </button>
        )}
        {loading && <p className="chat-loading">読み込み中...</p>}
        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            message={msg}
            onToggleReaction={toggleReaction}
            onEdit={msg.isMine ? editMessage : undefined}
            onDelete={msg.isMine || isOwner ? deleteMessage : undefined}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* タイピング表示 */}
      {typingUsers.length > 0 && (
        <div className="chat-typing">
          {typingUsers.map((u) => u.userName).join(', ')} が入力中...
        </div>
      )}

      {/* 入力エリア */}
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力... (Enter で送信, Shift+Enter で改行)"
          rows={1}
        />
        <button className="btn chat-send-btn" onClick={handleSend} disabled={!inputValue.trim()}>
          送信
        </button>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <RoomSettingsPanel
          room={room}
          onClose={() => setShowSettings(false)}
          onUpdated={() => api.getChatRoom(id!).then(setRoom)}
          onDeleted={() => nav('/chat')}
        />
      )}
    </main>
  );
}

// ---------- ルーム設定パネル ----------

function RoomSettingsPanel({
  room,
  onClose,
  onUpdated,
  onDeleted,
}: {
  room: ChatRoomFull;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description || '');
  const [emoji, setEmoji] = useState(room.emoji || '💬');
  const [visibility, setVisibility] = useState(room.visibility);
  const [addUserId, setAddUserId] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    try {
      await api.updateChatRoom(room.id, { name, description, emoji, visibility });
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このルームを削除しますか？全てのメッセージが失われます。')) return;
    try {
      await api.deleteChatRoom(room.id);
      onDeleted();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAddMember = async () => {
    if (!addUserId.trim()) return;
    try {
      await api.addChatRoomMember(room.id, addUserId.trim());
      setAddUserId('');
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await api.removeChatRoomMember(room.id, userId);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleChangeRole = async (userId: string, role: 'owner' | 'member') => {
    try {
      await api.changeChatMemberRole(room.id, userId, role);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>ルーム設定</h2>
        {error && <div className="error">{error}</div>}

        <label>ルーム名</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />

        <label>説明</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />

        <label>アイコン絵文字</label>
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} style={{ width: 60 }} />

        <label>公開設定</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
          <option value="private">🔒 非公開</option>
          <option value="public">🌐 公開</option>
        </select>

        <button className="btn" onClick={handleSave} style={{ marginTop: 12 }}>保存</button>

        <h3 style={{ marginTop: 24 }}>メンバー ({room.members.length})</h3>
        <div className="chat-settings-members">
          {room.members.map((m) => (
            <div key={m.id} className="chat-settings-member">
              <Avatar user={m} size={28} />
              <span>{m.name}</span>
              <span className="muted">({m.role === 'owner' ? '管理者' : 'メンバー'})</span>
              {m.role === 'member' && (
                <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'owner')}>管理者にする</button>
              )}
              {m.role === 'owner' && room.members.filter((x) => x.role === 'owner').length > 1 && (
                <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'member')}>メンバーにする</button>
              )}
              {m.role !== 'owner' && (
                <button className="btn-sm btn-ghost" onClick={() => handleRemoveMember(m.id)}>除去</button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            placeholder="ユーザーIDでメンバー追加"
            style={{ flex: 1 }}
          />
          <button className="btn-sm" onClick={handleAddMember}>追加</button>
        </div>

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button className="btn btn-danger" onClick={handleDelete}>ルームを削除</button>
        </div>

        <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 12 }}>閉じる</button>
      </div>
    </div>
  );
}
