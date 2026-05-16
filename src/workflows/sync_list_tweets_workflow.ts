/**
 * ---
 * name: Sync List Tweets
 * description: "Read new tweets from user-created X.com lists and save them for de-duplication"
 *
 * use when:
 * - Scheduled job needs to refresh tweets from prepared X.com lists
 * - User wants to sync tweets from one or more X.com lists
 *
 *
 * cron:
 * - 0 *\\/4 * * *
 * 
 * input:
 * - name: interest
 *   description: Optional interest area used to filter saved lists
 *   required: false
 * - name: listIds
 *   description: Optional array of X.com list IDs to sync
 *   required: false
 * - name: limit
 *   description: Number of tweets to read per list
 *   required: false
 *
 * output:
 * - success: bool
 * - message: string
 * - data: sync summary
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from './api';
import {
  extractSearchTweets,
  extractTwitterLists,
  getSavedLists,
  interestIdFor,
  saveLists,
  saveTweets,
  sleep,
  type TwitterList,
} from '../shared';

const apiIntervalMs = 15_000;
const defaultTweetLimit = 20;

type SyncList = {
  key: string;
  name: string;
  listId: string;
  interestId?: string;
};

export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const params = context.params || {};
  const interest = typeof params.interest === 'string' && params.interest.trim()
    ? params.interest.trim()
    : 'Attention';
  const limit = normalizeLimit(params.limit, defaultTweetLimit);

  const lists = await resolveLists(agent, apis, params, interest);
  const syncedLists = [];
  let newTweets = 0;
  let seenTweets = 0;

  for (const list of lists) {
    const response = await callWithLimit(() => apis.twitter_list_tweets(list.listId, limit));
    const tweets = extractSearchTweets(response);
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

  return {
    success: true,
    message: `Synced ${seenTweets} tweet(s), saved ${newTweets} new tweet(s) from ${syncedLists.length} list(s)`,
    data: {
      interest,
      limit,
      syncedLists,
      seenTweets,
      newTweets,
      page: agent.getPageLink('tweets', { interest }),
    },
  };
}

async function resolveLists(
  agent: Agent,
  apis: ReturnType<typeof createWorkflowApis>,
  params: Record<string, unknown>,
  interest: string,
): Promise<SyncList[]> {
  if (Array.isArray(params.lists) && params.lists.length) {
    return params.lists
      .map((item, index) => normalizeInputList(item, index))
      .filter((item): item is SyncList => Boolean(item?.listId));
  }

  if (Array.isArray(params.listIds) && params.listIds.length) {
    return params.listIds.map((id, index) => ({
      key: `manual-${index}`,
      name: `List ${id}`,
      listId: String(id),
    }));
  }

  const savedLists = await getSavedLists(agent);
  const targetInterestId = interestIdFor(interest);
  const matching = savedLists
    .filter(list => list.listId)
    .filter(list => !params.interest || list.interestId === targetInterestId)
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

// @ts-ignore
globalThis.execute = execute;
