import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type {
  Affiliation,
  ArticleListItem,
  CommunityFull,
  CommunityMember,
  CommunityTimeline,
  CommunityVisibility,
  Post,
  TimelineVisibility,
  User,
} from '../types';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { PostComposer } from '../components/PostComposer';
import { CommunityIconEditor } from '../components/CommunityIconEditor';
import { CommunityMemberPicker } from '../components/CommunityMemberPicker';

type Tab = 'timeline' | 'members' | 'pending' | 'invite' | 'settings';

export function CommunityPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState<CommunityFull | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [allAffiliations, setAllAffiliations] = useState<Affiliation[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('timeline');
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);
  const [tlArticles, setTlArticles] = useState<ArticleListItem[]>([]);
  const [tlPosts, setTlPosts] = useState<Post[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  // タイムライン管理は TimelineManager コンポーネントに切り出し
  const [inviteEmail, setInviteEmail] = useState('');
  const [toast, setToast] = useState<string | null>(null);

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
    api.getMe().then((u) => setMe(u)).catch(() => setMe(null));
    // 所属ピッカー用。ログインしていなくても全体リストは公開 API なので OK
    api.listAffiliations().then(setAllAffiliations).catch(() => setAllAffiliations([]));
  }, []);
  const meId = me?.id || null;

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

  const removeMember = async (userId: string, name: string, _role: string) => {
    if (!confirm(`${name} を脱退/削除しますか？`)) return;
    try {
      await api.removeMember(c.id, userId);
      reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '失敗しました');
    }
  };

  // 「コミュニティに参加」ボタン (public コミュニティ向けの直接参加)
  const joinCommunity = async () => {
    try {
      await api.joinCommunity(c.id);
      setToast('コミュニティに参加しました');
      reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '参加に失敗しました');
    }
  };

  // 「コミュニティから脱退」ボタン (ヘッダから自分自身が抜ける用)
  // 仕様: 最後の代表でも譲渡を強制せず、そのまま脱退できる。
  // 代表者ゼロのコミュニティは「代表者なし (活動停止)」として残る。
  const leaveCommunity = async () => {
    if (!meId) return;
    const lastOwnerWarning =
      isOwner && ownerCount === 1
        ? '\n\n※ あなたは最後の代表です。脱退するとこのコミュニティは「代表者なし」状態になります。'
        : '';
    if (!confirm(`「${c.name}」から脱退しますか？${lastOwnerWarning}`)) return;
    try {
      await api.removeMember(c.id, meId);
      setToast('コミュニティを脱退しました');
      nav('/communities');
    } catch (e) {
      setToast(e instanceof Error ? e.message : '脱退に失敗しました');
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
          <Avatar user={{ name: c.name, avatarUrl: c.avatarUrl }} size="lg" />
          <h2 style={{ margin: 0, flex: 1 }}>{c.name}</h2>
          <span className={`badge badge-${c.visibility}`}>
            {c.visibility === 'public'
              ? '🌐 全体公開'
              : c.visibility === 'private'
                ? '🔒 限定'
                : c.visibility === 'affiliation_in'
                  ? '🏷 所属限定'
                  : '🏷 所属除外'}
          </span>
        </div>
        {ownerCount === 0 && (
          <div className="community-no-owner-note" role="note">
            👻 このコミュニティは <strong>代表者がいません</strong>。活動をしていない可能性があります。
            メンバーが残っていれば自由に投稿できますが、新しい招待やタイムラインの管理を行うには代表者が必要です。
          </div>
        )}
        {c.description && <p style={{ color: 'var(--muted)', marginBottom: 8 }}>{c.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--muted)', fontSize: 15 }}>{c.members.length} メンバー</span>
          {isMember ? (
            <span className={`badge ${c.myRole === 'owner' ? 'badge-owner' : 'badge-member'}`}>
              あなた: {c.myRole === 'owner' ? '代表' : 'メンバー'}
            </span>
          ) : (
            <span className="badge badge-outsider">
              {c.visibility === 'public'
                ? '未参加'
                : c.visibility === 'private'
                  ? '未参加 / 招待リンクが必要です'
                  : '未参加 / 管理者にお問い合わせください'}
            </span>
          )}
          {isMember && (
            <>
              <Link
                to={`/editor?communityId=${c.id}&timelineId=${activeTimelineId || ''}`}
                className="btn"
                style={{ marginLeft: 'auto' }}
              >
                ✏ このコミュニティに投稿
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={leaveCommunity}
                title={isOwner && ownerCount === 1
                  ? '最後の代表ですが、そのまま脱退できます (コミュニティは「代表者なし」になります)'
                  : 'このコミュニティから脱退する'}
              >
                🚪 脱退
              </button>
            </>
          )}
          {!isMember && c.visibility === 'public' && (
            <button
              type="button"
              className="btn"
              style={{ marginLeft: 'auto' }}
              onClick={joinCommunity}
              title="このコミュニティに参加する"
            >
              🤝 参加する
            </button>
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
                ＋ タイムライン追加
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
                  meId={meId}
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
              <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 8, fontWeight: 700 }}>
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
                <div style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 8 }}>by {a.author?.name}</div>
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
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
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
        <CommunityIconEditor
          community={{ id: c.id, name: c.name, avatarUrl: c.avatarUrl }}
          onUpdated={() => reload()}
        />
      )}
      {tab === 'settings' && isOwner && (
        <CommunityMemberPicker community={c} onAdded={() => reload()} />
      )}
      {tab === 'settings' && isOwner && (
        <div className="card" style={{ marginTop: 16 }}>
          <CommunityVisibilityEditor
            community={c}
            isAdmin={!!me?.isAdmin}
            affiliations={allAffiliations}
            onSaved={() => {
              reload();
              setToast('公開範囲を更新しました');
            }}
            onError={(msg) => setToast(msg)}
          />

          <TimelineManager
            community={c}
            onRemove={removeTimeline}
            onChanged={() => {
              reload();
              setToast('タイムラインを更新しました');
            }}
            onError={(msg) => setToast(msg)}
          />
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------
// 公開範囲エディタ
// 3 モード:
//   public           … 全体に公開
//   private          … 招待したメンバーのみ
//   affiliation_*    … 管理者専用 / 所属IDリストで可視性を制御
//     - affiliation_in  : 指定した所属に属するユーザーに「見える」
//     - affiliation_out : 指定した所属に属するユーザーには「見えない」
// ---------------------------------------------------------------
function CommunityVisibilityEditor({
  community,
  isAdmin,
  affiliations,
  onSaved,
  onError,
}: {
  community: CommunityFull;
  isAdmin: boolean;
  affiliations: Affiliation[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  // UI 上の 3 モード。affiliation_in/out は「所属」というまとめで 1 つ
  type Mode = 'public' | 'private' | 'affiliation';
  const initialMode: Mode =
    community.visibility === 'public'
      ? 'public'
      : community.visibility === 'affiliation_in' || community.visibility === 'affiliation_out'
        ? 'affiliation'
        : 'private';
  const initialSub: 'in' | 'out' =
    community.visibility === 'affiliation_out' ? 'out' : 'in';
  const initialIds = (community.visibilityAffiliationIds || '')
    .split(',')
    .filter(Boolean);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [sub, setSub] = useState<'in' | 'out'>(initialSub);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [saving, setSaving] = useState(false);

  const dirty =
    mode !== initialMode ||
    (mode === 'affiliation' &&
      (sub !== initialSub ||
        selectedIds.slice().sort().join(',') !== initialIds.slice().sort().join(',')));

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    let visibility: CommunityVisibility;
    if (mode === 'public') visibility = 'public';
    else if (mode === 'private') visibility = 'private';
    else visibility = sub === 'in' ? 'affiliation_in' : 'affiliation_out';

    if (mode === 'affiliation' && selectedIds.length === 0) {
      onError('所属を 1 つ以上選択してください');
      return;
    }

    setSaving(true);
    try {
      await api.updateCommunity(community.id, {
        visibility,
        ...(mode === 'affiliation' ? { visibilityAffiliationIds: selectedIds } : {}),
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>公開範囲</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="radio"
            name="community-visibility"
            checked={mode === 'public'}
            onChange={() => setMode('public')}
            style={{ marginTop: 4 }}
          />
          <span>
            <strong>🌐 全体に公開</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              誰でも一覧から見つけられます
            </div>
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="radio"
            name="community-visibility"
            checked={mode === 'private'}
            onChange={() => setMode('private')}
            style={{ marginTop: 4 }}
          />
          <span>
            <strong>🔒 限定</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              招待したメンバーのみ
            </div>
          </span>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            cursor: isAdmin ? 'pointer' : 'not-allowed',
            opacity: isAdmin ? 1 : 0.55,
          }}
          title={isAdmin ? undefined : '所属ベースの公開範囲は管理者のみ設定できます'}
        >
          <input
            type="radio"
            name="community-visibility"
            checked={mode === 'affiliation'}
            onChange={() => isAdmin && setMode('affiliation')}
            disabled={!isAdmin}
            style={{ marginTop: 4 }}
          />
          <span>
            <strong>🏷 所属ベース</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              選んだ所属に「見える」または「見えない」を指定します (管理者のみ)
            </div>
          </span>
        </label>
      </div>

      {mode === 'affiliation' && isAdmin && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="community-visibility-sub"
                checked={sub === 'in'}
                onChange={() => setSub('in')}
              />
              この所属には<strong>見える</strong>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="community-visibility-sub"
                checked={sub === 'out'}
                onChange={() => setSub('out')}
              />
              この所属には<strong>見えない</strong>
            </label>
          </div>

          {affiliations.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              所属が 1 つも登録されていません。管理ページから追加してください。
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {affiliations.map((a) => {
                const on = selectedIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`tag${on ? ' tag-on' : ''}`}
                    style={{
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: on ? 'var(--accent)' : 'transparent',
                      color: on ? '#fff' : 'inherit',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(a.id)}
                      style={{ display: 'none' }}
                    />
                    {a.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button className="btn" disabled={!dirty || saving} onClick={save}>
        {saving ? '保存中…' : '公開範囲を保存'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------
// タイムライン管理
//
// 仕様:
//  - community.visibility === 'public' の場合 timeline は
//      members_only / selected_users の 2 択
//  - community.visibility === 'private' の場合も
//      members_only / selected_users の 2 択
//      (どちらも「コミュニティ内ユーザーを指定して公開」ができる)
//  - affiliation_* コミュニティは従来互換で affiliation_in も選べる
//  - selected_users の場合、メンバー一覧からチェックして対象を指定
//  - ホームタイムラインは削除不可 / 名前変更不可 (visibility のみ編集可)
// ---------------------------------------------------------------
function TimelineManager({
  community,
  onRemove,
  onChanged,
  onError,
}: {
  community: CommunityFull;
  onRemove: (tid: string, name: string) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newVis, setNewVis] = useState<TimelineVisibility>('members_only');
  const [newUserIds, setNewUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isAffiliationBased =
    community.visibility === 'affiliation_in' ||
    community.visibility === 'affiliation_out';

  // 選択可能モード (コミュニティ visibility に合わせる)
  const modeOptions: { value: TimelineVisibility; label: string; hint: string }[] = (() => {
    const base: { value: TimelineVisibility; label: string; hint: string }[] = [
      {
        value: 'members_only',
        label: '🔒 メンバーのみ',
        hint: 'このコミュニティのメンバー全員が閲覧・投稿できます',
      },
      {
        value: 'selected_users',
        label: '👥 指定ユーザーのみ',
        hint: '選んだメンバー + 代表だけが閲覧・投稿できます',
      },
    ];
    if (isAffiliationBased) {
      base.push({
        value: 'affiliation_in',
        label: '🏷 所属限定',
        hint: '指定の所属に属するメンバーのみ',
      });
    }
    return base;
  })();

  const addTimeline = async () => {
    if (!newName.trim()) return;
    if (newName.trim() === 'ホーム') {
      onError('「ホーム」は予約語のため使えません');
      return;
    }
    if (newVis === 'selected_users' && newUserIds.length === 0) {
      onError('対象ユーザーを 1 人以上選んでください');
      return;
    }
    setSaving(true);
    try {
      await api.createTimeline(community.id, {
        name: newName.trim(),
        visibility: newVis,
        visibilityUserIds: newVis === 'selected_users' ? newUserIds : undefined,
      });
      setNewName('');
      setNewVis('members_only');
      setNewUserIds([]);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : '作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3>タイムライン管理</h3>
      <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        タイムラインはコミュニティ内のチャンネルです。「ホーム」は必ず存在し、削除できません。
        {' '}
        <strong>「指定ユーザーのみ」</strong>
        を選ぶと、コミュニティ内の特定メンバーだけが閲覧・投稿できる限定チャンネルを作れます
        (代表は常にアクセス可)。
      </div>

      {/* 既存タイムライン一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {community.timelines.map((tl) => (
          <TimelineRow
            key={tl.id}
            community={community}
            timeline={tl}
            modeOptions={modeOptions}
            expanded={editingId === tl.id}
            onExpand={() => setEditingId(editingId === tl.id ? null : tl.id)}
            onRemove={() => onRemove(tl.id, tl.name)}
            onChanged={() => {
              setEditingId(null);
              onChanged();
            }}
            onError={onError}
          />
        ))}
      </div>

      {/* 新規作成 */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          background: 'var(--surface-2, transparent)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>＋ 新しいタイムラインを追加</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="タイムライン名 (例: 雑談)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              flex: '1 1 180px',
            }}
          />
          <select
            value={newVis}
            onChange={(e) => {
              const v = e.target.value as TimelineVisibility;
              setNewVis(v);
              if (v !== 'selected_users') setNewUserIds([]);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
          >
            {modeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={addTimeline} disabled={saving || !newName.trim()}>
            {saving ? '追加中…' : '追加'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          {modeOptions.find((o) => o.value === newVis)?.hint}
        </div>
        {newVis === 'selected_users' && (
          <div style={{ marginTop: 10 }}>
            <MemberPicker
              members={community.members}
              selected={newUserIds}
              onToggle={(id) =>
                setNewUserIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineRow({
  community,
  timeline,
  modeOptions,
  expanded,
  onExpand,
  onRemove,
  onChanged,
  onError,
}: {
  community: CommunityFull;
  timeline: CommunityTimeline;
  modeOptions: { value: TimelineVisibility; label: string; hint: string }[];
  expanded: boolean;
  onExpand: () => void;
  onRemove: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const initialUserIds = (timeline.visibilityUserIds || '')
    .split(',')
    .filter(Boolean);
  const [vis, setVis] = useState<TimelineVisibility>(timeline.visibility);
  const [userIds, setUserIds] = useState<string[]>(initialUserIds);
  const [saving, setSaving] = useState(false);

  // timeline が外から更新されたら state を同期
  useEffect(() => {
    setVis(timeline.visibility);
    setUserIds((timeline.visibilityUserIds || '').split(',').filter(Boolean));
  }, [timeline.id, timeline.visibility, timeline.visibilityUserIds]);

  const dirty =
    vis !== timeline.visibility ||
    (vis === 'selected_users' &&
      userIds.slice().sort().join(',') !== initialUserIds.slice().sort().join(','));

  const save = async () => {
    if (vis === 'selected_users' && userIds.length === 0) {
      onError('対象ユーザーを 1 人以上選んでください');
      return;
    }
    setSaving(true);
    try {
      await api.updateTimeline(community.id, timeline.id, {
        visibility: vis,
        visibilityUserIds: vis === 'selected_users' ? userIds : undefined,
      });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const visLabel =
    modeOptions.find((o) => o.value === timeline.visibility)?.label ||
    timeline.visibility;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 600 }}># {timeline.name}</span>
        <span className="tag" style={{ fontSize: 12 }}>{visLabel}</span>
        <button className="btn btn-ghost" onClick={onExpand}>
          {expanded ? '閉じる' : '編集'}
        </button>
        {timeline.name !== 'ホーム' && (
          <button className="btn btn-danger" onClick={onRemove}>削除</button>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: 'var(--muted)' }}>公開範囲:</label>
            <select
              value={vis}
              onChange={(e) => {
                const v = e.target.value as TimelineVisibility;
                setVis(v);
                if (v !== 'selected_users') setUserIds([]);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            >
              {modeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="btn" disabled={!dirty || saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            {modeOptions.find((o) => o.value === vis)?.hint}
          </div>
          {vis === 'selected_users' && (
            <div style={{ marginTop: 10 }}>
              <MemberPicker
                members={community.members}
                selected={userIds}
                onToggle={(id) =>
                  setUserIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  )
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberPicker({
  members,
  selected,
  onToggle,
}: {
  members: CommunityMember[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (members.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>
        メンバーがまだいません
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
        対象メンバーを選択 (代表は常にアクセス可)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {members.map((m) => {
          const on = selected.includes(m.id);
          return (
            <label
              key={m.id}
              className={`tag${on ? ' tag-on' : ''}`}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: on ? 'var(--accent)' : 'transparent',
                color: on ? '#fff' : 'inherit',
                fontSize: 14,
              }}
              title={m.role === 'owner' ? '代表は常にアクセス可' : undefined}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(m.id)}
                style={{ display: 'none' }}
              />
              {m.role === 'owner' ? '★ ' : ''}{m.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}
