import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.adminLogin({ email, password });
      nav('/admin-setting');
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h2>管理者ログイン</h2>
      <form onSubmit={onSubmit} className="card">
        {error && (
          <div className="msg-block alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 15, color: 'var(--muted)', marginBottom: 4 }}>
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 15, color: 'var(--muted)', marginBottom: 4 }}>
            パスワード
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
          {busy ? 'ログイン中…' : '管理者ログイン'}
        </button>
      </form>
    </div>
  );
}
