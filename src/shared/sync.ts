// Tweet sync utilities shared between workflow and UI

import type { Agent } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from '../workflows/api';
import {
  extractSearchTweets,
  extractTwitterLists,
  getSavedLists,
  interestIdFor,
  saveLists,
  saveTweets,
  sleep,
  type TwitterList,
} from './index';

const apiIntervalMs = 15_000;
const defaultTweetLimit = 20;

export type SyncList = {
  key: string;
  name: string;
  listId: string;
  interestId?: string;
};

export type SyncResult = {
  success: boolean;
  message: string;
  interest: string;
  limit: number;
  syncedLists: Array<{
    key: string;
    name: string;
    listId: string;
    fetched: number;
    newTweets: number;
  }>;
  seenTweets: number;
  newTweets: number;
};

export type SyncProgress = {
  phase: 'prepare' | 'fetch' | 'save' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  listName?: string;
};

export type SyncOptions = {
  interest?: string;
  listIds?: string[];
  lists?: Array<{ key?: string; name?: string; listId: string }>;
  limit?: number;
  onProgress?: (progress: SyncProgress) => void;
};

export async function syncListTweets(
  agent: Agent,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const apis = createWorkflowApis(agent);
  const interest = options.interest?.trim() || 'Attention';
  const limit = normalizeLimit(options.limit, defaultTweetLimit);
  const onProgress = options.onProgress;

  onProgress?.({ phase: 'prepare', message: '正在准备同步...', current: 0, total: 0 });

  const lists = await resolveLists(agent, apis, options, interest);
  const syncedLists: SyncResult['syncedLists'] = [];
  let newTweets = 0;
  let seenTweets = 0;

  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    onProgress?.({
      phase: 'fetch',
      message: `正在获取 ${list.name} 的 tweets...`,
      current: i + 1,
      total: lists.length,
      listName: list.name,
    });

    const response = await callWithLimit(() => apis.twitter_list_tweets(list.listId, limit));
    const tweets = extractSearchTweets(response);

    onProgress?.({
      phase: 'save',
      message: `正在保存 ${tweets.length} 条 tweets...`,
      current: i + 1,
      total: lists.length,
      listName: list.name,
    });

    const added = await saveTweets(agent, interest, {
      listId: list.listId,
      listName: list.name,
    }, tweets);
    newTweets += added;
    seenTweets += tweets.length;
    syncedLists.push({
      key: list.key,
      name: list.name,
      listId: list.listId,
      fetched: tweets.length,
      newTweets: added,
    });
  }

  onProgress?.({
    phase: 'done',
    message: `同步完成，获取 ${seenTweets} 条，新增 ${newTweets} 条`,
    current: lists.length,
    total: lists.length,
  });

  return {
    success: true,
    message: `Synced ${seenTweets} tweet(s), saved ${newTweets} new tweet(s) from ${syncedLists.length} list(s)`,
    interest,
    limit,
    syncedLists,
    seenTweets,
    newTweets,
  };
}

async function resolveLists(
  agent: Agent,
  apis: ReturnType<typeof createWorkflowApis>,
  options: SyncOptions,
  interest: string,
): Promise<SyncList[]> {
  if (Array.isArray(options.lists) && options.lists.length) {
    return options.lists
      .map((item, index) => normalizeInputList(item, index))
      .filter((item): item is SyncList => Boolean(item?.listId));
  }

  if (Array.isArray(options.listIds) && options.listIds.length) {
    return options.listIds.map((id, index) => ({
      key: `manual-${index}`,
      name: `List ${id}`,
      listId: String(id),
    }));
  }

  const savedLists = await getSavedLists(agent);
  const targetInterestId = interestIdFor(interest);
  const matching = savedLists
    .filter(list => list.listId)
    .filter(list => !options.interest || list.interestId === targetInterestId)
    .map(list => ({
      key: list.key,
      name: list.name,
      listId: list.listId!,
      interestId: list.interestId,
    }));
  if (matching.length) return dedupeLists(matching);

  const response = await callWithLimit(() => apis.twitter_lists(100));
  const ownedLists = extractTwitterLists(response)
    .filter(list => list.type === 'suggest_owned_subscribed_list')
    .map(list => ({
      key: list.name,
      name: list.name,
      listId: list.id,
      interestId: targetInterestId,
    }));
  await saveLists(agent, interest, ownedLists.map(list => ({
    key: list.key,
    name: list.name,
    listId: list.listId,
    mode: 'reuse',
    created: false,
  })));
  return dedupeLists(ownedLists);
}

function normalizeInputList(value: unknown, index: number): SyncList | null {
  if (typeof value === 'string') {
    return { key: `manual-${index}`, name: `List ${value}`, listId: value };
  }
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<TwitterList> & { listId?: string; key?: string };
  const listId = item.listId || item.id || '';
  if (!listId) return null;
  return {
    key: item.key || item.name || `manual-${index}`,
    name: item.name || `List ${listId}`,
    listId,
  };
}

function dedupeLists(lists: SyncList[]): SyncList[] {
  const seen = new Set<string>();
  return lists.filter(list => {
    if (seen.has(list.listId)) return false;
    seen.add(list.listId);
    return true;
  });
}

function normalizeLimit(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.round(number)));
}

let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}