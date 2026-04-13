import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomFull } from '../types';

export function ChatRoomSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoomFull | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [addUserId, setAddUserId] = useState('');
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

  const handleAddMember = async () => {
    if (!addUserId.trim()) return;
    try {
      await api.addChatRoomMember(id!, addUserId.trim());
      setAddUserId('');
      setToast('メンバーを追加しました');
      reload();
    } catch (e: any) { setError(e.message); }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link to={`/chat/${id}`} className="dc-topbar-back" style={{ fontSize: '1.2rem' }}>←</Link>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>#{room.name} の設定</h1>
      </div>

      {error && <div className="error">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      {/* ===== 基本設定 ===== */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>基本設定</h2>

        <label>ルーム名</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />

        <label>説明</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="ルームの説明 (任意)" />

        <label>アイコン絵文字</label>
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} style={{ width: 60, textAlign: 'center', fontSize: '1.5rem' }} />

        <label>公開設定</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
          <option value="private">🔒 非公開 (招待のみ・検索に表示されない)</option>
          <option value="public">🌐 公開 (検索可能・自由参加)</option>
        </select>

        <button className="btn" onClick={handleSave} style={{ marginTop: 16 }}>保存</button>
      </div>

      {/* ===== メンバー管理 ===== */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>メンバー ({room.members.length})</h2>

        {/* 管理者 */}
        {room.members.filter((m) => m.role === 'owner').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
              管理者 — {room.members.filter((m) => m.role === 'owner').length}
            </div>
            {room.members.filter((m) => m.role === 'owner').map((m) => (
              <div key={m.id} className="chat-settings-member" style={{ marginBottom: 4 }}>
                <Avatar user={m} size={32} />
                <span style={{ flex: 1 }}>{m.name}</span>
                {room.members.filter((x) => x.role === 'owner').length > 1 && (
                  <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'member')}>メンバーにする</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* メンバー */}
        {room.members.filter((m) => m.role === 'member').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
              メンバー — {room.members.filter((m) => m.role === 'member').length}
            </div>
            {room.members.filter((m) => m.role === 'member').map((m) => (
              <div key={m.id} className="chat-settings-member" style={{ marginBottom: 4 }}>
                <Avatar user={m} size={32} />
                <span style={{ flex: 1 }}>{m.name}</span>
                <button className="btn-sm" onClick={() => handleChangeRole(m.id, 'owner')}>管理者にする</button>
                <button className="btn-sm btn-ghost" onClick={() => handleRemoveMember(m.id)}>除去</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={addUserId} onChange={(e) => setAddUserId(e.target.value)} placeholder="ユーザーIDでメンバー追加" style={{ flex: 1 }} />
          <button className="btn-sm" onClick={handleAddMember}>追加</button>
        </div>
      </div>

      {/* ===== 危険な操作 ===== */}
      <div className="card" style={{ padding: 20, borderColor: '#ef4444' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem', color: '#ef4444' }}>危険な操作</h2>
        <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          ルームを削除すると全てのメッセージが完全に失われます。この操作は取り消せません。
        </p>
        <button className="btn btn-danger" onClick={handleDelete}>ルームを削除</button>
      </div>
    </main>
  );
}
