import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { setMe } from '../useMe';

export function RegisterPage() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api.register({ name, email, password });
      setMe(user);
      nav('/');
    } catch (err: any) {
      setError(err.message || '登録に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h2>新規登録</h2>
      <form onSubmit={onSubmit} className="card">
        {error && (
          <div className="msg-block alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            表示名
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            パスワード (8文字以上)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          />
        </div>
        <button type="submit" className="btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? '登録中…' : '登録する'}
        </button>
        <p style={{ marginTop: 16, fontSize: 14, textAlign: 'center', color: 'var(--muted)' }}>
          すでにアカウントをお持ちの方は <Link to="/login">ログイン</Link>
        </p>
      </form>
    </div>
  );
}
