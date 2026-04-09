import type { ArticleFull, ArticleListItem, Topic, User } from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new Error(msg);
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
};
