import type {
  Affiliation,
  AggregationTemplate,
  AIConfig,
  AIPrompts,
  AIReview,
  ArticleFull,
  ArticleListItem,
  ChatMessage,
  ChatRoomFull,
  ChatRoomSummary,
  CustomEmoji,
  CommunityFull,
  CommunitySummary,
  CommunityTimeline,
  Comment,
  Notification,
  Post,
  PublicRoom,
  ReactionGroup,
  Topic,
  User,
} from './types';

// 422風: status code を持つカスタムエラー
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    let body: any = null;
    try {
      body = await res.json();
      msg = body?.message || body?.error || msg;
    } catch {}
    throw new ApiError(res.status, msg, body);
  }
  return res.json();
}

export const api = {
  // auth
  register: (input: { email: string; password: string; name: string }) =>
    req<User>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    req<User>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // me / users
  getMe: () => req<User | null>('/me'),
  updateMe: (patch: { name?: string; bio?: string; avatarUrl?: string | null; avatarColor?: string | null }) =>
    req<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  getUser: (id: string) => req<import('./types').UserProfile>(`/users/${id}`),
  getUserPosts: (id: string) => req<import('./types').Post[]>(`/users/${id}/posts`),

  // topics
  listTopics: () => req<Topic[]>('/topics'),

  // articles
  listArticles: (params: {
    q?: string;
    topicSlug?: string;
    authorId?: string;
    type?: string;
    limit?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return req<ArticleListItem[]>('/articles' + (s ? '?' + s : ''));
  },
  getArticle: (id: string) => req<ArticleFull>(`/articles/${id}`),
  createArticle: (input: any) =>
    req<ArticleFull>('/articles', { method: 'POST', body: JSON.stringify(input) }),
  updateArticle: (id: string, input: any) =>
    req<ArticleFull>(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteArticle: (id: string) => req<{ ok: boolean }>(`/articles/${id}`, { method: 'DELETE' }),

  // me/*
  myDrafts: () => req<ArticleListItem[]>('/me/drafts'),
  myBookmarks: () => req<ArticleListItem[]>('/me/bookmarks'),
  myFollowing: () => req<{ users: User[]; topics: Topic[] }>('/me/following'),
  myFollowingArticles: () => req<ArticleListItem[]>('/me/following/articles'),

  // likes / bookmarks
  toggleLike: (articleId: string) =>
    req<{ liked: boolean; count: number }>(`/articles/${articleId}/like`, { method: 'POST' }),
  toggleBookmark: (articleId: string) =>
    req<{ bookmarked: boolean; count: number }>(`/articles/${articleId}/bookmark`, { method: 'POST' }),

  // follows
  toggleFollow: (targetType: 'user' | 'topic', targetId: string) =>
    req<{ following: boolean }>('/follows', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId }),
    }),
  isFollowing: (targetType: 'user' | 'topic', targetId: string) =>
    req<{ following: boolean }>(`/follows/check?targetType=${targetType}&targetId=${targetId}`),

  // trending (articles)
  trending: (type: 'howto' | 'diary', days?: number) =>
    req<{ days: number; items: ArticleListItem[] }>(
      `/trending?type=${type}` + (days ? `&days=${days}` : '')
    ),
  // trending (community posts)
  postTrending: (communityId: string, days?: number) =>
    req<{ days: number; items: Post[] }>(
      `/posts/trending/${communityId}` + (days ? `?days=${days}` : '')
    ),

  // file upload (画像 / GIF, 最大 50MB)
  uploadFile: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/files', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json() as Promise<{
      id: string;
      url: string;
      name: string;
      size: number;
      mime: string;
    }>;
  },

  // ---------- 所属 ----------
  listAffiliations: () => req<Affiliation[]>('/affiliations'),
  createAffiliation: (name: string) =>
    req<Affiliation>('/affiliations', { method: 'POST', body: JSON.stringify({ name }) }),
  getUserAffiliations: (userId: string) => req<Affiliation[]>(`/affiliations/users/${userId}`),
  setMyAffiliations: (affiliationIds: string[]) =>
    req<Affiliation[]>('/affiliations/me', {
      method: 'PUT',
      body: JSON.stringify({ affiliationIds }),
    }),

  // ---------- コミュニティ ----------
  listCommunities: () => req<CommunitySummary[]>('/communities'),
  createCommunity: (input: {
    name: string;
    description?: string;
    visibility?: 'public' | 'private' | 'affiliation_in' | 'affiliation_out';
    visibilityAffiliationIds?: string[];
  }) =>
    req<{ id: string; slug: string; name: string }>('/communities', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getCommunity: (id: string) => req<CommunityFull>(`/communities/${id}`),
  updateCommunity: (
    id: string,
    patch: {
      name?: string;
      description?: string;
      visibility?: 'public' | 'private' | 'affiliation_in' | 'affiliation_out';
      visibilityAffiliationIds?: string[];
      avatarUrl?: string | null;
      avatarColor?: string | null;
    }
  ) => req<any>(`/communities/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setMemberRole: (id: string, userId: string, role: 'owner' | 'member') =>
    req<any>(`/communities/${id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (id: string, userId: string) =>
    req<{ ok: boolean }>(`/communities/${id}/members/${userId}`, { method: 'DELETE' }),
  addMember: (id: string, userId: string) =>
    req<{ ok: boolean; already?: boolean }>(`/communities/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  searchUsers: (q: string) =>
    req<{ items: Array<{ id: string; name: string; avatarUrl: string | null }> }>(
      `/search?type=user&q=${encodeURIComponent(q)}`
    ),
  joinCommunity: (id: string) =>
    req<{ ok: boolean; already?: boolean }>(`/communities/${id}/join`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  listMyLeftPrivateCommunities: (page = 1, pageSize = 10) =>
    req<{
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      items: Array<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        visibility: 'private';
        memberCount: number;
        ownerCount: number;
        leftAt: string;
      }>;
    }>(`/communities/me/left-private?page=${page}&pageSize=${pageSize}`),
  rejoinCommunity: (id: string) =>
    req<{ ok: boolean }>(`/communities/${id}/rejoin`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  createInvite: (id: string, email?: string) =>
    req<{ id: string; token: string; expiresAt?: string }>(`/communities/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  listInvites: (id: string) => req<any[]>(`/communities/${id}/invites`),
  revokeInvite: (id: string, inviteId: string) =>
    req<{ ok: boolean }>(`/communities/${id}/invites/${inviteId}`, { method: 'DELETE' }),
  acceptInvite: (token: string) =>
    req<{ ok: boolean; communityId: string }>('/communities/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  createTimeline: (
    id: string,
    input: {
      name: string;
      visibility?: 'open' | 'private';
      memberIds?: string[];
    }
  ) =>
    req<CommunityTimeline>(`/communities/${id}/timelines`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTimeline: (
    id: string,
    timelineId: string,
    patch: {
      name?: string;
      visibility?: 'open' | 'private';
      memberIds?: string[];
    }
  ) =>
    req<CommunityTimeline>(`/communities/${id}/timelines/${timelineId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTimeline: (id: string, timelineId: string) =>
    req<{ ok: boolean }>(`/communities/${id}/timelines/${timelineId}`, { method: 'DELETE' }),
  listTimelineArticles: (id: string, timelineId: string) =>
    req<ArticleListItem[]>(`/communities/${id}/timelines/${timelineId}/articles`),
  listPending: (id: string) => req<any[]>(`/communities/${id}/pending`),
  approvePending: (id: string, articleId: string) =>
    req<any>(`/communities/${id}/pending/${articleId}/approve`, { method: 'POST' }),
  rejectPending: (id: string, articleId: string, note?: string) =>
    req<any>(`/communities/${id}/pending/${articleId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  // ---------- Post (SNS 投稿) ----------
  listTimelinePosts: (timelineId: string) =>
    req<Post[]>(`/posts/timeline/${timelineId}`),
  createPost: (input: { title?: string; body: string; communityId: string; timelineId?: string; parentPostId?: string }) =>
    req<Post>('/posts', { method: 'POST', body: JSON.stringify(input) }),
  deletePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  togglePostLike: (id: string) =>
    req<{ liked: boolean; count: number }>(`/posts/${id}/like`, { method: 'POST' }),

  // ---------- 検索 ----------
  search: (q: string, type: 'article' | 'community' | 'post' | 'user') =>
    req<{ items: any[] }>(`/search?type=${type}&q=${encodeURIComponent(q)}`),

  // ---------- OGP ----------
  fetchOgp: (url: string) =>
    req<{
      url: string;
      host: string;
      title: string | null;
      description: string | null;
      image: string | null;
      siteName: string | null;
    }>('/ogp?url=' + encodeURIComponent(url)),

  // ---------- Notifications ----------
  listNotifications: (kind?: 'all' | 'comment') =>
    req<Notification[]>('/notifications' + (kind && kind !== 'all' ? '?kind=' + kind : '')),
  notificationUnreadCount: () =>
    req<{ count: number }>('/notifications/unread-count'),
  markAllNotificationsRead: () =>
    req<{ ok: boolean }>('/notifications/mark-all-read', { method: 'POST' }),

  // ---------- Comments ----------
  listComments: (params: { articleId?: string; postId?: string }) => {
    const qs = new URLSearchParams();
    if (params.articleId) qs.set('articleId', params.articleId);
    if (params.postId) qs.set('postId', params.postId);
    return req<Comment[]>('/comments?' + qs.toString());
  },
  createComment: (input: { body: string; articleId?: string; postId?: string; parentCommentId?: string }) =>
    req<Comment>('/comments', { method: 'POST', body: JSON.stringify(input) }),
  updateComment: (id: string, body: string) =>
    req<Comment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteComment: (id: string) => req<{ ok: boolean }>(`/comments/${id}`, { method: 'DELETE' }),

  // ---------- AI ----------
  listAIConfigs: () => req<AIConfig[]>('/ai/configs'),
  createAIConfig: (input: {
    provider: 'openai' | 'anthropic' | 'gemini';
    endpoint?: string;
    model: string;
    apiKey: string;
    isDefault?: boolean;
  }) => req<{ id: string }>('/ai/configs', { method: 'POST', body: JSON.stringify(input) }),
  deleteAIConfig: (id: string) => req<{ ok: boolean }>(`/ai/configs/${id}`, { method: 'DELETE' }),
  setDefaultAIConfig: (id: string) =>
    req<{ ok: boolean }>(`/ai/configs/${id}/default`, { method: 'POST' }),
  getPrompts: () => req<AIPrompts>('/ai/prompts'),
  setPrompt: (kind: 'review' | 'summary', body: string) =>
    req<{ ok: boolean }>(`/ai/prompts/${kind}`, { method: 'PUT', body: JSON.stringify({ body }) }),
  reviewArticle: (id: string) =>
    req<AIReview>(`/ai/articles/${id}/review`, { method: 'POST' }),
  listReviews: (id: string) => req<AIReview[]>(`/ai/articles/${id}/reviews`),
  suggestFix: (
    id: string,
    payload: { mode: 'line' | 'append'; line?: number; instruction: string }
  ) =>
    req<{ text: string }>(`/ai/articles/${id}/suggest`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  summarize: (articleIds: string[], customPrompt?: string) =>
    req<{ items: { id: string; title: string; url: string; summary: string }[] }>('/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ articleIds, customPrompt }),
    }),

  // ---------- 集約 ----------
  listAggTemplates: () => req<AggregationTemplate[]>('/aggregation/templates'),
  createAggTemplate: (name: string, body: string) =>
    req<AggregationTemplate>('/aggregation/templates', {
      method: 'POST',
      body: JSON.stringify({ name, body }),
    }),
  updateAggTemplate: (id: string, name: string, body: string) =>
    req<AggregationTemplate>(`/aggregation/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, body }),
    }),
  deleteAggTemplate: (id: string) =>
    req<{ ok: boolean }>(`/aggregation/templates/${id}`, { method: 'DELETE' }),
  renderAggregation: (input: {
    templateId?: string;
    body?: string;
    articleIds: string[];
    includeSummary?: boolean;
  }) => req<{ markdown: string }>('/aggregation/render', { method: 'POST', body: JSON.stringify(input) }),

  // ---------- admin ----------
  adminExists: () => req<{ exists: boolean }>('/admin/exists'),
  adminInit: (input: { email: string; password: string; name?: string }) =>
    req<User & { promoted?: boolean }>('/admin/init', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminMe: () => req<{ isAdmin: boolean }>('/admin/me'),
  adminListUsers: () =>
    req<
      Array<{
        id: string;
        email: string;
        name: string;
        avatarUrl: string | null;
        isAdmin: boolean;
        createdAt: string;
        affiliations: Array<{ id: string; name: string }>;
      }>
    >('/admin/users'),
  adminSetUserAffiliations: (userId: string, affiliationIds: string[]) =>
    req<{ ok: boolean }>(`/admin/users/${userId}/affiliations`, {
      method: 'PUT',
      body: JSON.stringify({ affiliationIds }),
    }),
  adminDeleteUser: (userId: string) =>
    req<{ ok: boolean }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  adminListCommunities: () =>
    req<
      Array<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        avatarUrl: string | null;
        visibility: 'public' | 'private';
        memberCount: number;
        ownerCount: number;
        createdAt: string;
      }>
    >('/admin/communities'),
  adminDeleteCommunity: (id: string) =>
    req<{ ok: boolean }>(`/admin/communities/${id}`, { method: 'DELETE' }),
  adminCreateAffiliation: (name: string) =>
    req<Affiliation>('/admin/affiliations', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  adminDeleteAffiliation: (id: string) =>
    req<{ ok: boolean }>(`/admin/affiliations/${id}`, { method: 'DELETE' }),
  adminRetireUser: (id: string) =>
    req<{ ok: boolean }>(`/admin/users/${id}/retire`, { method: 'POST', body: JSON.stringify({}) }),
  adminUnretireUser: (id: string) =>
    req<{ ok: boolean }>(`/admin/users/${id}/unretire`, { method: 'POST', body: JSON.stringify({}) }),

  // チャット
  listChatRooms: () => req<ChatRoomSummary[]>('/chat/rooms'),
  listPublicRooms: (q?: string) =>
    req<PublicRoom[]>(`/chat/public-rooms${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createChatRoom: (input: {
    name: string; description?: string; emoji?: string;
    avatarUrl?: string; visibility?: 'public' | 'private'; memberIds?: string[];
  }) => req<ChatRoomFull>('/chat/rooms', { method: 'POST', body: JSON.stringify(input) }),
  getChatRoom: (id: string) => req<ChatRoomFull>(`/chat/rooms/${id}`),
  updateChatRoom: (id: string, patch: Record<string, any>) =>
    req<{ ok: boolean }>(`/chat/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteChatRoom: (id: string) =>
    req<{ ok: boolean }>(`/chat/rooms/${id}`, { method: 'DELETE' }),
  addChatRoomMember: (roomId: string, userId?: string) =>
    req<{ ok: boolean }>(`/chat/rooms/${roomId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeChatRoomMember: (roomId: string, userId: string) =>
    req<{ ok: boolean }>(`/chat/rooms/${roomId}/members/${userId}`, { method: 'DELETE' }),
  changeChatMemberRole: (roomId: string, userId: string, role: 'owner' | 'member') =>
    req<{ ok: boolean }>(`/chat/rooms/${roomId}/members/${userId}/role`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    }),
  getChatMessages: (roomId: string, before?: string) =>
    req<ChatMessage[]>(`/chat/rooms/${roomId}/messages${before ? `?before=${before}` : ''}`),
  searchChatMessages: (roomId: string, q: string) =>
    req<any[]>(`/chat/rooms/${roomId}/messages/search?q=${encodeURIComponent(q)}`),
  togglePostReaction: (postId: string, emoji: string) =>
    req<{ toggled: boolean; reactions: ReactionGroup[] }>(`/reactions/posts/${postId}`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  getPostReactions: (postId: string) => req<ReactionGroup[]>(`/reactions/posts/${postId}`),
  listCustomEmoji: () => req<CustomEmoji[]>('/emoji/custom'),
  createCustomEmoji: (name: string, fileUrl: string, aliases?: string) =>
    req<CustomEmoji>('/emoji/custom', { method: 'POST', body: JSON.stringify({ name, fileUrl, aliases }) }),
  deleteCustomEmoji: (id: string) =>
    req<{ ok: boolean }>(`/emoji/custom/${id}`, { method: 'DELETE' }),
};
