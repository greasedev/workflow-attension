/**
 * ---
 * name: Create X Lists
 * description: "Create X.com lists for an attention portfolio"
 *
 * use when:
 * - User wants to create X.com lists from a portfolio
 * - User has selected sources to add to lists
 *
 * input:
 * - name: interest
 *   description: The topic or interest area for the lists
 *   required: true
 * - name: portfolio
 *   description: Portfolio with core, diversity, and radar sources
 *   required: true
 *
 * output:
 * - success: bool
 * - message: string
 * - data: createdLists, addedAccounts, skippedAccounts
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis, type ExecutionResult } from './api';
import {
  profileExists,
  extractListId,
  cleanHandle,
  capitalize,
  sleep,
  extractTwitterLists,
  type Portfolio,
  type TwitterList,
} from '../shared';

const apiIntervalMs = 15_000;

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const params = context.params || {};

  const interest = typeof params.interest === 'string' && params.interest.trim()
    ? params.interest.trim()
    : 'Attention';

  console.log("Task:", context.task);
  console.log("Interest:", interest);

  const result = await createXLists(apis, params, interest);

  return {
    success: true,
    message: `Created ${result.createdLists.length} list request(s), submitted ${result.addedAccounts.length} account add request(s)`,
    data: result,
  };
}

async function createXLists(
  apis: ReturnType<typeof createWorkflowApis>,
  params: Record<string, unknown>,
  interest: string,
) {
  const portfolio = normalizePortfolio(params.portfolio);
  const createdLists: Array<{ key: string; name: string; response: ExecutionResult | { reused: true; list: TwitterList }; listId: string }> = [];
  const addedAccounts: Array<{ key: string; handle: string; response: ExecutionResult }> = [];
  const skippedAccounts: Array<{ key: string; handle: string; reason: string }> = [];

  const listsResponse = await callWithLimit(() => apis.twitter_lists(100));
  const ownedLists = extractTwitterLists(listsResponse).filter(list => list.type === 'suggest_owned_subscribed_list');

  for (const key of ['core', 'diversity', 'radar'] as const) {
    const sources = portfolio[key] || [];
    if (!sources.length) continue;

    const name = `${interest} - ${capitalize(key)}`;
    const reusableList = findReusableWorkflowList(ownedLists, name, interest, key);
    let listId: string;
    let response: ExecutionResult | { reused: true; list: TwitterList };

    if (reusableList) {
      listId = reusableList.id;
      response = { reused: true, list: reusableList };
    } else {
      response = await callWithLimit(() => apis.twitter_list_create(
        name,
        `${interest} ${capitalize(key)} attention portfolio`,
        true,
      ));
      listId = extractListId(response);
    }

    createdLists.push({ key, name, response, listId });

    for (const source of sources) {
      const username = cleanHandle(source.handle || source.name || '');
      if (!username) {
        skippedAccounts.push({ key, handle: source.handle || source.name || '', reason: 'missing username' });
        continue;
      }
      if (!listId) {
        skippedAccounts.push({ key, handle: username, reason: 'listcreate did not return list_id' });
        continue;
      }

      const profile = await callWithLimit(() => apis.twitter_profile(username));
      if (!profileExists(profile)) {
        skippedAccounts.push({ key, handle: username, reason: 'twitter_profile did not find user' });
        continue;
      }

      const addResponse = await callWithLimit(() => apis.twitter_list_add(listId, username));
      addedAccounts.push({ key, handle: username, response: addResponse });
    }
  }

  return { createdLists, addedAccounts, skippedAccounts };
}

let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}

function normalizePortfolio(value: unknown): Required<Portfolio> {
  const portfolio = value && typeof value === 'object' ? value as Portfolio : {};
  return {
    core: Array.isArray(portfolio.core) ? portfolio.core : [],
    diversity: Array.isArray(portfolio.diversity) ? portfolio.diversity : [],
    radar: Array.isArray(portfolio.radar) ? portfolio.radar : [],
  };
}

function findReusableWorkflowList(lists: TwitterList[], expectedName: string, interest: string, key: string): TwitterList | undefined {
  const expected = normalizeWorkflowListName(expectedName);
  const topic = normalizeWorkflowListName(interest);
  const layer = normalizeWorkflowListName(capitalize(key));
  return lists.find(list => normalizeWorkflowListName(list.name) === expected)
    || lists.find(list => {
      const name = normalizeWorkflowListName(list.name);
      return Boolean(topic && layer && name.includes(topic) && name.includes(layer));
    });
}

function normalizeWorkflowListName(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9一-龥]+/g, '');
}

// @ts-ignore
globalThis.execute = execute;