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

export type SearchTweet = {
  id?: string;
  author?: string;
  text?: string;
  created_at?: string;
  likes?: string;
  views?: string;
  url?: string;
};

export type SavedTweet = {
  id: string;
  interestId?: string;
  listIds?: string[];
  listNames?: string[];
  author?: string;
  text?: string;
  url?: string;
  likes?: string;
  views?: string;
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
