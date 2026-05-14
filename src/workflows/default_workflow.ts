/**
 * ---
 * name: Default Workflow
 * description: "Default workflow entry point"
 *
 * use when:
 * - User requests an action
 *
 * input:
 * - name: foo
 *   description: describe param foo
 *   required: true
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from './api';
import {
  profileExists,
  extractListId,
  cleanHandle,
  capitalize,
  parseJson,
  sleep,
  extractSearchTweets,
  sourcesFromSearchTweets,
  portfolioSchema,
  portfolioPrompt,
  type Portfolio,
  type PortfolioModel,
} from '../shared';

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const params = context.params || {};

  console.log("Task:", context.task);
  console.log("Params:", params);

  if (params.action === 'create_x_lists') {
    const result = await createXLists(apis, params);
    return {
      success: true,
      message: `Created ${result.createdLists.length} list request(s), submitted ${result.addedAccounts.length} account add request(s)`,
      data: result,
    };
  }

  if (params.action === 'generate_portfolio') {
    const topic = typeof params.interest === 'string' && params.interest.trim()
      ? params.interest.trim()
      : context.task;
    const result = await generatePortfolio(agent, apis, topic);
    return {
      success: true,
      message: `Generated attention portfolio for ${topic}`,
      data: result,
    };
  }

  return {
    success: true,
    message: 'Workflow completed successfully',
    data: {
      page: agent.getPageLink('index', {
        interest: typeof params.interest === 'string' ? params.interest : '',
      }),
    },
  };
}

async function createXLists(apis: ReturnType<typeof createWorkflowApis>, params: Record<string, unknown>) {
  const interest = typeof params.interest === 'string' && params.interest.trim()
    ? params.interest.trim()
    : 'Attention';
  const portfolio = normalizePortfolio(params.portfolio);
  const createdLists: Array<{ key: string; name: string; response: unknown; listId: string }> = [];
  const addedAccounts: Array<{ key: string; handle: string; response: unknown }> = [];
  const skippedAccounts: Array<{ key: string; handle: string; reason: string }> = [];

  for (const key of ['core', 'diversity', 'radar'] as const) {
    const sources = portfolio[key] || [];
    if (!sources.length) continue;

    const name = `${interest} - ${capitalize(key)}`;
    const response = await callWithLimit(() => apis.twitter_list_create(
      name,
      `${interest} ${capitalize(key)} attention portfolio`,
      true,
    ));
    const listId = extractListId(response);
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

async function generatePortfolio(
  agent: Agent,
  apis: ReturnType<typeof createWorkflowApis>,
  topic: string,
): Promise<PortfolioModel> {
  const result = await agent.complete(portfolioPrompt(topic), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: portfolioSchema,
  });
  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  const searchQueries = Array.isArray(data.searchQueries) && data.searchQueries.length
    ? data.searchQueries
    : [topic];
  const tweets = [];

  for (const query of searchQueries.slice(0, 6)) {
    const response = await callWithLimit(() => apis.twitter_search(query, undefined, 20));
    tweets.push(...extractSearchTweets(response));
  }

  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: Array.isArray(data.layers) ? data.layers : [],
    sources: sourcesFromSearchTweets(tweets, 18),
    searchQueries,
  };
}

let nextApiAt = 0;
const apiIntervalMs = 900;

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

// @ts-ignore
globalThis.execute = execute;
