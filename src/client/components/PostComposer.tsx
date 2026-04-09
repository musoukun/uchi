import React, { useRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { api } from '../api';
import type { Post } from '../types';

// Crepe を React にマウントする内部コンポーネント。
// onChange は最新を ref で参照する (useEditor の初回1回しか走らないため)。
function CrepeView({
  onChangeRef,
  resetKey,
}: {
  onChangeRef: React.MutableRefObject<(md: string) => void>;
  resetKey: number;
}) {
  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: '',
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: 'このコミュニティに投稿…  (Markdown / 見出し / リスト / コード OK)',
          mode: 'block',
        },
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });
    return crepe;
    // resetKey が変わったら親側で remount するのでここは依存不要
  }, []);

  return <Milkdown />;
}

export function PostComposer({
  communityId,
  timelineId,
  onPosted,
}: {
  communityId: string;
  timelineId: string;
  onPosted: (p: Post) => void;
}) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 投稿後にエディタを空に戻すための remount キー
  const [resetKey, setResetKey] = useState(0);

  const bodyRef = useRef(body);
  bodyRef.current = body;

  const onChangeRef = useRef((md: string) => setBody(md));
  onChangeRef.current = (md: string) => setBody(md);

  const submit = async () => {
    const trimmed = bodyRef.current.trim();
    if (!trimmed) return;
    setPosting(true);
    setErr(null);
    try {
      const p = await api.createPost({ body: trimmed, communityId, timelineId });
      setBody('');
      setResetKey((k) => k + 1);
      onPosted(p);
    } catch (e: any) {
      setErr(e.message || '投稿に失敗しました');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="post-composer">
      <div
        className="post-composer-editor"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
      >
        <MilkdownProvider key={resetKey}>
          <CrepeView onChangeRef={onChangeRef} resetKey={resetKey} />
        </MilkdownProvider>
      </div>
      <div className="post-composer-foot">
        <span className="post-composer-hint">
          {body.length} 文字 · Ctrl+Enter で投稿
        </span>
        {err && <span className="post-composer-err">{err}</span>}
        <button
          className="btn"
          disabled={posting || !body.trim()}
          onClick={submit}
        >
          {posting ? '投稿中…' : '投稿する'}
        </button>
      </div>
    </div>
  );
}
