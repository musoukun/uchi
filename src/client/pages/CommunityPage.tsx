import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { ArticleListItem, CommunityFull, Post } from '../types';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { PostComposer } from '../components/PostComposer';

type Tab = 'timeline' | 'members' | 'pending' | 'invite' | 'settings';

export function CommunityPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState<CommunityFull | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('timeline');
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);
  const [tlArticles, setTlArticles] = useState<ArticleListItem[]>([]);
  const [tlPosts, setTlPosts] = useState<Post[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [newTimelineName, setNewTimelineName] = useState('');
  const [newTimelineVis, setNewTimelineVis] = useState<'public' | 'members_only' | 'affiliation_in'>('members_only');
  const [inviteEmail, setInviteEmail] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const reload = useCallback(() => {
    api
      .getCommunity(id)
      .then((r) => {
        setC(r);
        if (r.timelines.length > 0 && !activeTimelineId) setActiveTimelineId(r.timelines[0].id);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
      });
  }, [id, activeTimelineId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!activeTimelineId || !c) return;
    api.listTimelineArticles(c.id, activeTimelineId).then(setTlArticles).catch(() => setTlArticles([]));
    api.listTimelinePosts(activeTimelineId).then(setTlPosts).catch(() => setTlPosts([]));
  }, [activeTimelineId, c]);

  useEffect(() => {
    if (tab === 'pending' && c?.myRole === 'owner') {
      api.listPending(c.id).then(setPending).catch(() => setPending([]));
    }
    if (tab === 'invite' && c?.myRole === 'owner') {
      api.listInvites(c.id).then(setInvites).catch(() => setInvites([]));
    }
  }, [tab, c]);

  // toast 自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (notFound) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>このコミュニティは見つかりません</h2>
          <p style={{ color: 'var(--muted)' }}>
            限定公開のコミュニティかもしれません。アクセスするには代表者から招待リンクを受け取ってください。
          </p>
          <Link to="/communities" className="btn">コミュニティ一覧に戻る</Link>
        </div>
      </div>
    );
  }
  if (!c) return <div className="container"><div className="loading">読み込み中…</div></div>;

  const isOwner = c.myRole === 'owner';
  const isMember = !!c.myRole;
  const ownerCount = c.members.filter((m) => m.role === 'owner').length;

  const addTimeline = async () => {
    if (!newTimelineName.trim()) return;
    if (newTimelineName.trim() === 'ホーム') {
      setToast('「ホーム」は予約語のため使えません');
      return;
    }
    await api.createTimeline(c.id, { name: newTimelineName.trim(), visibility: newTimelineVis });
    setNewTimelineName('');
    reload();
  };

  const removeTimeline = async (tid: string, name: string) => {
    if (name === 'ホーム') {
      setToast('ホームタイムラインは削除できません');
      return;
    }
    if (!confirm(`タイムライン「# ${name}」を削除しますか？\n紐付いている記事はホームに振り戻されます。`)) return;
    try {
      await api.deleteTimeline(c.id, tid);
      reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  const issueInvite = async () => {
    try {
      const r = await api.createInvite(c.id, inviteEmail || undefined);
      const url = window.location.origin + '/invite/' + r.token;
      try {
        await navigator.clipboard.writeText(url);
        setToast('招待リンクをクリップボードにコピーしました');
      } catch {
        setToast('招待リンクを発行しました');
      }
      setInviteEmail('');
      api.listInvites(c.id).then(setInvites);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '招待発行に失敗しました');
    }
  };

  const copyInvite = async (token: string) => {
    const url = window.location.origin + '/invite/' + token;
    try {
      await navigator.clipboard.writeText(url);
      setToast('コピーしました');
    } catch {
      setToast('コピーに失敗しました');
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!confirm('この招待を取り消しますか？')) return;
    await api.revokeInvite(c.id, inviteId);
    api.listInvites(c.id).then(setInvites);
  };

  const promoteToOwner = async (userId: string, name: string) => {
    if (!confirm(`${name} を代表(owner)に昇格しますか？`)) return;
    await api.setMemberRole(c.id, userId, 'owner');
    reload();
  };

  const demoteFromOwner = async (userId: string, name: string) => {
    try {
      await api.setMemberRole(c.id, userId, 'member');
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === 'last_owner') {
        setToast(e.body.message);
      } else {
        setToast(e instanceof Error ? e.message : '失敗しました');
      }
    }
  };

  const removeMember = async (userId: string, name: string, role: string) => {
    // 自分自身が最後の owner なら譲渡 modal
    if (userId === c.members.find((m) => m.role === c.myRole && m.id === userId)?.id && role === 'owner' && ownerCount === 1) {
      setTransferOpen(true);
      return;
    }
    if (!confirm(`${name} を脱退/削除しますか？`)) return;
    try {
      await api.removeMember(c.id, userId);
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === 'last_owner') {
        setTransferOpen(true);
      } else {
        setToast(e instanceof Error ? e.message : '失敗しました');
      }
    }
  };

  const transferAndLeave = async (toUserId: string) => {
    try {
      await api.setMemberRole(c.id, toUserId, 'owner');
      // 自分を削除
      const meId = c.members.find((m) => m.role === c.myRole)?.id; // owner=自分
      // c.myRole === 'owner' のはず。自分の id を members から探す必要がある
      // (members には id=userId が入っている)
      // 実際は: 自分の userId は API レスポンスにはないので、いったん再取得して role 比較
      const fresh = await api.getCommunity(c.id);
      const myself = fresh.members.find((m) => m.id !== toUserId && m.role === 'owner') ||
                      fresh.members.find((m) => m.role === 'owner');
      // フォールバック: 自分は最初に「myRole==owner」だった人。もう一段確実にするため /api/me 経由で id 取る
      const me = await api.getMe();
      if (me) await api.removeMember(c.id, me.id);
      setTransferOpen(false);
      setToast('代表を譲渡し、コミュニティを脱退しました');
      nav('/communities');
    } catch (e) {
      setToast(e instanceof Error ? e.message : '譲渡に失敗しました');
    }
  };

  const approve = async (articleId: string) => {
    await api.approvePending(c.id, articleId);
    api.listPending(c.id).then(setPending);
    // 承認した記事は published になるので timeline を再取得
    if (activeTimelineId) {
      api.listTimelineArticles(c.id, activeTimelineId).then(setTlArticles).catch(() => {});
    }
    setToast('記事を公開しました');
  };
  const reject = async (articleId: string) => {
    const note = prompt('却下の理由 (任意)');
    await api.rejectPending(c.id, articleId, note || undefined);
    api.listPending(c.id).then(setPending);
  };

  return (
    <div className="container">
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{c.name}</h2>
          <span className={`badge badge-${c.visibility}`}>
            {c.visibility === 'private' ? '🔒 限定' : '🌐 公開'}
          </span>
        </div>
        {c.description && <p style={{ color: 'var(--muted)', marginBottom: 8 }}>{c.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{c.members.length} メンバー</span>
          {isMember ? (
            <span className={`badge ${c.myRole === 'owner' ? 'badge-owner' : 'badge-member'}`}>
              あなた: {c.myRole === 'owner' ? '代表' : 'メンバー'}
            </span>
          ) : (
            <span className="badge badge-outsider">未参加 / 招待リンクが必要です</span>
          )}
          {isMember && (
            <Link
              to={`/editor?communityId=${c.id}&timelineId=${activeTimelineId || ''}`}
              className="btn"
              style={{ marginLeft: 'auto' }}
            >
              ✏ このコミュニティに投稿
            </Link>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>タイムライン</button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>メンバー</button>
        {isOwner && <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>承認待ち</button>}
        {isOwner && <button className={tab === 'invite' ? 'active' : ''} onClick={() => setTab('invite')}>招待</button>}
        {isOwner && <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>設定</button>}
      </div>

      {tab === 'timeline' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {c.timelines.map((tl) => (
              <button
                key={tl.id}
                className={'btn ' + (activeTimelineId === tl.id ? '' : 'btn-ghost')}
                onClick={() => setActiveTimelineId(tl.id)}
              >
                # {tl.name}
              </button>
            ))}
            {isOwner && (
              <button
                className="btn btn-ghost"
                title="新しいタイムラインを追加"
                onClick={() => setTab('settings')}
              >
                ＋ チャンネル追加
              </button>
            )}
            {isMember && activeTimelineId && (
              <Link
                to={`/editor?communityId=${c.id}&timelineId=${activeTimelineId}`}
                className="btn btn-ghost"
                title="このタイムラインに長文の記事を書く"
                style={{ marginLeft: 'auto' }}
              >
                ✎ 記事を書く
              </Link>
            )}
          </div>

          {/* SNS 投稿 composer (メンバーのみ) */}
          {isMember && activeTimelineId && (
            <PostComposer
              communityId={c.id}
              timelineId={activeTimelineId}
              onPosted={(p) => setTlPosts((prev) => [p, ...prev])}
            />
          )}

          {/* SNS 投稿一覧 */}
          {tlPosts.length > 0 && (
            <div className="post-feed">
              {tlPosts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onChanged={(np) =>
                    setTlPosts((prev) => prev.map((x) => (x.id === np.id ? np : x)))
                  }
                  onDeleted={(id) => setTlPosts((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}

          {/* 記事 (Markdown 長文) */}
          {tlArticles.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, fontWeight: 700 }}>
                📚 記事
              </div>
              {tlArticles.map((a) => (
                <Link to={`/articles/${a.id}`} key={a.id} className="article-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="article-emoji">{a.emoji || '📝'}</div>
                  <div className="article-meta">
                    <div className="article-title">{a.title}</div>
                    <div className="article-sub">
                      <span>{a.author?.name}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {tlArticles.length === 0 && tlPosts.length === 0 && (
            <div className="empty">
              {isMember
                ? 'まだ投稿がありません。上のフォームから最初の投稿をしてみよう。'
                : 'まだ投稿がありません'}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="card">
          {c.members.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <Avatar user={{ name: m.name, avatarUrl: m.avatarUrl }} />
              <div style={{ flex: 1 }}>
                <Link to={`/users/${m.id}`}>{m.name}</Link>
                <span className={`badge ${m.role === 'owner' ? 'badge-owner' : 'badge-member'}`} style={{ marginLeft: 8 }}>
                  {m.role === 'owner' ? '代表' : 'メンバー'}
                </span>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button
                  className="btn btn-ghost"
                  onClick={() => promoteToOwner(m.id, m.name)}
                >
                  代表に昇格
                </button>
              )}
              {isOwner && m.role === 'owner' && ownerCount > 1 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => demoteFromOwner(m.id, m.name)}
                >
                  代表を解除
                </button>
              )}
              {isOwner && (
                <button
                  className="btn btn-danger"
                  onClick={() => removeMember(m.id, m.name, m.role)}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'pending' && isOwner && (
        <div className="card">
          {pending.length === 0 ? (
            <div className="empty">承認待ちはありません</div>
          ) : (
            pending.map((a: any) => (
              <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{a.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>by {a.author?.name}</div>
                <Link to={`/articles/${a.id}`}>本文を確認</Link>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => approve(a.id)}>承認</button>
                  <button className="btn btn-danger" onClick={() => reject(a.id)}>却下</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'invite' && isOwner && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>招待リンク発行</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="email"
              placeholder="招待先メール (任意)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', flex: 1 }}
            />
            <button className="btn" onClick={issueInvite}>発行してコピー</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            発行されたリンクは 7日間 有効です。
          </div>
          <h4 style={{ margin: '20px 0 8px' }}>発行済みの招待 ({invites.length})</h4>
          {invites.length === 0 ? (
            <div className="empty">まだ発行されていません</div>
          ) : (
            <ul className="invite-list">
              {invites.map((iv) => {
                const url = window.location.origin + '/invite/' + iv.token;
                const expired = iv.expiresAt && new Date(iv.expiresAt).getTime() < Date.now();
                const status = iv.revokedAt
                  ? { label: '取消済', cls: 'revoked' }
                  : iv.acceptedAt
                  ? { label: '使用済', cls: 'used' }
                  : expired
                  ? { label: '期限切れ', cls: 'expired' }
                  : { label: '未使用', cls: 'open' };
                return (
                  <li key={iv.id} className="invite-row">
                    <div className="invite-row-head">
                      <span className={`badge invite-status ${status.cls}`}>{status.label}</span>
                      {iv.email && <span className="invite-email">📧 {iv.email}</span>}
                      <span className="invite-date">
                        {new Date(iv.createdAt).toLocaleString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="invite-row-body">
                      <input className="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                      <button className="btn btn-ghost" onClick={() => copyInvite(iv.token)} disabled={status.cls !== 'open'}>
                        コピー
                      </button>
                      {status.cls === 'open' && (
                        <button className="btn btn-danger" onClick={() => revokeInvite(iv.id)}>
                          取消
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'settings' && isOwner && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>公開範囲</h3>
          <div style={{ marginBottom: 16 }}>
            <select
              value={c.visibility}
              onChange={async (e) => {
                await api.updateCommunity(c.id, { visibility: e.target.value as any });
                reload();
              }}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
            >
              <option value="private">🔒 限定 (招待リンクのみ。一覧/直リンクからは見えない)</option>
              <option value="public">🌐 公開 (誰でも一覧で見つけられる)</option>
            </select>
          </div>

          <h3>タイムライン管理</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            タイムラインはコミュニティ内のチャンネルです。「ホーム」は必ず存在し、削除できません。
          </div>
          {c.timelines.map((tl) => (
            <div key={tl.id} style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'center' }}>
              <span style={{ flex: 1 }}># {tl.name} <span className="tag">{tl.visibility}</span></span>
              {tl.name !== 'ホーム' && (
                <button className="btn btn-danger" onClick={() => removeTimeline(tl.id, tl.name)}>削除</button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              type="text"
              placeholder="新タイムライン名"
              value={newTimelineName}
              onChange={(e) => setNewTimelineName(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
            />
            <select
              value={newTimelineVis}
              onChange={(e) => setNewTimelineVis(e.target.value as any)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
            >
              <option value="members_only">メンバーのみ</option>
              <option value="public">全体公開</option>
              <option value="affiliation_in">所属指定</option>
            </select>
            <button className="btn" onClick={addTimeline}>追加</button>
          </div>
        </div>
      )}

      {transferOpen && (
        <div className="modal-backdrop" onClick={() => setTransferOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>代表を譲渡してください</h3>
            <p style={{ color: 'var(--muted)' }}>
              コミュニティには代表(owner)が最低1名必要です。脱退するには、他のメンバーから新しい代表を選んでください。
            </p>
            {c.members.filter((m) => m.role !== 'owner').length === 0 ? (
              <p style={{ color: 'var(--danger, #c0392b)' }}>
                他にメンバーがいないため譲渡できません。脱退するには先にメンバーを招待するか、コミュニティを削除してください。
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {c.members
                  .filter((m) => m.role !== 'owner')
                  .map((m) => (
                    <li
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <Avatar user={{ name: m.name, avatarUrl: m.avatarUrl }} />
                      <span style={{ flex: 1 }}>{m.name}</span>
                      <button className="btn" onClick={() => transferAndLeave(m.id)}>
                        この人を代表にして脱退
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="btn btn-ghost" onClick={() => setTransferOpen(false)}>
                やめる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
