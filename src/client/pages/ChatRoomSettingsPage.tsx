import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomFull } from '../types';

type UserCandidate = { id: string; name: string; avatarUrl: string | null };

export function ChatRoomSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoomFull | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const reload = async () => {
    if (!id) return;
    try {
      const r = await api.getChatRoom(id);
      setRoom(r);
      setName(r.name);
      setDescription(r.description || '');
      setEmoji(r.emoji || '💬');
      setVisibility(r.visibility);
    } catch {
      nav('/chat');
    }
  };

  useEffect(() => { reload(); }, [id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    try {
      await api.updateChatRoom(id!, { name, description, emoji, visibility });
      setToast('保存しました');
      reload();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async () => {
    if (!confirm('このルームを削除しますか？全てのメッセージが失われます。')) return;
    try { await api.deleteChatRoom(id!); nav('/chat'); }
    catch (e: any) { setError(e.message); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('このメンバーを除去しますか？')) return;
    try { await api.removeChatRoomMember(id!, userId); reload(); }
    catch (e: any) { setError(e.message); }
  };

  const handleChangeRole = async (userId: string, role: 'owner' | 'member') => {
    try {
      await api.changeChatMemberRole(id!, userId, role);
      setToast(role === 'owner' ? '管理者に変更しました' : 'メンバーに変更しました');
      reload();
    } catch (e: any) { setError(e.message); }
  };

  if (!room) return <main className="container"><p>読み込み中...</p></main>;

  return (
    <main className="container" style={{ maxWidth: 640 }}>
      <div className="chat-settings-header">
        <Link to={`/chat/${id}`} className="dc-topbar-back">←</Link>
        <h1>#{room.name} の設定</h1>
      </div>

      {error && <div className="error">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      {/* ===== 基本設定 ===== */}
      <div className="card chat-settings-card">
        <h2>基本設定</h2>
        <div className="chat-settings-form">
          <div className="form-group">
            <label>ルーム名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="form-group">
            <label>説明</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="ルームの説明 (任意)" />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ width: 80 }}>
              <label>絵文字</label>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="emoji-input" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>公開設定</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                <option value="private">🔒 非公開 (招待のみ・検索に表示されない)</option>
                <option value="public">🌐 公開 (検索可能・自由参加)</option>
              </select>
            </div>
          </div>
          <button className="btn" onClick={handleSave}>保存</button>
        </div>
      </div>

      {/* ===== メンバー管理 ===== */}
      <div className="card chat-settings-card">
        <h2>メンバー ({room.members.length})</h2>

        {room.members.filter((m) => m.role === 'owner').length > 0 && (
          <div className="chat-settings-section">
            <div className="chat-settings-section-label">
              管理者 — {room.members.filter((m) => m.role === 'owner').length}
            </div>
            {room.members.filter((m) => m.role === 'owner').map((m) => (
              <div key={m.id} className="chat-settings-member">
                <Avatar user={m} size={32} />
                <span className="chat-settings-member-name">{m.name}</span>
                {room.members.filter((x) => x.role === 'owner').length > 1 && (
                  <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'member')}>メンバーにする</button>
                )}
              </div>
            ))}
          </div>
        )}

        {room.members.filter((m) => m.role === 'member').length > 0 && (
          <div className="chat-settings-section">
            <div className="chat-settings-section-label">
              メンバー — {room.members.filter((m) => m.role === 'member').length}
            </div>
            {room.members.filter((m) => m.role === 'member').map((m) => (
              <div key={m.id} className="chat-settings-member">
                <Avatar user={m} size={32} />
                <span className="chat-settings-member-name">{m.name}</span>
                <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'owner')}>管理者にする</button>
                <button className="btn-sm btn-ghost" onClick={() => handleRemoveMember(m.id)}>除去</button>
              </div>
            ))}
          </div>
        )}

        <UserSearchAdd
          existingMemberIds={room.members.map((m) => m.id)}
          onAdd={async (userId) => {
            try {
              await api.addChatRoomMember(id!, userId);
              setToast('メンバーを追加しました');
              reload();
            } catch (e: any) { setError(e.message); }
          }}
        />
      </div>

      {/* ===== 削除 ===== */}
      <div className="card chat-settings-card chat-settings-danger">
        <p>ルームを削除すると全てのメッセージが完全に失われます。この操作は取り消せません。</p>
        <button className="btn btn-danger" onClick={handleDelete}>ルームを削除</button>
      </div>
    </main>
  );
}

// ---------- ユーザー検索付きメンバー追加 ----------

function UserSearchAdd({
  existingMemberIds,
  onAdd,
}: {
  existingMemberIds: string[];
  onAdd: (userId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // デバウンス検索
  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setCandidates([]); setShowDropdown(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(q.trim());
        // 既存メンバーを除外
        const filtered = (res.items || res).filter(
          (u: UserCandidate) => !existingMemberIds.includes(u.id)
        );
        setCandidates(filtered.slice(0, 8));
        setShowDropdown(filtered.length > 0);
      } catch {
        setCandidates([]);
      }
    }, 300);
  }, [existingMemberIds]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = async (user: UserCandidate) => {
    setAdding(user.id);
    await onAdd(user.id);
    setAdding(null);
    setQuery('');
    setCandidates([]);
    setShowDropdown(false);
  };

  return (
    <div className="user-search-add" ref={wrapRef}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => { if (candidates.length > 0) setShowDropdown(true); }}
        placeholder="名前またはメールで検索してメンバー追加..."
      />
      {showDropdown && (
        <div className="user-search-dropdown">
          {candidates.map((u) => (
            <button
              key={u.id}
              className="user-search-candidate"
              onClick={() => handleAdd(u)}
              disabled={adding === u.id}
            >
              <Avatar user={u} size={28} />
              <span>{u.name}</span>
              {adding === u.id ? <span className="muted">追加中...</span> : <span className="user-search-add-label">追加</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
