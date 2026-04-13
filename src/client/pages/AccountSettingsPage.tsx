import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { Affiliation, AIConfig } from '../types';
import { ProfileEditor } from '../components/ProfileEditor';

type Tab = 'profile' | 'affiliation' | 'ai' | 'prompts';

export function AccountSettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>アカウント設定</h2>
      <div className="tabs">
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>プロフィール</button>
        <button className={tab === 'affiliation' ? 'active' : ''} onClick={() => setTab('affiliation')}>所属</button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>AIプロバイダ</button>
        <button className={tab === 'prompts' ? 'active' : ''} onClick={() => setTab('prompts')}>プロンプト</button>
      </div>
      {tab === 'profile' && <ProfileEditor />}
      {tab === 'affiliation' && <AffiliationSection />}
      {tab === 'ai' && <AIConfigSection />}
      {tab === 'prompts' && <PromptSection />}
    </div>
  );
}

// 自分が脱退した private コミュニティだけが見えるタブ。
// 他人にはこのリストは見えない (本人専用 API)。
function PrivateCommunitiesSection() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [data, setData] = useState<{
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      memberCount: number;
      ownerCount: number;
      leftAt: string;
    }>;
    total: number;
    totalPages: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await api.listMyLeftPrivateCommunities(page, pageSize);
      setData({ items: r.items, total: r.total, totalPages: r.totalPages });
    } catch (e) {
      setData({ items: [], total: 0, totalPages: 1 });
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const onRejoin = async (id: string, name: string) => {
    if (!confirm(`「${name}」に再参加しますか？`)) return;
    setBusy(id);
    try {
      await api.rejoinCommunity(id);
      setToast('再参加しました');
      // ページ末尾の最後の1件を再参加した場合、前のページに戻す
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '再参加に失敗しました');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      {toast && <div className="toast" role="status">{toast}</div>}
      <h3 style={{ marginTop: 0 }}>脱退したプライベートコミュニティ</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        ここはあなただけが見られる一覧です。プライベートコミュニティを脱退すると一覧画面からは見えなくなりますが、ここから再参加できます。
      </p>
      {!data ? (
        <div className="loading">読み込み中…</div>
      ) : data.items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>脱退したプライベートコミュニティはありません。</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.items.map((c) => (
              <li
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>🔒 {c.name}</div>
                  {c.description && (
                    <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
                      {c.description}
                    </div>
                  )}
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {c.memberCount} メンバー
                    {c.ownerCount === 0 && (
                      <span className="badge badge-no-owner" style={{ marginLeft: 8 }}>
                        👻 代表者なし
                      </span>
                    )}
                    <span style={{ marginLeft: 8 }}>
                      脱退日: {new Date(c.leftAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>
                <button
                  className="btn"
                  disabled={busy === c.id}
                  onClick={() => onRejoin(c.id, c.name)}
                >
                  {busy === c.id ? '処理中…' : '🤝 再参加'}
                </button>
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 16,
              }}
            >
              <button
                className="btn btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← 前へ
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                {page} / {data.totalPages} ページ (全 {data.total} 件)
              </span>
              <button
                className="btn btn-ghost"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                次へ →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 仕様変更: ユーザは自分の所属を変更できなくなった (管理者のみが /admin-setting から付与)。
// このタブは「自分の所属を確認する」用の読み取り専用ビューに変更。
function AffiliationSection() {
  const [mine, setMine] = useState<Affiliation[]>([]);

  useEffect(() => {
    (async () => {
      const me = await api.getMe();
      if (me) {
        const ua = await api.getUserAffiliations(me.id);
        setMine(ua);
      }
    })();
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>あなたの所属</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        所属の付与・解除は管理者が行います。変更したい場合は管理者に依頼してください。
      </p>
      {mine.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>(所属はありません)</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {mine.map((a) => (
            <span key={a.id} className="tag" style={{ padding: '6px 14px' }}>{a.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function AIConfigSection() {
  const [items, setItems] = useState<AIConfig[]>([]);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'gemini'>('gemini');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const reload = () => api.listAIConfigs().then(setItems);
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!apiKey || !model) return alert('apiKey と model は必須です');
    await api.createAIConfig({
      provider,
      endpoint: endpoint || undefined,
      model,
      apiKey,
      isDefault,
    });
    setApiKey('');
    reload();
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>AIプロバイダ</h3>
      <p style={{ color: 'var(--muted)', fontSize: 15 }}>OpenAI / Anthropic / Gemini のAPIキーを登録できます (AES-256-GCM で暗号化保存)。</p>

      {items.map((it) => (
        <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tag">{it.provider}</span>
          <span style={{ flex: 1 }}>{it.model} / <code>{it.apiKeyMasked}</code></span>
          {it.isDefault ? <span className="tag" style={{ background: 'var(--accent-soft-30)', color: 'var(--text)' }}>default</span> :
            <button className="btn btn-ghost" onClick={async () => { await api.setDefaultAIConfig(it.id); reload(); }}>default に設定</button>}
          <button className="btn btn-danger" onClick={async () => { if (confirm('削除しますか?')) { await api.deleteAIConfig(it.id); reload(); } }}>削除</button>
        </div>
      ))}

      <h4>新規追加</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        <select value={provider} onChange={(e) => {
          const p = e.target.value as any;
          setProvider(p);
          if (p === 'openai') setModel('gpt-5-mini');
          if (p === 'anthropic') setModel('claude-sonnet-4-6');
          if (p === 'gemini') setModel('gemini-2.5-flash');
        }}>
          <option value="gemini">Gemini (gemini-2.5-flash)</option>
          <option value="openai">OpenAI (gpt-5-mini)</option>
          <option value="anthropic">Anthropic (claude-sonnet-4-6)</option>
        </select>
        <input placeholder="endpoint (省略可)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
        <input type="password" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
        <label style={{ display: 'flex', gap: 8 }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          デフォルトに設定
        </label>
        <button className="btn" onClick={create}>追加</button>
      </div>
    </div>
  );
}

function PromptSection() {
  const [review, setReview] = useState('');
  const [summary, setSummary] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getPrompts().then((p) => { setReview(p.review); setSummary(p.summary); setLoaded(true); });
  }, []);

  if (!loaded) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>レビュー用プロンプト</h3>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          style={{ width: '100%', minHeight: 240, padding: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 15 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={async () => { await api.setPrompt('review', review); alert('保存しました'); }}>保存</button>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>要約用プロンプト</h3>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 15 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={async () => { await api.setPrompt('summary', summary); alert('保存しました'); }}>保存</button>
      </div>
    </div>
  );
}
