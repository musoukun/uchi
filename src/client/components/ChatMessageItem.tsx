import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { ReactionBar } from './ReactionBar';
import { ReactionPicker } from './ReactionPicker';
import type { ChatMessage } from '../types';

type Props = {
  message: ChatMessage;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => void;
  onDelete?: (messageId: string) => void;
};

export function ChatMessageItem({ message, onToggleReaction, onEdit, onDelete }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [showMenu, setShowMenu] = useState(false);

  if (message.type === 'system') {
    return (
      <div className="chat-msg-system">
        <span>{message.body}</span>
      </div>
    );
  }

  const handleSaveEdit = () => {
    if (editBody.trim() && onEdit) {
      onEdit(message.id, editBody.trim());
    }
    setEditing(false);
  };

  const ts = new Date(message.createdAt);
  const timeStr = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className={`chat-msg${message.isMine ? ' mine' : ''}`}>
      {!message.isMine && (
        <Link to={`/users/${message.authorId}`} className="chat-msg-avatar">
          <Avatar user={message.author} size={32} />
        </Link>
      )}
      <div className="chat-msg-content">
        {!message.isMine && (
          <div className="chat-msg-author">{message.author.name}</div>
        )}
        {editing ? (
          <div className="chat-msg-edit">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={2}
            />
            <div className="chat-msg-edit-actions">
              <button className="btn-sm" onClick={handleSaveEdit}>保存</button>
              <button className="btn-sm btn-ghost" onClick={() => setEditing(false)}>キャンセル</button>
            </div>
          </div>
        ) : (
          <div className="chat-msg-bubble">
            <span className="chat-msg-text">{message.body}</span>
            {message.editedAt && <span className="chat-msg-edited">(編集済)</span>}
            {message.isMine && (
              <button
                className="chat-msg-menu-btn"
                onClick={() => setShowMenu((v) => !v)}
              >
                ⋯
              </button>
            )}
            {showMenu && message.isMine && (
              <div className="chat-msg-menu">
                <button onClick={() => { setEditing(true); setEditBody(message.body); setShowMenu(false); }}>
                  編集
                </button>
                <button onClick={() => { if (onDelete) onDelete(message.id); setShowMenu(false); }}>
                  削除
                </button>
              </div>
            )}
          </div>
        )}
        <div className="chat-msg-meta">
          <span className="chat-msg-time">{timeStr}</span>
        </div>
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
    </div>
  );
}
