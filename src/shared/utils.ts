// Shared utility functions

import type { SearchTweet, Source } from './types';

export function profileExists(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as {
    success?: boolean;
    error?: string;
    task?: { extract_data?: unknown };
  };

  if (data.success === false || data.error) return false;
  const extractData = data.task?.extract_data;
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

export function extractListId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const data = value as {
    list_id?: string;
    id?: string;
    data?: { list_id?: string; id?: string };
    task?: { extract_data?: unknown };
  };

  if (data.list_id) return data.list_id;
  if (data.id) return data.id;
  if (data.data?.list_id) return data.data.list_id;
  if (data.data?.id) return data.data.id;

  const extractData = data.task?.extract_data;
  if (extractData) {
    if (typeof extractData === 'string') {
      if (extractData.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(extractData);
          return parsed.list_id || parsed.id || parsed.data?.list_id || parsed.data?.id || '';
        } catch {
          return extractData;
        }
      }
      return extractData;
    }
    if (typeof extractData === 'object' && extractData !== null) {
      const obj = extractData as { list_id?: string; id?: string; data?: { list_id?: string; id?: string } };
      return obj.list_id || obj.id || obj.data?.list_id || obj.data?.id || '';
    }
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

export function extractSearchTweets(value: unknown): SearchTweet[] {
  const raw = extractPayload(value);
  if (Array.isArray(raw)) return raw.filter(isSearchTweet);
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; tweets?: unknown; results?: unknown; task?: { extract_data?: unknown } };
    for (const candidate of [obj.data, obj.tweets, obj.results, obj.task?.extract_data]) {
      const tweets = extractSearchTweets(candidate);
      if (tweets.length) return tweets;
    }
  }
  return [];
}

export function sourcesFromSearchTweets(tweets: SearchTweet[], limit = 18): Source[] {
  const byAuthor = new Map<string, { author: string; tweets: SearchTweet[]; score: number }>();

  for (const tweet of tweets) {
    const author = cleanHandle(tweet.author || '');
    if (!author) continue;
    const current = byAuthor.get(author) || { author, tweets: [], score: 0 };
    current.tweets.push(tweet);
    current.score += 1 + likeWeight(tweet.likes);
    byAuthor.set(author, current);
  }

  return [...byAuthor.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => {
      const first = item.tweets[0] || {};
      const type = sourceTypeForIndex(index);
      return {
        id: `twitter-${item.author.toLowerCase()}`,
        name: item.author,
        handle: `@${item.author}`,
        avatar: initials(item.author),
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

function extractPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return parseMaybeJson(value);
  const obj = value as { task?: { extract_data?: unknown }; data?: unknown };
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
  return Boolean(value && typeof value === 'object' && (value as SearchTweet).author);
}

function likeWeight(value?: string): number {
  if (!value) return 0;
  const normalized = String(value).trim().toUpperCase();
  const number = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(number)) return 0;
  const multiplier = normalized.includes('K') ? 1000 : normalized.includes('M') ? 1000000 : 1;
  return Math.min(8, Math.log10(number * multiplier + 1));
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
