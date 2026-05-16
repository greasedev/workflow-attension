// Shared type definitions for Attention Portfolio

export type Source = {
  name?: string;
  handle?: string;
  type?: string;
  portfolioType?: string;
  id?: string;
  avatar?: string;
  role?: string;
  content?: string;
  stance?: string;
  lang?: string;
  focus?: number;
  diversity?: number;
  reason?: string;
  candidateSource?: string;
  state?: 'new' | 'add' | 'ignore';
};

export type Portfolio = {
  core?: Source[];
  diversity?: Source[];
  radar?: Source[];
};

export type Goal = {
  id: string;
  title: string;
  titleEn?: string;
  description: string;
  tags?: string[];
  icon?: string;
};

export type DistributionItem = {
  label: string;
  value: number;
};

export type Layer = {
  key: 'core' | 'diversity' | 'radar';
  name: string;
  nameCn?: string;
  description: string;
  tags?: string[];
  suggested?: string | number;
};

export type PortfolioModel = {
  goals: Goal[];
  distribution: DistributionItem[];
  layers: Layer[];
  sources: Source[];
  searchQueries?: string[];
};

export type TweetUser = {
  id?: string;
  name?: string;
  screen_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  description?: string;
  followers_count?: number;
  location?: string;
};

export type TweetMedia = {
  type?: string;
  url?: string;
  display_url?: string;
  expanded_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  video_url?: string;
  bitrate?: number;
};

export type TweetMention = {
  id?: string;
  name?: string;
  screen_name?: string;
};

export type SearchTweet = {
  id?: string;
  user?: TweetUser;
  author?: string;
  text?: string;
  created_at?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  bookmarks?: number;
  url?: string;
  lang?: string;
  conversation_id?: string;
  media?: TweetMedia[];
  hashtags?: string[];
  mentions?: TweetMention[];
  urls?: string[];
  is_retweet?: boolean;
  retweeted_tweet?: SearchTweet;
};

export type SavedTweet = {
  id: string;
  interestId?: string;
  listIds?: string[];
  listNames?: string[];
  userId?: string;
  author?: string;
  authorName?: string;
  authorAvatar?: string;
  authorVerified?: boolean;
  authorFollowers?: number;
  authorBio?: string;
  text?: string;
  url?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  bookmarks?: number;
  lang?: string;
  media?: TweetMedia[];
  hashtags?: string[];
  mentions?: TweetMention[];
  isRetweet?: boolean;
  createdAt?: string;
  savedAt?: string;
  raw?: unknown;
};

export type TwitterList = {
  id: string;
  name: string;
  members?: number;
  followers?: number;
  mode?: string;
  type?: string;
};

export type TwitterUserCandidate = {
  name?: string;
  handle?: string;
  username?: string;
  bio?: string;
  followers?: number;
  verified?: boolean;
  reason?: string;
  source?: string;
};
