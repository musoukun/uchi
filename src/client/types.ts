export type User = {
  id: string;
  email?: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt?: string;
};

export type Topic = {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
};

export type ArticleListItem = {
  id: string;
  authorId: string;
  slug: string;
  title: string;
  emoji: string | null;
  type: 'tech' | 'idea';
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  topics: Topic[];
  likeCount: number;
  bookmarkCount: number;
};

export type ArticleFull = ArticleListItem & {
  body: string;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  followingAuthor: boolean;
  isMine: boolean;
};
