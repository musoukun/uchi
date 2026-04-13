import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { ReactionBar } from './ReactionBar';
import { ReactionPicker } from './ReactionPicker';
import type { ChatMessage } from '../types';

type Props = {
  message: ChatMessage;
  /** 直前のメッセージと同一著者 & 5分以内ならtrue → アバター・名前を省略 */
  grouped: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => void;
  onDelete?: (messageId: string) => void;
};

export function ChatMessageItem({ message, grouped, onToggleReaction, onEdit, onDelete }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [hovered, setHovered] = useState(false);

  // --- システムメッセージ ---
  if (message.type === 'system' || message.type === 'meet') {
    return (
      <div className="dc-msg-system">
        <span>{message.body}</span>
      </div>
    );
  }

  const ts = new Date(message.createdAt);
  const timeStr = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;
  const fullDate = `${ts.getFullYear()}/${(ts.getMonth() + 1).toString().padStart(2, '0')}/${ts.getDate().toString().padStart(2, '0')} ${timeStr}`;

  const handleSaveEdit = () => {
    if (editBody.trim() && onEdit) onEdit(message.id, editBody.trim());
    setEditing(false);
  };

  return (
    <div
      className={`dc-msg${grouped ? ' dc-msg-grouped' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* アバター列 (グルーピング時は時刻をホバーで表示) */}
      <div className="dc-msg-gutter">
        {grouped ? (
          <span className="dc-msg-time-inline" title={fullDate}>
            {hovered ? timeStr : ''}
          </span>
        ) : (
          <Link to={`/users/${message.authorId}`} className="dc-msg-avatar">
            <Avatar user={message.author} size={40} />
          </Link>
        )}
      </div>

      {/* 本文列 */}
      <div className="dc-msg-body">
        {/* 名前 + 時刻ヘッダー (非グルーピング時のみ) */}
        {!grouped && (
          <div className="dc-msg-header">
            <Link to={`/users/${message.authorId}`} className="dc-msg-author">
              {message.author.name}
            </Link>
            <time className="dc-msg-timestamp" title={fullDate}>{fullDate}</time>
          </div>
        )}

        {/* メッセージ本文 */}
        {editing ? (
          <div className="dc-msg-edit">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={2}
              autoFocus
            />
            <div className="dc-msg-edit-hint">
              Escape でキャンセル・Enter で保存
            </div>
          </div>
        ) : (
          <div className="dc-msg-text">
            {message.body}
            {message.editedAt && <span className="dc-msg-edited">(編集済)</span>}
          </div>
        )}

        {/* リアクション */}
        <ReactionBar
          reactions={message.reactions}
          onToggle={(emoji) => onToggleReaction(message.id, emoji)}
          onPickerOpen={() => setShowPicker(true)}
        />
        {showPicker && (
          <ReactionPicker
            onSelect={(emoji) => onToggleReaction(message.id, emoji)}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      {/* ホバー時のアクションバー (Discord風) */}
      {hovered && !editing && (
        <div className="dc-msg-actions">
          <button title="リアクション" onClick={() => setShowPicker(true)}>😀</button>
          {onEdit && <button title="編集" onClick={() => { setEditing(true); setEditBody(message.body); }}>✏️</button>}
          {onDelete && <button title="削除" onClick={() => onDelete(message.id)}>🗑️</button>}
        </div>
      )}
    </div>
  );
}

/** 日付区切り線コンポーネント */
export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="dc-date-sep">
      <span>{date}</span>
    </div>
  );
}
