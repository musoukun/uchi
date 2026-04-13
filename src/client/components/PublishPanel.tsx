import React, { useEffect, useRef, useState } from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { TagInput } from './TagInput';
import type { CommunityTimeline } from '../types';

// 「公開設定」パネル (右からスライドイン)
// mode='article' : 記事公開 (emoji / topics / category / visibility / scheduledAt)
// mode='community': コミュニティ投稿 (emoji / topics / timeline / scheduledAt)

type CommonProps = {
  open: boolean;
  onClose: () => void;
  emoji: string;
  setEmoji: (v: string) => void;
  topics: string[];
  setTopics: (v: string[]) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  onPublish: () => void;
  saving: boolean;
};

type ArticleProps = CommonProps & {
  mode?: 'article';
  type: 'howto' | 'diary';
  setType: (v: 'howto' | 'diary') => void;
  // 公開範囲: 全体公開 or 友達のみ
  visibility: 'public' | 'friends_only';
  setVisibility: (v: 'public' | 'friends_only') => void;
};

type CommunityProps = CommonProps & {
  mode: 'community';
  communityName: string;
  timelines: CommunityTimeline[];
  timelineId: string;
  setTimelineId: (v: string) => void;
};

export type PublishPanelProps = ArticleProps | CommunityProps;

export function PublishPanel(props: PublishPanelProps) {
  const {
    open,
    onClose,
    emoji,
    setEmoji,
    topics,
    setTopics,
    scheduledAt,
    setScheduledAt,
    onPublish,
    saving,
  } = props;

  const mode = 'mode' in props && props.mode === 'community' ? 'community' : 'article';

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  // 外側クリックで EmojiPicker を閉じる
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  if (!open) return null;

  // 公開ボタンのバリデーション (コミュニティモードはトピック不要)
  const needsTopic = mode === 'article' && topics.length === 0;
  const hint = needsTopic ? 'トピックを設定してください' : null;
  const canPublish = !saving && !needsTopic;

  const publishLabel = saving
    ? '保存中…'
    : scheduledAt
      ? '予約する'
      : mode === 'community'
        ? 'タイムラインに公開'
        : '公開する';

  return (
    <>
      <div className="publish-panel-backdrop" onClick={onClose} />
      <aside className="publish-panel">
        <div className="publish-panel-head">
          <button
            type="button"
            className="publish-panel-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
          <h3>{mode === 'community' ? 'コミュニティ公開設定' : '公開設定'}</h3>
        </div>
        <div className="publish-panel-body">
          {/* 記事アイコン */}
          <section className="publish-panel-section">
            <label className="publish-panel-label">記事アイコンを設定</label>
            <div className="publish-panel-emoji-row" ref={pickerWrapRef}>
              <button
                type="button"
                className="publish-panel-emoji-trigger"
                onClick={() => setPickerOpen((v) => !v)}
                aria-label="絵文字を選ぶ"
              >
                <span className="publish-panel-emoji-trigger-icon">{emoji || '📝'}</span>
                <span className="publish-panel-emoji-trigger-label">
                  クリックして絵文字を選ぶ
                </span>
              </button>
              {pickerOpen && (
                <div className="publish-panel-emoji-popover">
                  <EmojiPicker
                    onEmojiClick={(data) => {
                      setEmoji(data.emoji);
                      setPickerOpen(false);
                    }}
                    emojiStyle={EmojiStyle.NATIVE}
                    theme={Theme.LIGHT}
                    width={340}
                    height={400}
                    lazyLoadEmojis
                    searchPlaceholder="絵文字を検索..."
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
          </section>

          {/* トピック */}
          <section className="publish-panel-section">
            <label className="publish-panel-label">
              トピック <span className="publish-panel-sub">関連する技術や言語を選びましょう</span>
            </label>
            <TagInput
              value={topics}
              onChange={setTopics}
              max={5}
              placeholder="トピックを入力 (Tab/Enter)"
            />
          </section>

          {/* === 記事モード: カテゴリー + 公開範囲 === */}
          {mode === 'article' && (
            <>
              <section className="publish-panel-section">
                <label className="publish-panel-label">
                  カテゴリー <span className="publish-panel-sub">選択</span>
                </label>
                <div className="publish-panel-category">
                  <button
                    type="button"
                    className={'publish-panel-cat-card' + ((props as ArticleProps).type === 'howto' ? ' active' : '')}
                    onClick={() => (props as ArticleProps).setType('howto')}
                  >
                    <div className="publish-panel-cat-title">Howto</div>
                    <div className="publish-panel-cat-desc">
                      実装手順・ハンズオン・ツールの使い方など「やってみた / やり方」系のメモ
                    </div>
                  </button>
                  <button
                    type="button"
                    className={'publish-panel-cat-card' + ((props as ArticleProps).type === 'diary' ? ' active' : '')}
                    onClick={() => (props as ArticleProps).setType('diary')}
                  >
                    <div className="publish-panel-cat-title">Diary</div>
                    <div className="publish-panel-cat-desc">
                      業務の経緯・ふりかえり・ドメイン知識・雑感など「物語性のある」記事
                    </div>
                  </button>
                </div>
              </section>

              <section className="publish-panel-section">
                <label className="publish-panel-label">公開範囲</label>
                <select
                  value={(props as ArticleProps).visibility}
                  onChange={(e) => (props as ArticleProps).setVisibility(e.target.value as any)}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 15, width: '100%' }}
                >
                  <option value="public">🌐 全体公開</option>
                  <option value="friends_only">🤝 友達のみ (相互フォロー)</option>
                </select>
                {(props as ArticleProps).visibility === 'friends_only' && (
                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
                    お互いにフォローしているユーザーだけが閲覧できます
                  </div>
                )}
              </section>
            </>
          )}

          {/* === コミュニティモード: コミュニティ名 + タイムライン選択 === */}
          {mode === 'community' && (
            <>
              <section className="publish-panel-section">
                <label className="publish-panel-label">コミュニティ</label>
                <div style={{ padding: '8px 12px', background: 'var(--accent-soft-10)', borderRadius: 8, border: '1px solid rgba(95,207,220,.3)', fontWeight: 700, fontSize: 15 }}>
                  {(props as CommunityProps).communityName}
                </div>
              </section>

              <section className="publish-panel-section">
                <label className="publish-panel-label">投稿先タイムライン</label>
                <select
                  value={(props as CommunityProps).timelineId}
                  onChange={(e) => (props as CommunityProps).setTimelineId(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 15, width: '100%' }}
                >
                  {(props as CommunityProps).timelines.map((tl) => (
                    <option key={tl.id} value={tl.id}># {tl.name}</option>
                  ))}
                </select>
              </section>
            </>
          )}

          {/* 公開予約 (共通) */}
          <section className="publish-panel-section">
            <label className="publish-panel-label">公開予約</label>
            <div className="publish-panel-schedule-row">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="publish-panel-schedule-input"
              />
              {scheduledAt && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setScheduledAt('')}
                >
                  クリア
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="publish-panel-footer">
          {hint && <div className="publish-panel-hint">{hint}</div>}
          <button
            type="button"
            className="btn publish-panel-submit"
            disabled={!canPublish}
            onClick={onPublish}
          >
            {publishLabel}
          </button>
        </div>
      </aside>
    </>
  );
}
