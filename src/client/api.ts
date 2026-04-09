import type {
  Affiliation,
  AggregationTemplate,
  AIConfig,
  AIPrompts,
  AIReview,
  ArticleFull,
  ArticleListItem,
  CommunityFull,
  CommunitySummary,
  CommunityTimeline,
  Post,
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
  updateMe: (patch: { name?: string; bio?: string; avatarUrl?: string }) =>
    req<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  getUser: (id: string) => req<User>(`/users/${id}`),

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

  // trending
  trending: (type: 'tech' | 'idea', days?: number) =>
    req<{ days: number; items: ArticleListItem[] }>(
      `/trending?type=${type}` + (days ? `&days=${days}` : '')
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
  createCommunity: (input: { name: string; description?: string; visibility?: 'public' | 'private' }) =>
    req<{ id: string; slug: string; name: string }>('/communities', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getCommunity: (id: string) => req<CommunityFull>(`/communities/${id}`),
  updateCommunity: (
    id: string,
    patch: { name?: string; description?: string; visibility?: 'public' | 'private' }
  ) => req<any>(`/communities/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setMemberRole: (id: string, userId: string, role: 'owner' | 'member') =>
    req<any>(`/communities/${id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (id: string, userId: string) =>
    req<{ ok: boolean }>(`/communities/${id}/members/${userId}`, { method: 'DELETE' }),
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
  createTimeline: (id: string, input: { name: string; visibility?: string; visibilityAffiliationIds?: string[] }) =>
    req<CommunityTimeline>(`/communities/${id}/timelines`, {
      method: 'POST',
      body: JSON.stringify(input),
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
  createPost: (input: { body: string; communityId: string; timelineId?: string; parentPostId?: string }) =>
    req<Post>('/posts', { method: 'POST', body: JSON.stringify(input) }),
  deletePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  togglePostLike: (id: string) =>
    req<{ liked: boolean; count: number }>(`/posts/${id}/like`, { method: 'POST' }),

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
};
