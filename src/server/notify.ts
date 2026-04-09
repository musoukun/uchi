import { prisma } from './db';

// 通知を作る共通ヘルパ。
// 自分自身の行動に対しては通知しない (actorId === userId なら no-op)。
// 失敗しても本処理を止めないよう try/catch で握りつぶす。

export type NotificationKind =
  | 'like_article'
  | 'like_post'
  | 'bookmark_article'
  | 'comment_article'
  | 'comment_post'
  | 'follow_user';

export async function notify(input: {
  userId: string; // 受信者
  actorId: string; // アクションの主体
  kind: NotificationKind;
  articleId?: string | null;
  postId?: string | null;
  commentId?: string | null;
}) {
  if (input.userId === input.actorId) return; // 自分→自分は通知しない
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId,
        kind: input.kind,
        articleId: input.articleId || null,
        postId: input.postId || null,
        commentId: input.commentId || null,
      },
    });
  } catch (e) {
    console.warn('[notify] failed', input.kind, e);
  }
}

// 「いいね」を取り消した時の通知も取り消したい場合のヘルパ
export async function unnotify(input: {
  userId: string;
  actorId: string;
  kind: NotificationKind;
  articleId?: string | null;
  postId?: string | null;
}) {
  if (input.userId === input.actorId) return;
  try {
    await prisma.notification.deleteMany({
      where: {
        userId: input.userId,
        actorId: input.actorId,
        kind: input.kind,
        ...(input.articleId ? { articleId: input.articleId } : {}),
        ...(input.postId ? { postId: input.postId } : {}),
      },
    });
  } catch (e) {
    console.warn('[unnotify] failed', input.kind, e);
  }
}
