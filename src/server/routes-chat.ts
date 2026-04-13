// チャットルーム REST API (Socket.IO と併用)
// ルーム管理・履歴取得など ステートレスな操作を担当

import { Hono } from 'hono';
import { prisma } from './db';
import { requireAuth } from './auth';
import { getIO, getMessageReactions } from './socket';
import { EVENTS, socketRoomId } from './socket-events';
import type { User } from '@prisma/client';

export const chatRoutes = new Hono<{ Variables: { user: User | null } }>();

// ---------- ルーム一覧 (自分が参加中) ----------

chatRoutes.get('/rooms', requireAuth, async (c) => {
  const me = c.get('user')!;

  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId: me.id },
    include: {
      room: true,
    },
    orderBy: { room: { lastMessageAt: 'desc' } },
  });

  return c.json(
    memberships.map((m) => ({
      id: m.room.id,
      name: m.room.name,
      description: m.room.description,
      emoji: m.room.emoji,
      avatarUrl: m.room.avatarUrl,
      visibility: m.room.visibility,
      messageCount: m.room.messageCount,
      lastMessage: m.room.lastMessageId
        ? {
            body: m.room.lastMessageBody,
            authorName: m.room.lastMessageAuthor,
            createdAt: m.room.lastMessageAt,
          }
        : null,
      myRole: m.role,
      unreadCount: m.unreadCount,
      favorite: m.favorite,
      createdAt: m.room.createdAt,
    }))
  );
});

// ---------- 公開ルーム検索 ----------

chatRoutes.get('/public-rooms', requireAuth, async (c) => {
  const me = c.get('user')!;
  const q = c.req.query('q') || '';

  const rooms = await prisma.chatRoom.findMany({
    where: {
      visibility: 'public',
      ...(q ? { name: { contains: q } } : {}),
    },
    include: {
      _count: { select: { members: true } },
      members: { where: { userId: me.id }, select: { role: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });

  return c.json(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      emoji: r.emoji,
      avatarUrl: r.avatarUrl,
      visibility: r.visibility,
      memberCount: r._count.members,
      myRole: r.members[0]?.role ?? null,
      createdAt: r.createdAt,
    }))
  );
});

// ---------- ルーム作成 ----------

chatRoutes.post('/rooms', requireAuth, async (c) => {
  const me = c.get('user')!;
  const input = await c.req.json<{
    name: string;
    description?: string;
    emoji?: string;
    avatarUrl?: string;
    visibility?: 'public' | 'private';
    memberIds?: string[];
  }>();

  const name = String(input.name || '').trim().slice(0, 100);
  if (!name) throw new Error('ルーム名は必須です');

  const room = await prisma.chatRoom.create({
    data: {
      name,
      description: input.description?.slice(0, 500) || null,
      emoji: input.emoji?.slice(0, 8) || null,
      avatarUrl: input.avatarUrl?.slice(0, 500) || null,
      visibility: input.visibility === 'public' ? 'public' : 'private',
      createdById: me.id,
      members: {
        create: [
          { userId: me.id, role: 'owner' },
          ...(input.memberIds || [])
            .filter((id) => id !== me.id)
            .slice(0, 100)
            .map((id) => ({ userId: id, role: 'member' as const })),
        ],
      },
    },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });

  return c.json({
    id: room.id,
    name: room.name,
    description: room.description,
    emoji: room.emoji,
    avatarUrl: room.avatarUrl,
    visibility: room.visibility,
    myRole: 'owner',
    members: room.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
    createdAt: room.createdAt,
  }, 201);
});

// ---------- ルーム詳細 ----------

chatRoutes.get('/rooms/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');

  const room = await prisma.chatRoom.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!room) throw new Error('not found');

  const myMember = room.members.find((m) => m.userId === me.id);
  // private ルームはメンバーのみ閲覧可
  if (room.visibility === 'private' && !myMember) throw new Error('not found');

  return c.json({
    id: room.id,
    name: room.name,
    description: room.description,
    emoji: room.emoji,
    avatarUrl: room.avatarUrl,
    visibility: room.visibility,
    messageCount: room.messageCount,
    myRole: myMember?.role ?? null,
    unreadCount: myMember?.unreadCount ?? 0,
    members: room.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
    createdAt: room.createdAt,
  });
});

// ---------- ルーム設定変更 (ownerのみ) ----------

chatRoutes.patch('/rooms/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireRoomOwner(id, me.id);

  const input = await c.req.json<{
    name?: string;
    description?: string | null;
    emoji?: string | null;
    avatarUrl?: string | null;
    visibility?: 'public' | 'private';
  }>();

  const data: any = {};
  if (input.name !== undefined) data.name = String(input.name).trim().slice(0, 100);
  if (input.description !== undefined) data.description = input.description?.slice(0, 500) ?? null;
  if (input.emoji !== undefined) data.emoji = input.emoji?.slice(0, 8) ?? null;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl?.slice(0, 500) ?? null;
  if (input.visibility !== undefined) data.visibility = input.visibility === 'public' ? 'public' : 'private';

  const updated = await prisma.chatRoom.update({ where: { id }, data });

  // Socket.IO でルーム更新を通知
  try {
    getIO().to(socketRoomId(id)).emit(EVENTS.ROOM_UPDATED, {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      emoji: updated.emoji,
      avatarUrl: updated.avatarUrl,
      visibility: updated.visibility,
    });
  } catch { /* io not ready */ }

  return c.json({ ok: true });
});

// ---------- ルーム削除 (ownerのみ) ----------

chatRoutes.delete('/rooms/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireRoomOwner(id, me.id);

  await prisma.chatRoom.delete({ where: { id } });
  return c.json({ ok: true });
});

// ---------- メンバー追加 ----------

chatRoutes.post('/rooms/:id/members', requireAuth, async (c) => {
  const me = c.get('user')!;
  const roomId = c.req.param('id');
  const input = await c.req.json<{ userId?: string }>();

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('not found');

  // public: 自分で参加 / private: ownerのみ追加可
  const targetUserId = input.userId || me.id;

  if (room.visibility === 'private') {
    if (targetUserId !== me.id) {
      await requireRoomOwner(roomId, me.id);
    } else {
      // private に自分で参加はできない (招待のみ)
      const myMember = await prisma.chatRoomMember.findUnique({
        where: { userId_roomId: { userId: me.id, roomId } },
      });
      if (!myMember) throw new Error('forbidden');
    }
  }

  // 既にメンバーなら何もしない
  const existing = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId: targetUserId, roomId } },
  });
  if (existing) return c.json({ ok: true });

  await prisma.chatRoomMember.create({
    data: { userId: targetUserId, roomId, role: 'member' },
  });

  // システムメッセージ
  const joinedUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } });
  if (joinedUser) {
    const sysMsg = await prisma.chatMessage.create({
      data: {
        roomId,
        authorId: targetUserId,
        body: `${joinedUser.name} が参加しました`,
        type: 'system',
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    try {
      getIO().to(socketRoomId(roomId)).emit(EVENTS.NEW_MESSAGE, {
        ...sysMsg, isMine: false, reactions: [],
      });
      getIO().to(socketRoomId(roomId)).emit(EVENTS.MEMBER_JOINED, {
        roomId,
        user: { id: targetUserId, name: joinedUser.name },
      });
    } catch { /* io not ready */ }
  }

  return c.json({ ok: true }, 201);
});

// ---------- メンバー除去 / 退出 ----------

chatRoutes.delete('/rooms/:id/members/:userId', requireAuth, async (c) => {
  const me = c.get('user')!;
  const roomId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  // 自分の退出 or ownerが他人を除去
  if (targetUserId !== me.id) {
    await requireRoomOwner(roomId, me.id);
  }

  const member = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId: targetUserId, roomId } },
  });
  if (!member) throw new Error('not found');

  await prisma.chatRoomMember.delete({
    where: { userId_roomId: { userId: targetUserId, roomId } },
  });

  // システムメッセージ
  const leftUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } });
  if (leftUser) {
    const sysMsg = await prisma.chatMessage.create({
      data: {
        roomId,
        authorId: targetUserId,
        body: targetUserId === me.id
          ? `${leftUser.name} が退出しました`
          : `${leftUser.name} がルームから除去されました`,
        type: 'system',
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    try {
      getIO().to(socketRoomId(roomId)).emit(EVENTS.NEW_MESSAGE, {
        ...sysMsg, isMine: false, reactions: [],
      });
      getIO().to(socketRoomId(roomId)).emit(EVENTS.MEMBER_LEFT, {
        roomId,
        userId: targetUserId,
      });
    } catch { /* io not ready */ }
  }

  return c.json({ ok: true });
});

// ---------- メンバー権限変更 (管理者⇄メンバー) ----------

chatRoutes.patch('/rooms/:id/members/:userId/role', requireAuth, async (c) => {
  const me = c.get('user')!;
  const roomId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  await requireRoomOwner(roomId, me.id);

  const { role } = await c.req.json<{ role: 'owner' | 'member' }>();
  if (role !== 'owner' && role !== 'member') throw new Error('role は owner か member を指定してください');

  const member = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId: targetUserId, roomId } },
  });
  if (!member) throw new Error('not found');

  // 自分自身を降格するケース: 他にownerがいるか確認
  if (targetUserId === me.id && role === 'member') {
    const otherOwners = await prisma.chatRoomMember.count({
      where: { roomId, role: 'owner', userId: { not: me.id } },
    });
    if (otherOwners === 0) throw new Error('他に管理者がいないため降格できません');
  }

  await prisma.chatRoomMember.update({
    where: { userId_roomId: { userId: targetUserId, roomId } },
    data: { role },
  });

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } });
  if (targetUser) {
    const label = role === 'owner' ? '管理者' : 'メンバー';
    await prisma.chatMessage.create({
      data: {
        roomId,
        authorId: me.id,
        body: `${targetUser.name} を${label}に変更しました`,
        type: 'system',
      },
    });
  }

  return c.json({ ok: true });
});

// ---------- メッセージ履歴 ----------

chatRoutes.get('/rooms/:id/messages', requireAuth, async (c) => {
  const me = c.get('user')!;
  const roomId = c.req.param('id');
  const before = c.req.query('before');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  // メンバーシップ確認
  const member = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId: me.id, roomId } },
  });
  if (!member) throw new Error('forbidden');

  const where: any = { roomId };
  if (before) {
    const ref = await prisma.chatMessage.findUnique({ where: { id: before }, select: { createdAt: true } });
    if (ref) where.createdAt = { lt: ref.createdAt };
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  // 古い順に並べ直し
  messages.reverse();

  return c.json(
    messages.map((msg) => ({
      id: msg.id,
      roomId: msg.roomId,
      body: msg.body,
      type: msg.type,
      authorId: msg.authorId,
      author: msg.author,
      editedAt: msg.editedAt,
      isMine: msg.authorId === me.id,
      reactions: groupReactions(msg.reactions, me.id),
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }))
  );
});

// ---------- メッセージ検索 ----------

chatRoutes.get('/rooms/:id/messages/search', requireAuth, async (c) => {
  const me = c.get('user')!;
  const roomId = c.req.param('id');
  const q = c.req.query('q') || '';
  if (!q.trim()) return c.json([]);

  const member = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId: me.id, roomId } },
  });
  if (!member) throw new Error('forbidden');

  const messages = await prisma.chatMessage.findMany({
    where: { roomId, body: { contains: q }, type: 'user' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return c.json(
    messages.map((msg) => ({
      id: msg.id,
      body: msg.body,
      authorId: msg.authorId,
      author: msg.author,
      createdAt: msg.createdAt,
    }))
  );
});

// ---------- ヘルパー ----------

async function requireRoomOwner(roomId: string, userId: string) {
  const member = await prisma.chatRoomMember.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });
  if (!member || member.role !== 'owner') throw new Error('forbidden');
}

function groupReactions(
  reactions: { emoji: string; userId: string; user: { id: string; name: string } }[],
  meId: string
) {
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
