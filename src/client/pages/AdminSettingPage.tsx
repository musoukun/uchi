import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Affiliation } from '../types';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';

// /admin-setting — 管理者専用ページ
// - 初回: 管理者がまだ存在しなければ「管理者を作成」フォーム
// - 既存: 管理者ログイン状態ならダッシュボード (ユーザ管理 / コミュニティ管理 / 所属マスタ)
export function AdminSettingPage() {
  const me = useMe();
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    api.adminExists().then((r) => setAdminExists(r.exists)).catch(() => setAdminExists(false));
  }, []);

  if (adminExists === null) return <div className="container"><div className="loading">読み込み中…</div></div>;

  // 管理者がまだいない → 初回作成フォーム
  if (!adminExists) {
    return <AdminInitForm onCreated={() => setAdminExists(true)} />;
  }

  // 管理者は存在するが、自分は未ログイン or 管理者ではない
  if (!me) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h2>管理者ページ</h2>
          <p style={{ color: 'var(--muted)' }}>
            管理者は既に作成済みです。ログイン画面からログインしてください。
          </p>
          <a href="/login" className="btn">ログイン画面へ</a>
        </div>
      </div>
    );
  }
  if (!(me as any).isAdmin) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h2>管理者ページ</h2>
          <p style={{ color: 'var(--muted)' }}>
            このアカウントは管理者ではありません。
          </p>
        </div>
      </div>
    );
  }
  return <AdminDashboard />;
}

// ---------- 初回管理者作成 ----------

function AdminInitForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('管理者');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.adminInit({ email, password, name });
      onCreated();
      window.location.href = '/admin-setting';
    } catch (e) {
      setErr(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0 }}>管理者アカウントを作成</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          このアプリにはまだ管理者がいません。最初の管理者アカウントを作成してください。
          ここで作ったアカウントは管理者権限を持ち、所属マスタ・ユーザ削除などの管理ができるようになります。
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="profile-editor-label">表示名</label>
          <input
            type="text"
            className="profile-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label className="profile-editor-label">メールアドレス</label>
          <input
            type="email"
            className="profile-editor-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="profile-editor-label">パスワード (8 文字以上)</label>
          <input
            type="password"
            className="profile-editor-input"
            value={password}
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <div style={{ color: '#dc2626', fontSize: 14 }}>{err}</div>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '作成中…' : '管理者を作成'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- ダッシュボード ----------

type Tab = 'users' | 'affiliations';

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>管理者ページ</h2>
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>ユーザ管理</button>
        <button className={tab === 'affiliations' ? 'active' : ''} onClick={() => setTab('affiliations')}>所属マスタ</button>
      </div>
      {tab === 'users' && <AdminUsersSection />}
      {tab === 'affiliations' && <AdminAffiliationsSection />}
    </div>
  );
}

// ---------- ユーザ管理 ----------

function AdminUsersSection() {
  const [users, setUsers] = useState<
    Array<{
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      isAdmin: boolean;
      createdAt: string;
      affiliations: Array<{ id: string; name: string }>;
    }>
  >([]);
  const [allAff, setAllAff] = useState<Affiliation[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftAff, setDraftAff] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const reload = async () => {
    const [u, a] = await Promise.all([api.adminListUsers(), api.listAffiliations()]);
    setUsers(u);
    setAllAff(a);
  };
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const startEdit = (uid: string) => {
    const u = users.find((x) => x.id === uid);
    if (!u) return;
    setEditingUserId(uid);
    setDraftAff(new Set(u.affiliations.map((a) => a.id)));
  };
  const toggleDraft = (id: string) => {
    const s = new Set(draftAff);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setDraftAff(s);
  };
  const saveDraft = async () => {
    if (!editingUserId) return;
    setBusy(true);
    try {
      await api.adminSetUserAffiliations(editingUserId, Array.from(draftAff));
      setMsg('所属を更新しました');
      setEditingUserId(null);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (uid: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか?\nこの操作は取り消せません。`)) return;
    setBusy(true);
    try {
      await api.adminDeleteUser(uid);
      setMsg('ユーザを削除しました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const pageUsers = users.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="card">
      {msg && <div className="toast" role="status">{msg}</div>}
      <h3 style={{ marginTop: 0 }}>ユーザ管理 ({users.length} 名)</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        ユーザの所属を直接編集したり、アカウントを削除したりできます。
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {pageUsers.map((u) => (
          <li
            key={u.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
              alignItems: 'flex-start',
            }}
          >
            <Avatar user={u} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {u.name}
                {u.isAdmin && <span className="badge badge-owner" style={{ marginLeft: 8 }}>管理者</span>}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{u.email}</div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {u.affiliations.length === 0 ? (
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>(所属なし)</span>
                ) : (
                  u.affiliations.map((a) => (
                    <span key={a.id} className="tag">{a.name}</span>
                  ))
                )}
              </div>
              {editingUserId === u.id && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--accent-soft-10)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    所属を選択 (チェックで付与/解除)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {allAff.map((a) => (
                      <label key={a.id} style={{ fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={draftAff.has(a.id)}
                          onChange={() => toggleDraft(a.id)}
                        />{' '}
                        {a.name}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={busy} onClick={saveDraft}>
                      {busy ? '保存中…' : '保存'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setEditingUserId(null)}>
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {editingUserId !== u.id && (
                <button className="btn btn-ghost" onClick={() => startEdit(u.id)}>
                  所属編集
                </button>
              )}
              <button className="btn btn-danger" disabled={busy} onClick={() => deleteUser(u.id, u.name)}>
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 16,
          }}
        >
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 前へ</button>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>
            {page} / {totalPages} ページ
          </span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>次へ →</button>
        </div>
      )}
    </div>
  );
}

// ---------- 所属マスタ管理 ----------

function AdminAffiliationsSection() {
  const [list, setList] = useState<Affiliation[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => api.listAffiliations().then(setList);
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.adminCreateAffiliation(name.trim());
      setName('');
      setMsg('所属を追加しました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    }
  };

  const remove = async (id: string, n: string) => {
    if (!confirm(`所属「${n}」を削除しますか?\nこの所属が紐付いているユーザからも外されます。`)) return;
    try {
      await api.adminDeleteAffiliation(id);
      setMsg('削除しました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    }
  };

  return (
    <div className="card">
      {msg && <div className="toast" role="status">{msg}</div>}
      <h3 style={{ marginTop: 0 }}>所属マスタ</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しい所属名"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6 }}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button className="btn" onClick={create}>追加</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((a) => (
          <li
            key={a.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
              alignItems: 'center',
            }}
          >
            <span className="tag" style={{ flex: 1 }}>{a.name}</span>
            <button className="btn btn-danger" onClick={() => remove(a.id, a.name)}>削除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
