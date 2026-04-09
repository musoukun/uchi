import React, { useState } from 'react';
import { api } from '../api';
import type { Post } from '../types';

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

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setErr(null);
    try {
      const p = await api.createPost({ body: body.trim(), communityId, timelineId });
      setBody('');
      onPosted(p);
    } catch (e: any) {
      setErr(e.message || '投稿に失敗しました');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="post-composer">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="このコミュニティに投稿…  (Markdown OK / URL は自動でリンクになります)"
        rows={3}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
      />
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
