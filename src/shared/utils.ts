// Shared utility functions

import type { ExecutionResult } from '../workflows/api';
import type { SearchTweet, Source, TwitterList, TwitterUserCandidate, TweetUser } from './types';

export function profileExists(value: ExecutionResult): boolean {
  if (!value) return false;

  if (value.success === false || value.error) return false;
  const extractData = value.task?.extract_data;
  if (!extractData) return true;

  // Check if extract_data is an array (list)
  if (Array.isArray(extractData)) {
    // Get the last element
    const lastElement = extractData[extractData.length - 1];
    if (!lastElement || typeof lastElement !== 'object') return false;
    // Check if screen_name is empty
    const screenName = (lastElement as { screen_name?: string }).screen_name;
    if (!screenName || screenName.trim() === '') return false;
    return true;
  }

  if (typeof extractData !== 'string') return Boolean(extractData);

  const text = extractData.trim();
  if (!text) return false;
  if (/not\s*found|不存在|用户不存在|does\s*not\s*exist/i.test(text)) return false;

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.exists === false || parsed.found === false || parsed.error) return false;
      return Boolean(parsed.id || parsed.username || parsed.handle || parsed.name || Object.keys(parsed).length);
    } catch {
      return true;
    }
  }

  return true;
}

export function extractListId(value: ExecutionResult): string {
  if (!value) return '';

  const extractData = value.task?.extract_data;
  if (extractData) {
    const extracted = extractListIdFromPayload(extractData);
    if (extracted) return extracted;
    if (typeof extractData === 'string') {
      const text = extractData.trim();
      return /^\d+$/.test(text) ? text : '';
    }
  }

  return '';
}

function extractListIdFromPayload(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return text;
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        return extractListIdFromPayload(JSON.parse(text));
      } catch {
        return '';
      }
    }
    return '';
  }

  if (Array.isArray(value)) {
    for (const item of [...value].reverse()) {
      const listId = extractListIdFromPayload(item);
      if (listId) return listId;
    }
    return '';
  }

  if (typeof value === 'object') {
    const obj = value as {
      list_id?: unknown;
      listId?: unknown;
      id?: unknown;
      data?: unknown;
      list?: unknown;
    };
    for (const candidate of [obj.list_id, obj.listId, obj.id]) {
      if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim())) return candidate.trim();
      if (typeof candidate === 'number') return String(candidate);
    }
    return extractListIdFromPayload(obj.data) || extractListIdFromPayload(obj.list);
  }

  return '';
}

export function cleanHandle(value: string): string {
  return String(value || '').trim().replace(/^@/, '');
}

export function capitalize(value: string): string {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}

export function parseJson(text: string): unknown {
  const withoutFence = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Agent did not return JSON');
  }
  return JSON.parse(withoutFence.slice(start, end + 1));
}

export function clampNumber(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function unique<T>(values: (T | null | undefined | false)[]): T[] {
  return [...new Set(values.filter(Boolean) as T[])];
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractSearchTweets(value: ExecutionResult | unknown): SearchTweet[] {
  const raw = extractPayload(value);
  if (Array.isArray(raw)) return raw.map(normalizeSearchTweet).filter(isSearchTweet);
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; tweets?: unknown; results?: unknown; task?: { extract_data?: unknown } };
    for (const candidate of [obj.data, obj.tweets, obj.results, obj.task?.extract_data]) {
      const tweets = extractSearchTweets(candidate);
      if (tweets.length) return tweets;
    }
  }
  return [];
}

function normalizeSearchTweet(value: unknown): SearchTweet {
  if (!value || typeof value !== 'object') return value as SearchTweet;
  const item = value as SearchTweet;
  // If author is not set but user.screen_name exists, use it
  if (!item.author && item.user?.screen_name) {
    item.author = item.user.screen_name;
  }
  return item;
}

export function extractTwitterLists(value: ExecutionResult | unknown): TwitterList[] {
  const raw = extractPayload(value);
  if (Array.isArray(raw)) return raw.map(normalizeTwitterList).filter(Boolean) as TwitterList[];
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; lists?: unknown; results?: unknown; task?: { extract_data?: unknown } };
    for (const candidate of [obj.data, obj.lists, obj.results, obj.task?.extract_data]) {
      const lists = extractTwitterLists(candidate);
      if (lists.length) return lists;
    }
  }
  return [];
}

export function extractTwitterUserCandidates(value: ExecutionResult | unknown, source = 'twitter'): TwitterUserCandidate[] {
  const raw = extractPayload(value);
  if (Array.isArray(raw)) return raw.map(item => normalizeTwitterUserCandidate(item, source)).filter(Boolean) as TwitterUserCandidate[];
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; users?: unknown; members?: unknown; results?: unknown; task?: { extract_data?: unknown } };
    for (const candidate of [obj.data, obj.users, obj.members, obj.results, obj.task?.extract_data]) {
      const users = extractTwitterUserCandidates(candidate, source);
      if (users.length) return users;
    }
  }
  return [];
}

export function sourcesFromSearchTweets(tweets: SearchTweet[], limit = 18): Source[] {
  const byAuthor = new Map<string, { user: TweetUser | undefined; author: string; tweets: SearchTweet[]; score: number }>();

  for (const tweet of tweets) {
    const author = cleanHandle(tweet.author || tweet.user?.screen_name || '');
    if (!author) continue;
    const current = byAuthor.get(author) || { user: tweet.user, author, tweets: [], score: 0 };
    current.tweets.push(tweet);
    current.score += 1 + likeWeight(tweet.likes || 0) + likeWeight(tweet.retweets || 0);
    if (tweet.user && !current.user) current.user = tweet.user;
    byAuthor.set(author, current);
  }

  return [...byAuthor.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => {
      const first = item.tweets[0] || {};
      const user = item.user || first.user;
      const type = sourceTypeForIndex(index);
      return {
        id: `twitter-${item.author.toLowerCase()}`,
        name: user?.name || item.author,
        handle: `@${item.author}`,
        avatar: user?.avatar_url || initials(user?.name || item.author),
        type,
        role: roleForType(type),
        content: 'Twitter/X search result',
        stance: stanceForType(type),
        lang: '动态',
        focus: clampNumber(82 - index * 2 + item.score, 55, 96),
        diversity: clampNumber(type === 'Diversity' ? 86 : 45 + index * 3, 35, 95),
        reason: buildSearchReason(item.author, item.tweets.length, first.text),
        state: 'new',
      };
    });
}

export function candidatesFromSearchTweets(tweets: SearchTweet[], limit = 40): TwitterUserCandidate[] {
  const byAuthor = new Map<string, { tweets: SearchTweet[]; user: TweetUser | undefined }>();

  for (const tweet of tweets) {
    const author = cleanHandle(tweet.author || tweet.user?.screen_name || '');
    if (!author) continue;
    const current = byAuthor.get(author) || { tweets: [], user: undefined };
    current.tweets.push(tweet);
    if (tweet.user && !current.user) current.user = tweet.user;
    byAuthor.set(author, current);
  }

  return [...byAuthor.entries()].slice(0, limit).map(([author, { tweets: items, user }]) => {
    const first = items[0] || {};
    const userInfo = user || first.user;
    return {
      name: userInfo?.name || author,
      handle: `@${author}`,
      username: author,
      bio: userInfo?.description || '',
      followers: userInfo?.followers_count,
      verified: userInfo?.is_verified,
      reason: `Appeared in ${items.length} relevant tweet search result(s). Representative tweet: ${String(first.text || '').replace(/\s+/g, ' ').slice(0, 180)}`,
      source: 'tweet_search',
    };
  });
}

export function candidatesFromSources(sources: Source[], source = 'ai_seed'): TwitterUserCandidate[] {
  return sources.map((item, index) => {
    const handle = cleanHandle(item.handle || item.name || `candidate-${index}`);
    return {
      name: item.name || handle,
      handle: handle ? `@${handle}` : '',
      username: handle,
      bio: [item.role, item.content, item.stance, item.lang].filter(Boolean).join(' · '),
      followers: undefined,
      verified: undefined,
      reason: item.reason || '',
      source,
    };
  });
}

export function mergeRecommendedSources(searchSources: Source[], aiSources: Source[], limit = 18, aiPerType = 2): Source[] {
  const aiSelected: Source[] = [];
  const aiSeen = new Set<string>();
  const aiByType = new Map<string, number>();
  for (const source of aiSources) {
    const type = normalizeSourceType(source.type);
    const count = aiByType.get(type) || 0;
    if (count >= aiPerType) continue;
    if (addUnique(aiSelected, aiSeen, { ...source, type }, Math.min(limit, aiPerType * 3))) {
      aiByType.set(type, count + 1);
    }
  }

  const result: Source[] = [];
  const seen = new Set<string>();
  for (const source of searchSources) {
    addUnique(result, seen, source, Math.max(0, limit - aiSelected.length));
  }
  for (const source of aiSelected) {
    addUnique(result, seen, source, limit);
  }
  for (const source of searchSources) {
    addUnique(result, seen, source, limit);
  }

  return result;
}

function addUnique(result: Source[], seen: Set<string>, source: Source, limit: number): boolean {
  if (result.length >= limit) return false;
  const key = cleanHandle(source.handle || source.name || '').toLowerCase();
  if (!key || seen.has(key)) return false;
  seen.add(key);
  result.push(source);
  return true;
}

function normalizeSourceType(value: unknown): 'Core' | 'Diversity' | 'Radar' {
  if (value === 'Core' || value === 'Diversity' || value === 'Radar') return value;
  return 'Radar';
}

function normalizeTwitterList(value: unknown): TwitterList | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<TwitterList>;
  if (!item.id || !item.name) return null;
  return {
    id: String(item.id),
    name: String(item.name),
    members: Number.isFinite(Number(item.members)) ? Number(item.members) : undefined,
    followers: Number.isFinite(Number(item.followers)) ? Number(item.followers) : undefined,
    mode: item.mode ? String(item.mode) : undefined,
    type: item.type ? String(item.type) : undefined,
  };
}

function normalizeTwitterUserCandidate(value: unknown, source: string): TwitterUserCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as {
    name?: string;
    handle?: string;
    username?: string;
    screen_name?: string;
    bio?: string;
    description?: string;
    followers?: number | string;
    followers_count?: number | string;
    followersCount?: number | string;
    verified?: boolean;
    is_blue_verified?: boolean;
    blue_verified?: boolean;
    reason?: string;
  };
  const handle = cleanHandle(item.handle || item.username || item.screen_name || '');
  if (!handle && !item.name) return null;
  return {
    name: item.name || handle,
    handle: handle ? `@${handle}` : '',
    username: handle,
    bio: item.bio || item.description || '',
    followers: normalizeCount(item.followers ?? item.followers_count ?? item.followersCount),
    verified: Boolean(item.verified || item.is_blue_verified || item.blue_verified),
    reason: item.reason || '',
    source,
  };
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toUpperCase();
  const number = Number.parseFloat(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(number)) return undefined;
  const multiplier = text.includes('M') ? 1000000 : text.includes('K') ? 1000 : 1;
  return Math.round(number * multiplier);
}

function extractPayload(value: ExecutionResult | unknown): unknown {
  if (!value || typeof value !== 'object') return parseMaybeJson(value);
  const obj = value as ExecutionResult & { data?: unknown };
  if (obj.task?.extract_data !== undefined) return parseMaybeJson(obj.task.extract_data);
  if (obj.data !== undefined) return parseMaybeJson(obj.data);
  return value;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
}

function isSearchTweet(value: unknown): value is SearchTweet {
  if (!value || typeof value !== 'object') return false;
  const item = value as SearchTweet;
  // Check for id (required) and either author or user.screen_name
  return Boolean(item.id && (item.author || item.user?.screen_name || item.text));
}

function likeWeight(value?: string | number): number {
  if (!value) return 0;
  let number: number;
  if (typeof value === 'number') {
    number = value;
  } else {
    const normalized = String(value).trim().toUpperCase();
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed)) return 0;
    const multiplier = normalized.includes('K') ? 1000 : normalized.includes('M') ? 1000000 : 1;
    number = parsed * multiplier;
  }
  return Math.min(8, Math.log10(number + 1));
}

function sourceTypeForIndex(index: number): 'Core' | 'Diversity' | 'Radar' {
  if (index % 5 === 2 || index % 7 === 4) return 'Diversity';
  if (index % 3 === 2) return 'Radar';
  return 'Core';
}

function roleForType(type: string): string {
  if (type === 'Diversity') return '多元视角来源';
  if (type === 'Radar') return '趋势观察来源';
  return '核心关注来源';
}

function stanceForType(type: string): string {
  if (type === 'Diversity') return '多元';
  if (type === 'Radar') return '观察';
  return '聚焦';
}

function buildSearchReason(author: string, count: number, text?: string): string {
  const excerpt = String(text || '').replace(/\s+/g, ' ').slice(0, 96);
  return `来自 Twitter/X 搜索结果，@${author} 在相关查询中出现 ${count} 次${excerpt ? `；代表内容：“${excerpt}”` : ''}`;
}

export function initials(value: string): string {
  return String(value || 'S').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
