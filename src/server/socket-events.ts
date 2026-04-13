// Socket.IO イベント定数 (Rocket.Chat stream 名に相当)

export const EVENTS = {
  // Client → Server
  JOIN_ROOM: 'chat:join',
  LEAVE_ROOM: 'chat:leave',
  SEND_MESSAGE: 'chat:message',
  EDIT_MESSAGE: 'chat:message:edit',
  DELETE_MESSAGE: 'chat:message:delete',
  TYPING: 'chat:typing',
  TOGGLE_REACTION: 'chat:reaction',
  MARK_READ: 'chat:read',

  // Server → Client (名前は同じだがペイロードで区別)
  NEW_MESSAGE: 'chat:message',
  MESSAGE_EDITED: 'chat:message:edit',
  MESSAGE_DELETED: 'chat:message:delete',
  TYPING_STATUS: 'chat:typing',
  REACTION_UPDATE: 'chat:reaction',
  ROOM_UPDATED: 'chat:room:update',
  MEMBER_JOINED: 'chat:member:join',
  MEMBER_LEFT: 'chat:member:leave',
} as const;

// Socket.IO の room prefix (Socket.IO 内部の "room" と DB の ChatRoom を区別)
export function socketRoomId(roomId: string) {
  return `room:${roomId}`;
}
