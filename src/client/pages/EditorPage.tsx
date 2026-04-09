import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { renderMd } from '../markdown';
import { TagInput } from '../components/TagInput';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function EditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📝');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [type, setType] = useState<'tech' | 'idea'>('tech');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setBody((b) => b + snippet);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setBody((b) => b.slice(0, start) + snippet + b.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.selectionStart = ta.selectionEnd = pos;
    });
  }, []);

  const uploadAndInsert = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        alert('ファイルサイズは 50MB までです');
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('画像ファイルのみアップロードできます');
        return;
      }
      setUploading(true);
      try {
        const r = await api.uploadFile(file);
        const alt = file.name.replace(/\.[^.]+$/, '');
        insertAtCursor(`![${alt}](${r.url})\n`);
      } catch (e: any) {
        alert('アップロード失敗: ' + e.message);
      } finally {
        setUploading(false);
      }
    },
    [insertAtCursor]
  );

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.dataTransfer?.files || []);
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (imgs.length === 0) return;
      e.preventDefault();
      for (const f of imgs) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgs = items
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (imgs.length === 0) return;
      e.preventDefault();
      for (const f of imgs) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  useEffect(() => {
    if (!id) return;
    api.getArticle(id).then((a) => {
      if (!a) return;
      setTitle(a.title || '');
      setEmoji(a.emoji || '📝');
      setBody(a.body || '');
      setTopics((a.topics || []).map((t) => t.name));
      setType((a.type as 'tech' | 'idea') || 'tech');
      setLoaded(true);
    });
  }, [id]);

  const save = useCallback(
    async (published: boolean) => {
      if (published) {
        if (!title.trim()) {
          alert('タイトルを入力してください');
          return;
        }
        if (topics.length === 0) {
          alert('トピックを最低1つ入力してください');
          return;
        }
        if (type !== 'tech' && type !== 'idea') {
          alert('カテゴリ(Tech/Idea)を選んでください');
          return;
        }
      }
      setSaving(true);
      const payload = { title, emoji, type, body, topicNames: topics, published };
      try {
        const a = id
          ? await api.updateArticle(id, payload)
          : await api.createArticle(payload);
        if (published) nav('/articles/' + a.id);
        else alert('下書き保存しました');
      } catch (e: any) {
        alert('保存失敗: ' + e.message);
      } finally {
        setSaving(false);
      }
    },
    [id, title, emoji, type, body, topics, nav]
  );

  if (!loaded) return <div className="container-wide"><div className="loading">読み込み中…</div></div>;

  return (
    <div className="container-wide">
      <div className="editor-toolbar">
        <input
          type="text"
          style={{ width: 60, textAlign: 'center', fontSize: 24 }}
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            style={{
              padding: '8px 16px',
              border: 0,
              background: type === 'tech' ? 'var(--tech)' : '#fff',
              color: type === 'tech' ? '#fff' : 'var(--muted)',
              fontWeight: 700,
            }}
            onClick={() => setType('tech')}
          >
            Tech
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              border: 0,
              borderLeft: '1px solid var(--border)',
              background: type === 'idea' ? 'var(--idea)' : '#fff',
              color: type === 'idea' ? '#fff' : 'var(--muted)',
              fontWeight: 700,
            }}
            onClick={() => setType('idea')}
          >
            Idea
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <TagInput
            value={topics}
            onChange={setTopics}
            max={5}
            placeholder="タグを入力してTab/Enter (最大5)"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={uploading}
          onClick={onPickFile}
          title="画像/GIFを挿入 (最大50MB)"
        >
          {uploading ? 'アップロード中…' : '🖼 画像'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <button className="btn btn-ghost" disabled={saving} onClick={() => save(false)}>
          下書き保存
        </button>
        <button className="btn" disabled={saving} onClick={() => save(true)}>
          {saving ? '保存中…' : '公開する'}
        </button>
      </div>
      <input
        className="title-input"
        placeholder="タイトル (必須)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="editor-wrap">
        <div className="editor-pane">
          <textarea
            ref={textareaRef}
            placeholder="# 本文をMarkdownで… (画像は貼り付け / ドロップ / 🖼ボタン)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onDrop={onDrop}
            onPaste={onPaste}
          />
        </div>
        <div className="preview-pane md" dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
      </div>
    </div>
  );
}
