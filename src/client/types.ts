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
  scheduledAt?: string | null;
  visibility?: 'public' | 'affiliation_in' | 'affiliation_out';
  visibilityAffiliationIds?: string;
  communityId?: string | null;
  timelineId?: string | null;
  approvalStatus?: 'draft' | 'pending' | 'approved' | 'rejected';
  approvalNote?: string | null;
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

export type Affiliation = {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
};

export type CommunitySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'public' | 'private';
  memberCount: number;
  isMember: boolean;
};

export type CommunityMember = {
  id: string;
  role: 'owner' | 'member';
  name: string;
  avatarUrl: string | null;
};

export type CommunityTimeline = {
  id: string;
  communityId: string;
  name: string;
  visibility: 'public' | 'members_only' | 'affiliation_in';
  visibilityAffiliationIds: string;
};

export type Notification = {
  id: string;
  kind:
    | 'like_article'
    | 'like_post'
    | 'bookmark_article'
    | 'comment_article'
    | 'comment_post'
    | 'follow_user';
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  article: { id: string; title: string; emoji: string | null } | null;
  post: { id: string; excerpt: string; communityId: string | null } | null;
  readAt: string | null;
  createdAt: string;
};

export type Comment = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string; avatarUrl: string | null };
  parentCommentId: string | null;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Post = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string; avatarUrl: string | null };
  communityId: string | null;
  timelineId: string | null;
  parentPostId: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
};

export type CommunityFull = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'public' | 'private';
  members: CommunityMember[];
  timelines: CommunityTimeline[];
  myRole: 'owner' | 'member' | null;
};

export type AIConfig = {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  endpoint: string | null;
  model: string;
  isDefault: boolean;
  apiKeyMasked: string;
};

export type AIPrompts = {
  review: string;
  summary: string;
};

export type AIReview = {
  id: string;
  summary: string;
  goodPoints: string[];
  improvements: string[];
  lineComments: { line: number; body: string }[];
  createdAt?: string;
  user?: { id: string; name: string; avatarUrl: string | null };
};

export type AggregationTemplate = {
  id: string;
  name: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};
