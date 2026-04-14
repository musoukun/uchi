import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Affiliation } from '../types';
import { Avatar } from '../components/Avatar';
import { invalidateFeatures, fetchFeatures } from '../useFeatures';

type AdminUser = { id: string; email: string; name: string; createdAt: string };

// /admin-setting — 管理者専用ページ (管理者セッションで認証)
export function AdminSettingPage() {
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null | undefined>(undefined);

  useEffect(() => {
    api.adminExists().then((r) => setAdminExists(r.exists)).catch(() => setAdminExists(false));
  }, []);

  useEffect(() => {
    if (adminExists === null || !adminExists) return;
    api.adminMe()
      .then((a) => setAdmin(a as AdminUser))
      .catch(() => setAdmin(null));
  }, [adminExists]);

  if (adminExists === null) return <div className="container"><div className="loading">読み込み中…</div></div>;

  if (!adminExists) {
    return <AdminInitForm onCreated={() => { setAdminExists(true); window.location.reload(); }} />;
  }

  if (admin === undefined) return <div className="container"><div className="loading">読み込み中…</div></div>;

  if (!admin) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h2>管理者ページ</h2>
          <p style={{ color: 'var(--muted)' }}>
            管理者としてログインしてください。
          </p>
          <Link to="/admin/login" className="btn">管理者ログイン</Link>
        </div>
      </div>
    );
  }

  return <AdminDashboard admin={admin} />;
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
          {err && <div className="msg-block alert">{err}</div>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '作成中…' : '管理者を作成'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- ダッシュボード ----------

type Tab = 'users' | 'admins' | 'affiliations' | 'pulse' | 'features';

function AdminDashboard({ admin }: { admin: AdminUser }) {
  const [tab, setTab] = useState<Tab>('users');

  const logout = async () => {
    await api.adminLogout().catch(() => {});
    window.location.href = '/admin/login';
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0 }}>管理者ページ</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>{admin.name} ({admin.email})</span>
          <button className="btn btn-ghost" onClick={logout}>ログアウト</button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>ユーザ管理</button>
        <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>管理者</button>
        <button className={tab === 'affiliations' ? 'active' : ''} onClick={() => setTab('affiliations')}>所属マスタ</button>
        <button className={tab === 'pulse' ? 'active' : ''} onClick={() => setTab('pulse')}>パルスサーベイ</button>
        <button className={tab === 'features' ? 'active' : ''} onClick={() => setTab('features')}>機能設定</button>
      </div>
      {tab === 'users' && <AdminUsersSection />}
      {tab === 'admins' && <AdminAdminsSection />}
      {tab === 'affiliations' && <AdminAffiliationsSection />}
      {tab === 'pulse' && <AdminPulseSection />}
      {tab === 'features' && <AdminFeaturesSection />}
    </div>
  );
}

// ---------- 管理者管理 + 招待 ----------

function AdminAdminsSection() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Array<{
    id: string; token: string; createdBy: string;
    acceptedAt: string | null; expiresAt: string; revokedAt: string | null; createdAt: string;
  }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [a, i] = await Promise.all([api.adminListAdmins(), api.adminListInvites()]);
    setAdmins(a);
    setInvites(i);
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const createInvite = async () => {
    setBusy(true);
    try {
      const r = await api.adminCreateInvite();
      const url = `${window.location.origin}/admin/invite/${r.token}`;
      await navigator.clipboard.writeText(url);
      setMsg('招待リンクをクリップボードにコピーしました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const revokeInvite = async (id: string) => {
    if (!confirm('この招待を取り消しますか?')) return;
    try {
      await api.adminRevokeInvite(id);
      setMsg('招待を取り消しました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    }
  };

  const copyInviteUrl = async (token: string) => {
    const url = `${window.location.origin}/admin/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setMsg('リンクをコピーしました');
  };

  const getStatus = (inv: typeof invites[0]) => {
    if (inv.revokedAt) return { label: '取消済み', cls: 'badge badge-muted' };
    if (inv.acceptedAt) return { label: '使用済み', cls: 'badge badge-owner' };
    if (new Date(inv.expiresAt).getTime() < Date.now()) return { label: '期限切れ', cls: 'badge badge-muted' };
    return { label: '有効', cls: 'badge badge-member' };
  };

  return (
    <div>
      {msg && <div className="toast" role="status">{msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>管理者一覧 ({admins.length} 名)</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {admins.map((a) => (
            <li key={a.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{a.email}</div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                {new Date(a.createdAt).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>管理者を招待</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
          招待リンクを作成し、新しい管理者に共有してください。リンクは7日間有効で、1回のみ使用できます。
        </p>
        <button className="btn" disabled={busy} onClick={createInvite} style={{ marginBottom: 16 }}>
          {busy ? '作成中…' : '招待リンクを作成'}
        </button>

        {invites.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>招待履歴</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {invites.map((inv) => {
                const st = getStatus(inv);
                const isPending = !inv.revokedAt && !inv.acceptedAt && new Date(inv.expiresAt).getTime() >= Date.now();
                return (
                  <li key={inv.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 14 }}>
                    <span className={st.cls}>{st.label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--muted)' }}>
                        作成者: {inv.createdBy} / 期限: {new Date(inv.expiresAt).toLocaleString()}
                      </div>
                    </div>
                    {isPending && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" onClick={() => copyInviteUrl(inv.token)}>コピー</button>
                        <button className="btn btn-danger" onClick={() => revokeInvite(inv.id)}>取消</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
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
      isRetired?: boolean;
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
  useEffect(() => { reload(); }, []);
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

  const retireUser = async (uid: string, name: string) => {
    if (!confirm(`「${name}」を退職扱いにしますか?`)) return;
    setBusy(true);
    try {
      await api.adminRetireUser(uid);
      setMsg('退職扱いにしました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const unretireUser = async (uid: string) => {
    setBusy(true);
    try {
      await api.adminUnretireUser(uid);
      setMsg('退職を取り消しました');
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
              opacity: u.isRetired ? 0.5 : 1,
            }}
          >
            <Avatar user={u} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {u.name}
                {u.isRetired && <span className="badge badge-muted" style={{ marginLeft: 8 }}>退職</span>}
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
              {u.isRetired ? (
                <button className="btn btn-ghost" disabled={busy} onClick={() => unretireUser(u.id)}>
                  退職取消
                </button>
              ) : (
                <button className="btn btn-ghost" disabled={busy} onClick={() => retireUser(u.id, u.name)}>
                  退職
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
  useEffect(() => { reload(); }, []);
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

// ---------- パルスサーベイ管理 ----------

type AdminPulseSurvey = {
  id: string;
  affiliationId: string | null;
  affiliationName: string;
  periodLabel: string;
  status: string;
  responseCount: number;
  memberCount: number;
  opensAt: string;
  closesAt: string;
  createdAt: string;
};

function AdminPulseSection() {
  const [surveys, setSurveys] = useState<AdminPulseSurvey[]>([]);
  const [affs, setAffs] = useState<Affiliation[]>([]);
  const [pickedAff, setPickedAff] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [s, a] = await Promise.all([api.adminListPulseSurveys(), api.adminListAffiliations()]);
    setSurveys(s);
    setAffs(a);
    if (!pickedAff && a.length > 0) setPickedAff(a[0].id);
  };
  useEffect(() => { reload().catch(() => {}); }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const createCompany = async () => {
    setBusy(true);
    try {
      await api.adminCreateCompanyPulseSurvey();
      setMsg('全社サーベイを作成しました');
      reload();
    } catch (e: any) {
      if (e?.status === 409) setMsg('この週の全社サーベイは既に存在します');
      else setMsg(e instanceof Error ? e.message : '作成に失敗しました');
    } finally { setBusy(false); }
  };

  const createAff = async () => {
    if (!pickedAff) return;
    setBusy(true);
    try {
      await api.adminCreateAffiliationPulseSurvey(pickedAff);
      setMsg('所属サーベイを作成しました');
      reload();
    } catch (e: any) {
      if (e?.status === 409) setMsg('この週のサーベイは既に存在します');
      else setMsg(e instanceof Error ? e.message : '作成に失敗しました');
    } finally { setBusy(false); }
  };

  const close = async (id: string) => {
    if (!confirm('このサーベイをクローズしますか?')) return;
    try {
      await api.adminClosePulseSurvey(id);
      setMsg('クローズしました');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    }
  };

  return (
    <>
      {msg && <div className="toast" role="status">{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>サーベイを作成</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
          週次サーベイを開始します。同じ週で既に作成済みの場合は重複作成できません。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <button className="btn" onClick={createCompany} disabled={busy}>
            全社サーベイを開始
          </button>
          <span style={{ color: 'var(--muted)' }}>|</span>
          <select
            value={pickedAff}
            onChange={(e) => setPickedAff(e.target.value)}
            disabled={affs.length === 0}
          >
            {affs.length === 0 && <option value="">所属が未登録です</option>}
            {affs.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={createAff} disabled={busy || !pickedAff}>
            所属サーベイを開始
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>サーベイ一覧</h3>
        {surveys.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>まだサーベイはありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {surveys.map((s) => (
              <li key={s.id} style={{
                display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 0',
                borderBottom: '1px solid var(--border)', alignItems: 'center',
              }}>
                <span className="tag" style={{ minWidth: 90 }}>
                  {s.affiliationName}
                </span>
                <span style={{ fontSize: 14 }}>{s.periodLabel}</span>
                <span className={`pulse-status pulse-status-${s.status}`} style={{ fontSize: 12 }}>
                  {s.status === 'open' ? 'オープン' : 'クローズ'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  回答 {s.responseCount}/{s.memberCount}
                </span>
                <span style={{ flex: 1 }} />
                {s.status === 'open' && (
                  <button className="btn btn-ghost" onClick={() => close(s.id)}>
                    クローズ
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ---------- 機能設定 (ON/OFF) ----------

type FeatureState = { chat: boolean; pulse: boolean };

function AdminFeaturesSection() {
  const [features, setFeatures] = useState<FeatureState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminGetFeatures().then(setFeatures).catch(() => setFeatures({ chat: false, pulse: false }));
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const toggle = async (key: 'chat' | 'pulse') => {
    if (!features || busy) return;
    const next = !features[key];
    setBusy(true);
    try {
      await api.adminSetFeature(key, next);
      setFeatures({ ...features, [key]: next });
      invalidateFeatures();
      fetchFeatures();
      setMsg(`${labelOf(key)}を${next ? 'ON' : 'OFF'}にしました`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '切替に失敗しました');
    } finally { setBusy(false); }
  };

  if (!features) return <div className="loading">読み込み中…</div>;

  return (
    <div className="card">
      {msg && <div className="toast" role="status">{msg}</div>}
      <h3 style={{ marginTop: 0 }}>機能の有効化</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        任意機能を必要に応じて ON/OFF にできます。OFF にするとヘッダーリンクと関連 API が無効化されます (既存データは削除されません)。
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <FeatureRow
          name="チャット"
          desc="リアルタイムチャット (💬 Chat)"
          enabled={features.chat}
          busy={busy}
          onToggle={() => toggle('chat')}
        />
        <FeatureRow
          name="パルスサーベイ"
          desc="週次エンゲージメント調査 (📊 Pulse)"
          enabled={features.pulse}
          busy={busy}
          onToggle={() => toggle('pulse')}
        />
      </ul>
    </div>
  );
}

function labelOf(k: 'chat' | 'pulse') {
  return k === 'chat' ? 'チャット' : 'パルスサーベイ';
}

function FeatureRow({ name, desc, enabled, busy, onToggle }: {
  name: string; desc: string; enabled: boolean; busy: boolean; onToggle: () => void;
}) {
  return (
    <li style={{
      display: 'flex', gap: 12, padding: '12px 0',
      borderBottom: '1px solid var(--border)', alignItems: 'center',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{desc}</div>
      </div>
      <span style={{
        fontSize: 12, padding: '2px 8px', borderRadius: 999,
        background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
        color: enabled ? '#16a34a' : 'var(--muted)',
      }}>
        {enabled ? 'ON' : 'OFF'}
      </span>
      <button className="btn" onClick={onToggle} disabled={busy}>
        {enabled ? '無効化' : '有効化'}
      </button>
    </li>
  );
}
