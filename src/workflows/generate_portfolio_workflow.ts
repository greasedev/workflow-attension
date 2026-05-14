/**
 * ---
 * name: Generate Portfolio
 * description: "Generate attention portfolio with goals, distribution, layers, and sources"
 *
 * use when:
 * - User wants to generate an attention portfolio
 * - User specifies a topic or interest area
 *
 * input:
 * - name: interest
 *   description: The topic or interest area for the portfolio
 *   required: true
 *
 * output:
 * - success: bool
 * - message: string
 * - data: PortfolioModel
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from './api';
import {
  cleanHandle,
  parseJson,
  sleep,
  extractSearchTweets,
  sourcesFromSearchTweets,
  mergeRecommendedSources,
  portfolioSchema,
  portfolioPrompt,
  searchQuerySchema,
  searchQueryPrompt,
  aiSourceSchema,
  aiSourcePrompt,
  saveInterestField,
  saveKols,
  type PortfolioModel,
} from '../shared';

const apiIntervalMs = 15_000;
const searchQueryLimit = 3;
const searchResultLimit = 10;

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const params = context.params || {};

  const topic = typeof params.interest === 'string' && params.interest.trim()
    ? params.interest.trim()
    : context.task;

  console.log("Task:", context.task);
  console.log("Topic:", topic);

  const result = await generatePortfolio(agent, apis, topic);
  await saveInterestField(agent, topic, result, result.goals.map(goal => goal.title));
  await saveKols(agent, topic, result.sources);

  return {
    success: true,
    message: `Generated attention portfolio for ${topic}`,
    data: result,
  };
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

  if (!result.json && !result.text) {
    throw new Error('Agent returned empty response - check OPENAI_API_KEY and LOCAL_MODEL configuration');
  }

  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  const selectedGoals = Array.isArray(data.goals)
    ? data.goals.map(goal => goal.title).filter(Boolean)
    : [];
  const layers = Array.isArray(data.layers)
    ? data.layers.map(layer => `${layer.name}: ${layer.description}`).filter(Boolean)
    : [];

  const queryResult = await agent.complete(searchQueryPrompt(topic, selectedGoals, layers), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: searchQuerySchema,
  });
  const queryData = (queryResult.json || parseJson(queryResult.text || '')) as Partial<PortfolioModel>;
  const searchQueries = Array.isArray(queryData.searchQueries) && queryData.searchQueries.length
    ? queryData.searchQueries
    : [topic];

  const aiResult = await agent.complete(aiSourcePrompt(topic, selectedGoals, layers), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: aiSourceSchema,
  });
  const aiData = (aiResult.json || parseJson(aiResult.text || '')) as Partial<PortfolioModel>;
  const aiSources = Array.isArray(aiData.sources) ? aiData.sources : [];

  const tweets = [];
  for (const query of searchQueries.slice(0, searchQueryLimit)) {
    const response = await callWithLimit(() => apis.twitter_search(query, undefined, searchResultLimit));
    tweets.push(...extractSearchTweets(response));
  }

  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: Array.isArray(data.layers) ? data.layers : [],
    sources: mergeRecommendedSources(sourcesFromSearchTweets(tweets, 18), aiSources, 18, 2),
    searchQueries,
  };
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
