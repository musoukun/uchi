export type User = {
  id: string;
  email?: string;
  name: string;
  avatarUrl: string | null;
  avatarColor?: string | null;
  bio: string | null;
  isAdmin?: boolean;
  isRetired?: boolean;
  createdAt?: string;
};

export type UserProfile = User & {
  affiliations?: Affiliation[];
  stats?: {
    articleCount: number;
    postCount: number;
    followerCount: number;
    followingCount: number;
  };
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
  type: 'howto' | 'diary';
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string | null;
  visibility?: 'public' | 'friends_only';
  visibilityAffiliationIds?: string; // レガシー (未使用)
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

export type CommunityVisibility =
  | 'public'
  | 'private'
  | 'affiliation_in'
  | 'affiliation_out';

export type CommunitySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  visibility: CommunityVisibility;
  visibilityAffiliationIds?: string;
  memberCount: number;
  ownerCount: number;
  isMember: boolean;
};

export type CommunityMember = {
  id: string;
  role: 'owner' | 'member';
  name: string;
  avatarUrl: string | null;
};

export type TimelineVisibility = 'open' | 'private';

export type CommunityTimeline = {
  id: string;
  communityId: string;
  name: string;
  visibility: TimelineVisibility;
  visibilityAffiliationIds: string;
  visibilityUserIds: string;
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
  title: string | null;
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
  avatarUrl: string | null;
  avatarColor: string | null;
  visibility: CommunityVisibility;
  visibilityAffiliationIds?: string;
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

// チャット
export type ChatRoomSummary = {
  id: string; name: string; description: string | null;
  emoji: string | null; avatarUrl: string | null;
  visibility: 'public' | 'private'; messageCount: number;
  lastMessage: { body: string | null; authorName: string | null; createdAt: string } | null;
  myRole: 'owner' | 'member' | null; unreadCount: number; favorite: boolean; createdAt: string;
};
export type ChatRoomMember = { id: string; name: string; avatarUrl: string | null; role: 'owner' | 'member' };
export type ChatRoomFull = {
  id: string; name: string; description: string | null;
  emoji: string | null; avatarUrl: string | null;
  visibility: 'public' | 'private'; messageCount: number;
  myRole: 'owner' | 'member' | null; unreadCount: number;
  members: ChatRoomMember[]; createdAt: string;
};
export type ChatMessage = {
  id: string; roomId: string; body: string; type: 'user' | 'system' | 'meet';
  authorId: string; author: { id: string; name: string; avatarUrl: string | null };
  editedAt: string | null; isMine: boolean; reactions: ReactionGroup[];
  createdAt: string; updatedAt: string;
};
export type ReactionGroup = {
  emoji: string; count: number; userIds: string[]; userNames: string[]; reacted: boolean;
};
export type CustomEmoji = { id: string; name: string; aliases: string; fileUrl: string; createdAt: string };
export type PublicRoom = {
  id: string; name: string; description: string | null;
  emoji: string | null; avatarUrl: string | null;
  visibility: 'public'; memberCount: number;
  myRole: 'owner' | 'member' | null; createdAt: string;
};
