// Socket.IO 初期化・認証・チャットイベントハンドラ
// Rocket.Chat の DDP streamer + notifications.module に相当

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { validateSession, SESSION_COOKIE } from './session';
import { prisma } from './db';
import { EVENTS, socketRoomId } from './socket-events';
import type { User } from '@prisma/client';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    cors: { origin: false },
  });

  // ---- 認証ミドルウェア: uchi_session Cookie で検証 ----
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie ?? '';
      const cookies = parseCookie(cookieHeader);
      const sid = cookies[SESSION_COOKIE];
      if (!sid) return next(new Error('not authenticated'));

      const result = await validateSession(sid);
      if (!result) return next(new Error('session expired'));

      socket.data.user = result.user;
      next();
    } catch {
      next(new Error('auth error'));
    }
  });

  // ---- 接続ハンドラ ----
  io.on('connection', (socket) => {
    const user = socket.data.user as User;

    // ユーザー固有ルームに参加 (通知等で使用)
    socket.join(`user:${user.id}`);

    // --- chat:join — チャットルームに接続 ---
    socket.on(EVENTS.JOIN_ROOM, async (roomId: string) => {
      // メンバーシップ確認
      const member = await prisma.chatRoomMember.findUnique({
        where: { userId_roomId: { userId: user.id, roomId } },
      });
      if (!member) return;
      socket.join(socketRoomId(roomId));
    });

    // --- chat:leave — チャットルームから切断 ---
    socket.on(EVENTS.LEAVE_ROOM, (roomId: string) => {
      socket.leave(socketRoomId(roomId));
    });

    // --- chat:message — メッセージ送信 ---
    socket.on(EVENTS.SEND_MESSAGE, async (data: { roomId: string; body: string }, ack?: (res: any) => void) => {
      try {
        const { roomId, body } = data;
        if (!body?.trim()) return;

        // メンバーシップ確認
        const member = await prisma.chatRoomMember.findUnique({
          where: { userId_roomId: { userId: user.id, roomId } },
        });
        if (!member) return;

        const trimmed = body.trim().slice(0, 50000);

        // DB 保存
        const msg = await prisma.chatMessage.create({
          data: { roomId, authorId: user.id, body: trimmed },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        });

        // ルームの lastMessage 非正規化 + messageCount 更新
        await prisma.chatRoom.update({
          where: { id: roomId },
          data: {
            lastMessageId: msg.id,
            lastMessageAt: msg.createdAt,
            lastMessageBody: trimmed.slice(0, 100),
            lastMessageAuthor: user.name,
            messageCount: { increment: 1 },
          },
        });

        // 自分以外のメンバーの unreadCount をインクリメント
        await prisma.chatRoomMember.updateMany({
          where: { roomId, userId: { not: user.id } },
          data: { unreadCount: { increment: 1 } },
        });

        const payload = serializeMessage(msg, user.id);

        // ルーム全員にブロードキャスト (RC: room-messages stream)
        io!.to(socketRoomId(roomId)).emit(EVENTS.NEW_MESSAGE, payload);

        if (ack) ack({ ok: true, message: payload });
      } catch (e) {
        console.error('[socket] chat:message error', e);
        if (ack) ack({ ok: false, error: 'failed to send' });
      }
    });

    // --- chat:message:edit — メッセージ編集 ---
    socket.on(EVENTS.EDIT_MESSAGE, async (data: { roomId: string; messageId: string; body: string }, ack?: (res: any) => void) => {
      try {
        const { roomId, messageId, body } = data;
        const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
        if (!msg || msg.authorId !== user.id || msg.roomId !== roomId) return;

        const updated = await prisma.chatMessage.update({
          where: { id: messageId },
          data: { body: body.trim().slice(0, 50000), editedAt: new Date() },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        });

        io!.to(socketRoomId(roomId)).emit(EVENTS.MESSAGE_EDITED, serializeMessage(updated, user.id));
        if (ack) ack({ ok: true });
      } catch (e) {
        console.error('[socket] chat:message:edit error', e);
        if (ack) ack({ ok: false });
      }
    });

    // --- chat:message:delete — メッセージ削除 ---
    socket.on(EVENTS.DELETE_MESSAGE, async (data: { roomId: string; messageId: string }, ack?: (res: any) => void) => {
      try {
        const { roomId, messageId } = data;
        const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
        if (!msg || msg.roomId !== roomId) return;

        // 自分のメッセージ or ルームオーナーなら削除可
        const member = await prisma.chatRoomMember.findUnique({
          where: { userId_roomId: { userId: user.id, roomId } },
        });
        if (msg.authorId !== user.id && member?.role !== 'owner') return;

        await prisma.chatMessage.delete({ where: { id: messageId } });

        io!.to(socketRoomId(roomId)).emit(EVENTS.MESSAGE_DELETED, { roomId, messageId });
        if (ack) ack({ ok: true });
      } catch (e) {
        console.error('[socket] chat:message:delete error', e);
        if (ack) ack({ ok: false });
      }
    });

    // --- chat:typing — タイピング表示 (RC: user-activity, 非永続) ---
    socket.on(EVENTS.TYPING, (data: { roomId: string; isTyping: boolean }) => {
      socket.to(socketRoomId(data.roomId)).emit(EVENTS.TYPING_STATUS, {
        roomId: data.roomId,
        userId: user.id,
        userName: user.name,
        isTyping: data.isTyping,
      });
    });

    // --- chat:reaction — リアクショントグル ---
    socket.on(EVENTS.TOGGLE_REACTION, async (data: { roomId: string; messageId: string; emoji: string }, ack?: (res: any) => void) => {
      try {
        const { roomId, messageId, emoji } = data;
        if (!emoji) return;

        const member = await prisma.chatRoomMember.findUnique({
          where: { userId_roomId: { userId: user.id, roomId } },
        });
        if (!member) return;

        // トグル
        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
        });

        if (existing) {
          await prisma.messageReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.messageReaction.create({
            data: { messageId, userId: user.id, emoji },
          });
        }

        // リアクション一覧を再取得してブロードキャスト
        const reactions = await getMessageReactions(messageId, user.id);
        io!.to(socketRoomId(roomId)).emit(EVENTS.REACTION_UPDATE, {
          roomId,
          messageId,
          reactions,
        });

        if (ack) ack({ ok: true, toggled: !existing });
      } catch (e) {
        console.error('[socket] chat:reaction error', e);
        if (ack) ack({ ok: false });
      }
    });

    // --- chat:read — 既読更新 (RC: ISubscription.unread + ls) ---
    socket.on(EVENTS.MARK_READ, async (data: { roomId: string }) => {
      try {
        await prisma.chatRoomMember.update({
          where: { userId_roomId: { userId: user.id, roomId: data.roomId } },
          data: { unreadCount: 0, lastReadAt: new Date() },
        });
      } catch {
        // ignore
      }
    });

    socket.on('disconnect', () => {
      // cleanup if needed
    });
  });

  return io;
}

// ---- ヘルパー ----

function serializeMessage(msg: any, meId: string) {
  return {
    id: msg.id,
    roomId: msg.roomId,
    body: msg.body,
    type: msg.type,
    authorId: msg.authorId,
    author: msg.author,
    editedAt: msg.editedAt,
    isMine: msg.authorId === meId,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    reactions: [],  // 新着メッセージにはリアクションなし
  };
}

// メッセージのリアクションをグループ化して返す (RC: reactions dict 相当)
export async function getMessageReactions(messageId: string, meId: string) {
  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    include: { user: { select: { id: true, name: true } } },
  });

  // { emoji: { count, users, reacted } } にグループ化
  const groups = new Map<string, { emoji: string; count: number; userIds: string[]; userNames: string[]; reacted: boolean }>();
  for (const r of reactions) {
    let g = groups.get(r.emoji);
    if (!g) {
      g = { emoji: r.emoji, count: 0, userIds: [], userNames: [], reacted: false };
      groups.set(r.emoji, g);
    }
    g.count++;
    g.userIds.push(r.user.id);
    g.userNames.push(r.user.name);
    if (r.userId === meId) g.reacted = true;
  }

  return Array.from(groups.values());
}
