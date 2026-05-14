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
  extractTwitterLists,
  extractTwitterUserCandidates,
  candidatesFromSearchTweets,
  candidatesFromSources,
  portfolioSchema,
  portfolioPrompt,
  searchQuerySchema,
  searchQueryPrompt,
  aiSourceSchema,
  aiSourcePrompt,
  candidateFilterSchema,
  candidateFilterPrompt,
  saveInterestField,
  saveKolCandidates,
  saveKols,
  type Source,
  type PortfolioModel,
  type TwitterList,
} from '../shared';

const apiIntervalMs = 15_000;
const searchQueryLimit = 3;
const searchResultLimit = 10;
const suggestedKolLimit = 20;
const listSearchLimit = 30;
const listSearchQueryLimit = 2;
const listMembersListLimit = 4;
const listMembersLimit = 20;
const profileEnrichmentLimit = 12;
type CandidateChannel = 'ai_seed' | 'tweet_search' | 'twitter_suggested' | 'list_search';

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

  if (params.action === 'generate_queries') {
    const state = await resolvePortfolioState(agent, topic, params);
    return {
      success: true,
      message: `Generated search queries for ${topic}`,
      data: {
        interest: topic,
        selectedGoals: state.selectedGoals,
        layers: state.layers,
        searchQueries: await generateSearchQueries(agent, topic, state.selectedGoals, state.layers),
      },
    };
  }

  if (params.action === 'collect_candidates') {
    const state = await resolvePortfolioState(agent, topic, params);
    const searchQueries = resolveSearchQueries(params, await generateSearchQueries(agent, topic, state.selectedGoals, state.layers));
    const channels = resolveChannels(params.channels);
    const candidates = await collectCandidates(agent, apis, topic, state.selectedGoals, state.layers, searchQueries, channels);
    await saveKolCandidates(agent, topic, dedupeCandidates(candidates));
    return {
      success: true,
      message: `Collected ${candidates.length} candidate(s) for ${topic}`,
      data: { interest: topic, selectedGoals: state.selectedGoals, layers: state.layers, searchQueries, channels, candidates },
    };
  }

  if (params.action === 'filter_candidates') {
    const state = await resolvePortfolioState(agent, topic, params);
    const candidates = Array.isArray(params.candidates) ? params.candidates : [];
    const excludedHandles = resolveExcludedHandles(params.excludedHandles);
    const filteredCandidates = excludeExistingCandidates(dedupeCandidates(candidates), excludedHandles);
    await saveKolCandidates(agent, topic, filteredCandidates);
    const sources = await filterKolCandidates(agent, topic, state.selectedGoals, state.layers, filteredCandidates, excludedHandles);
    await saveKols(agent, topic, sources);
    return {
      success: true,
      message: `Filtered ${sources.length} source(s) for ${topic}`,
      data: { interest: topic, selectedGoals: state.selectedGoals, layers: state.layers, candidates, sources },
    };
  }

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
  const searchQueries = await generateSearchQueries(agent, topic, selectedGoals, layers);
  const candidates = await collectCandidates(agent, apis, topic, selectedGoals, layers, searchQueries);
  await saveKolCandidates(agent, topic, dedupeCandidates(candidates));
  const sources = await filterKolCandidates(agent, topic, selectedGoals, layers, candidates);

  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: Array.isArray(data.layers) ? data.layers : [],
    sources,
    searchQueries,
  };
}

async function resolvePortfolioState(agent: Agent, topic: string, params: Record<string, unknown>) {
  const selectedGoals = Array.isArray(params.targets)
    ? params.targets.map(String)
    : Array.isArray(params.selectedGoals)
      ? params.selectedGoals.map(String)
      : [];
  const layers = Array.isArray(params.layers) ? params.layers.map(String) : [];
  if (selectedGoals.length || layers.length) return { selectedGoals, layers };

  const result = await agent.complete(portfolioPrompt(topic), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: portfolioSchema,
  });
  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  return {
    selectedGoals: Array.isArray(data.goals) ? data.goals.map(goal => goal.title).filter(Boolean) : [],
    layers: Array.isArray(data.layers) ? data.layers.map(layer => `${layer.name}: ${layer.description}`).filter(Boolean) : [],
  };
}

async function generateSearchQueries(agent: Agent, topic: string, selectedGoals: string[], layers: string[]): Promise<string[]> {
  const queryResult = await agent.complete(searchQueryPrompt(topic, selectedGoals, layers), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: searchQuerySchema,
  });
  const queryData = (queryResult.json || parseJson(queryResult.text || '')) as Partial<PortfolioModel>;
  return Array.isArray(queryData.searchQueries) && queryData.searchQueries.length
    ? queryData.searchQueries
    : [topic];
}

async function collectCandidates(
  agent: Agent,
  apis: ReturnType<typeof createWorkflowApis>,
  topic: string,
  selectedGoals: string[],
  layers: string[],
  searchQueries: string[],
  channels: CandidateChannel[] = ['ai_seed', 'tweet_search', 'twitter_suggested', 'list_search'],
) {
  const candidates = [];

  if (channels.includes('ai_seed')) {
    const aiResult = await agent.complete(aiSourcePrompt(topic, selectedGoals, layers), {
      system: 'You generate concise valid JSON matching the provided schema.',
      jsonSchema: aiSourceSchema,
    });
    const aiData = (aiResult.json || parseJson(aiResult.text || '')) as Partial<PortfolioModel>;
    const aiSources = Array.isArray(aiData.sources) ? aiData.sources : [];
    candidates.push(...candidatesFromSources(aiSources, 'ai_seed'));
  }

  if (channels.includes('tweet_search')) {
    for (const query of searchQueries.slice(0, searchQueryLimit)) {
      const response = await callWithLimit(() => apis.twitter_search(query, undefined, searchResultLimit));
      candidates.push(...candidatesFromSearchTweets(extractSearchTweets(response)));
    }
  }

  candidates.push(...await collectExternalCandidates(apis, searchQueries, channels));
  await enrichCandidateProfiles(apis, candidates);
  return dedupeCandidates(candidates);
}

async function collectExternalCandidates(
  apis: ReturnType<typeof createWorkflowApis>,
  searchQueries: string[],
  channels: CandidateChannel[] = ['twitter_suggested', 'list_search'],
) {
  const suggestedCandidates = [];
  const listMemberCandidates = [];

  if (channels.includes('twitter_suggested')) {
    const suggestedResponse = await callWithLimit(() => apis.twitter_suggested(suggestedKolLimit));
    suggestedCandidates.push(...extractTwitterUserCandidates(suggestedResponse, 'twitter_suggested'));
  }

  if (channels.includes('list_search')) {
    for (const query of searchQueries.slice(0, listSearchQueryLimit)) {
      const listsResponse = await callWithLimit(() => apis.twitter_list_search(query, listSearchLimit));
      const lists = pickHighSignalLists(extractTwitterLists(listsResponse), listMembersListLimit);
      for (const list of lists) {
        const membersResponse = await callWithLimit(() => apis.twitter_list_members(list.id, listMembersLimit));
        listMemberCandidates.push(...extractTwitterUserCandidates(membersResponse, `twitter_list_members:${list.name}`));
      }
    }
  }

  return [...suggestedCandidates, ...listMemberCandidates];
}

async function enrichCandidateProfiles(apis: ReturnType<typeof createWorkflowApis>, candidates: unknown[]) {
  const needsProfile = dedupeCandidates(candidates)
    .filter(candidate => {
      const item = candidate as { followers?: number; verified?: boolean; bio?: string };
      return item.followers === undefined || item.verified === undefined || !item.bio;
    })
    .slice(0, profileEnrichmentLimit) as Array<{ handle?: string; username?: string; name?: string; bio?: string; followers?: number; verified?: boolean; reason?: string }>;

  for (const candidate of needsProfile) {
    const username = cleanHandle(candidate.handle || candidate.username || candidate.name || '');
    if (!username) continue;
    const response = await callWithLimit(() => apis.twitter_profile(username));
    const profile = extractTwitterUserCandidates(response, 'twitter_profile')[0];
    if (!profile) continue;
    candidate.name = profile.name || candidate.name;
    candidate.handle = profile.handle || candidate.handle;
    candidate.username = profile.username || candidate.username;
    candidate.bio = profile.bio || candidate.bio || '';
    candidate.followers = profile.followers ?? candidate.followers;
    candidate.verified = profile.verified ?? candidate.verified;
    candidate.reason = [candidate.reason, profile.reason].filter(Boolean).join(' ');
  }
}

async function filterKolCandidates(
  agent: Agent,
  topic: string,
  selectedGoals: string[],
  layers: string[],
  candidates: unknown[],
  excludedHandles: string[] = [],
): Promise<Source[]> {
  const deduped = excludeExistingCandidates(dedupeCandidates(candidates), excludedHandles).slice(0, 100);
  if (!deduped.length) return [];
  const result = await agent.complete(candidateFilterPrompt(
    topic,
    selectedGoals,
    layers,
    JSON.stringify(deduped),
    excludedHandles,
  ), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: candidateFilterSchema,
  });
  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  return Array.isArray(data.sources) ? data.sources : [];
}

function dedupeCandidates(candidates: unknown[]) {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as { handle?: string; username?: string; name?: string };
    const key = cleanHandle(item.handle || item.username || item.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function excludeExistingCandidates(candidates: unknown[], excludedHandles: string[]) {
  const excluded = new Set(excludedHandles.map(handle => cleanHandle(handle).toLowerCase()));
  return candidates.filter(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as { handle?: string; username?: string; name?: string };
    const key = cleanHandle(item.handle || item.username || item.name || '').toLowerCase();
    return !key || !excluded.has(key);
  });
}

function pickHighSignalLists(lists: TwitterList[], limit: number): TwitterList[] {
  return lists
    .filter(list => list.id)
    .sort((a, b) => (b.followers || 0) - (a.followers || 0) || (b.members || 0) - (a.members || 0))
    .slice(0, limit);
}

function resolveSearchQueries(params: Record<string, unknown>, fallback: string[]): string[] {
  return Array.isArray(params.searchQueries) && params.searchQueries.length
    ? params.searchQueries.map(String)
    : fallback;
}

function resolveChannels(value: unknown): CandidateChannel[] {
  const allowed: CandidateChannel[] = ['ai_seed', 'tweet_search', 'twitter_suggested', 'list_search'];
  if (!Array.isArray(value) || !value.length) return allowed;
  const channels = value.filter((item): item is CandidateChannel => allowed.includes(item as CandidateChannel));
  return channels.length ? channels : allowed;
}

function resolveExcludedHandles(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => cleanHandle(String(item)).toLowerCase()).filter(Boolean)
    : [];
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
