import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
};

// 既存トピック名のキャッシュ (EditorPage を再マウントしても無駄に再取得しない)
let topicsCache: string[] | null = null;
let topicsPromise: Promise<string[]> | null = null;

async function loadTopics(): Promise<string[]> {
  if (topicsCache) return topicsCache;
  if (!topicsPromise) {
    topicsPromise = api.listTopics().then((ts) => {
      topicsCache = ts.map((t) => t.name);
      return topicsCache;
    });
  }
  return topicsPromise;
}

export function TagInput({ value, onChange, max = 5, placeholder }: Props) {
  const [input, setInput] = useState('');
  const [allTopics, setAllTopics] = useState<string[]>(topicsCache || []);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTopics().then((ts) => setAllTopics(ts));
  }, []);

  // 外側クリックで候補を閉じる
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return allTopics
      .filter((t) => t.toLowerCase().includes(q) && !taken.has(t.toLowerCase()))
      .slice(0, 8);
  }, [input, allTopics, value]);

  function addTag(name: string) {
    const n = name.trim();
    if (!n) return;
    if (value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, n]);
    setInput('');
    setOpen(false);
    setActive(0);
    // キャッシュにも乗せる (ローカルだけの暫定追加)
    if (!allTopics.some((t) => t.toLowerCase() === n.toLowerCase())) {
      const next = [...allTopics, n];
      setAllTopics(next);
      topicsCache = next;
    }
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (input.trim()) {
        e.preventDefault();
        const pick = open && suggestions[active] ? suggestions[active] : input;
        addTag(pick);
      } else if (e.key === 'Tab') {
        // 入力が空ならフォーカス移動を許可
        return;
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const full = value.length >= max;

  return (
    <div className="tag-input" ref={wrapRef}>
      <div className="tag-input-row" onClick={() => inputRef.current?.focus()}>
        {value.map((tag, i) => (
          <span key={tag + i} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-chip-x"
              aria-label={`${tag} を削除`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
            >
              ×
            </button>
          </span>
        ))}
        {!full && (
          <input
            ref={inputRef}
            className="tag-input-field"
            type="text"
            value={input}
            placeholder={value.length === 0 ? placeholder || 'タグを入力してTab/Enter' : ''}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="tag-suggest">
          {suggestions.map((s, i) => (
            <div
              key={s}
              className={'tag-suggest-item' + (i === active ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
