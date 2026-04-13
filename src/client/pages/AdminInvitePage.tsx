import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AdminInvitePage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminValidateInvite(token)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false));
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.adminAcceptInvite(token, { email, password, name });
      nav('/admin-setting');
    } catch (err: any) {
      setError(err.message || '登録に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  if (valid === null) return <div className="container"><div className="loading">招待を確認中…</div></div>;

  if (!valid) {
    return (
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>招待が無効です</h2>
          <p style={{ color: 'var(--muted)' }}>
            この招待リンクは有効期限切れ、取り消し済み、または既に使用されています。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h2>管理者アカウント登録</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        招待を受けて管理者アカウントを作成します。
      </p>
      <form onSubmit={onSubmit} className="card">
        {error && (
          <div className="msg-block alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 15, color: 'var(--muted)', marginBottom: 4 }}>
            表示名
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 15, color: 'var(--muted)', marginBottom: 4 }}>
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 15, color: 'var(--muted)', marginBottom: 4 }}>
            パスワード (8文字以上)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <button type="submit" className="btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? '登録中…' : '管理者アカウントを作成'}
        </button>
      </form>
    </div>
  );
}
