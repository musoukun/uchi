import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import { api } from '../api';
import type { ChatMessage, ReactionGroup } from '../types';

const EVENTS = {
  JOIN_ROOM: 'chat:join',
  LEAVE_ROOM: 'chat:leave',
  SEND_MESSAGE: 'chat:message',
  EDIT_MESSAGE: 'chat:message:edit',
  DELETE_MESSAGE: 'chat:message:delete',
  TYPING: 'chat:typing',
  TOGGLE_REACTION: 'chat:reaction',
  MARK_READ: 'chat:read',
  REACTION_UPDATE: 'chat:reaction',
  MEMBER_JOINED: 'chat:member:join',
  MEMBER_LEFT: 'chat:member:leave',
} as const;

type TypingUser = { userId: string; userName: string };

export function useChatRoom(roomId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 初回: REST で履歴ロード
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getChatMessages(roomId).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setHasMore(msgs.length >= 50);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [roomId]);

  // Socket.IO 接続・購読
  useEffect(() => {
    const socket = getSocket();

    socket.emit(EVENTS.JOIN_ROOM, roomId);

    const onMessage = (msg: ChatMessage) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // 既読通知
      socket.emit(EVENTS.MARK_READ, { roomId });
    };

    const onMessageEdited = (msg: ChatMessage) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => prev.map((m) => m.id === msg.id ? msg : m));
    };

    const onMessageDeleted = (data: { roomId: string; messageId: string }) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const onTyping = (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => {
      if (data.roomId !== roomId) return;
      if (data.isTyping) {
        setTypingUsers((prev) => {
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, userName: data.userName }];
        });
        // 3秒後に自動クリア
        const existing = typingTimeouts.current.get(data.userId);
        if (existing) clearTimeout(existing);
        typingTimeouts.current.set(
          data.userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
            typingTimeouts.current.delete(data.userId);
          }, 3000)
        );
      } else {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        const existing = typingTimeouts.current.get(data.userId);
        if (existing) { clearTimeout(existing); typingTimeouts.current.delete(data.userId); }
      }
    };

    const onReactionUpdate = (data: { roomId: string; messageId: string; reactions: ReactionGroup[] }) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)
      );
    };

    socket.on(EVENTS.SEND_MESSAGE, onMessage);
    socket.on(EVENTS.EDIT_MESSAGE, onMessageEdited);
    socket.on(EVENTS.DELETE_MESSAGE, onMessageDeleted);
    socket.on(EVENTS.TYPING, onTyping);
    socket.on(EVENTS.REACTION_UPDATE, onReactionUpdate);

    // 既読マーク
    socket.emit(EVENTS.MARK_READ, { roomId });

    return () => {
      socket.emit(EVENTS.LEAVE_ROOM, roomId);
      socket.off(EVENTS.SEND_MESSAGE, onMessage);
      socket.off(EVENTS.EDIT_MESSAGE, onMessageEdited);
      socket.off(EVENTS.DELETE_MESSAGE, onMessageDeleted);
      socket.off(EVENTS.TYPING, onTyping);
      socket.off(EVENTS.REACTION_UPDATE, onReactionUpdate);
      // cleanup typing timeouts
      typingTimeouts.current.forEach((t) => clearTimeout(t));
      typingTimeouts.current.clear();
    };
  }, [roomId]);

  // メッセージ送信
  const sendMessage = useCallback(
    (body: string) => {
      const socket = getSocket();
      socket.emit(EVENTS.SEND_MESSAGE, { roomId, body });
    },
    [roomId]
  );

  // メッセージ編集
  const editMessage = useCallback(
    (messageId: string, body: string) => {
      const socket = getSocket();
      socket.emit(EVENTS.EDIT_MESSAGE, { roomId, messageId, body });
    },
    [roomId]
  );

  // メッセージ削除
  const deleteMessage = useCallback(
    (messageId: string) => {
      const socket = getSocket();
      socket.emit(EVENTS.DELETE_MESSAGE, { roomId, messageId });
    },
    [roomId]
  );

  // タイピング通知
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const socket = getSocket();
      socket.emit(EVENTS.TYPING, { roomId, isTyping });
    },
    [roomId]
  );

  // リアクショントグル
  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const socket = getSocket();
      socket.emit(EVENTS.TOGGLE_REACTION, { roomId, messageId, emoji });
    },
    [roomId]
  );

  // 過去メッセージ読み込み
  const loadMore = useCallback(async () => {
    if (!hasMore || messages.length === 0) return;
    const oldest = messages[0];
    const older = await api.getChatMessages(roomId, oldest.id);
    setHasMore(older.length >= 50);
    setMessages((prev) => [...older, ...prev]);
  }, [roomId, messages, hasMore]);

  return {
    messages,
    typingUsers,
    loading,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    toggleReaction,
    loadMore,
  };
}
