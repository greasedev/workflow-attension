// Portfolio schema and prompt

import type { JsonSchema } from '@greaseclaw/workflow-sdk';

export const portfolioSchema: JsonSchema = {
  type: 'object',
  required: ['goals', 'distribution', 'layers'],
  properties: {
    goals: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        required: ['id', 'title', 'titleEn', 'description', 'tags', 'icon'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          titleEn: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          icon: { type: 'string' },
        },
      },
    },
    distribution: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'value'],
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
        },
      },
    },
    layers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'name', 'nameCn', 'description', 'tags', 'suggested'],
        properties: {
          key: { type: 'string', enum: ['core', 'diversity', 'radar'] },
          name: { type: 'string' },
          nameCn: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          suggested: { type: 'string' },
        },
      },
    },
  },
};

export function portfolioPrompt(topic: string): string {
  return `Generate an attention portfolio structure for "${topic}".

Do not generate recommended users or sources directly.
Do not generate Twitter/X search queries yet.
Return goals, distribution, and layers only.
The user will choose goals first; search queries must be inferred later from the selected goals and confirmed portfolio structure.`;
}

export const searchQuerySchema: JsonSchema = {
  type: 'object',
  required: ['searchQueries'],
  properties: {
    searchQueries: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'string' },
    },
  },
};

export function searchQueryPrompt(topic: string, selectedGoals: string[], layers: string[]): string {
  const goalsText = selectedGoals.length ? selectedGoals.join(', ') : 'general learning';
  const layersText = layers.length ? layers.join(', ') : 'core, diversity, radar';
  return `Generate valid X/Twitter Recent Search API queries for an attention portfolio.

Topic: ${topic}
Selected user goals: ${goalsText}
Confirmed portfolio layers: ${layersText}

Do not generate recommended users or sources directly.
Return searchQueries only.
Return 3-6 query strings.

Hard rules for every query:
- Must be valid for X Recent Search.
- Must be 512 characters or less.
- Must include at least one standalone keyword, exact phrase, hashtag, cashtag, or from: operator.
- Do not output a query made only from conjunction-required operators such as has:media, has:links, has:mentions, is:retweet, lang:en, or place_country:US.
- Prefer specific grouped keywords: ("exact phrase" OR keyword OR #hashtag).
- Use parentheses when OR appears with other terms.
- Use spaces for AND.
- Use -term or -is:retweet for exclusions.
- You may use engagement filters like min_replies:20, min_faves:100, and min_retweets:50 to find higher-signal Posts, but only together with standalone keywords or phrases.
- Keep engagement thresholds realistic for the topic; use higher thresholds for broad topics and lower thresholds for niche topics.
- Do not negate grouped expressions.
- Do not use unsupported prose, commas as separators, markdown, comments, or URL encoding.
- Do not include the word query=.
- Prefer adding lang:en -is:retweet unless the topic clearly requires another language.

Good query shape examples:
("AI agents" OR "agentic AI" OR #AIAgents) lang:en -is:retweet
("robotics" OR "humanoid robot") (startup OR research OR demo) lang:en -is:retweet
("AI safety" OR alignment OR evals) lang:en -is:retweet
("AI agents" OR "agentic AI") min_faves:100 min_retweets:20 lang:en -is:retweet
("AI safety" OR alignment) min_replies:20 lang:en -is:retweet

Generate queries that discover active people, projects, companies, newsletters, and critical viewpoints.
Include a mix of technical, product, business, safety/criticism, and regional angles that match the selected goals.`;
}

export const aiSourceSchema: JsonSchema = {
  type: 'object',
  required: ['sources'],
  properties: {
    sources: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        required: ['name', 'handle', 'type', 'role', 'content', 'stance', 'lang', 'reason', 'candidateSource'],
        properties: {
          name: { type: 'string' },
          handle: { type: 'string' },
          type: { type: 'string', enum: ['Core', 'Diversity', 'Radar'] },
          role: { type: 'string' },
          content: { type: 'string' },
          stance: { type: 'string' },
          lang: { type: 'string' },
          reason: { type: 'string' },
          candidateSource: { type: 'string' },
        },
      },
    },
  },
};

export function aiSourcePrompt(topic: string, selectedGoals: string[], layers: string[]): string {
  const goalsText = selectedGoals.length ? selectedGoals.join(', ') : 'general learning';
  const layersText = layers.length ? layers.join(', ') : 'Core, Diversity, Radar';
  return `Suggest a small number of Twitter/X accounts as AI seed sources for an attention portfolio.

Topic: ${topic}
Selected user goals: ${goalsText}
Confirmed portfolio layers: ${layersText}

Return sources only.
Generate 1-2 accounts for each type: Core, Diversity, and Radar.
Only include widely known or highly likely real Twitter/X accounts. Do not invent handles.
Search API results will remain the main source of recommendations; these AI seed accounts are only a small supplement.`;
}

export const candidateFilterSchema: JsonSchema = aiSourceSchema;

export function candidateFilterPrompt(
  topic: string,
  selectedGoals: string[],
  layers: string[],
  candidatesJson: string,
  excludedHandles: string[] = [],
): string {
  const goalsText = selectedGoals.length ? selectedGoals.join(', ') : 'general learning';
  const layersText = layers.length ? layers.join(', ') : 'Core, Diversity, Radar';
  const excludedText = excludedHandles.length ? excludedHandles.join(', ') : 'none';
  return `Filter raw Twitter/X KOL candidates for an attention portfolio.

Topic: ${topic}
Selected user goals: ${goalsText}
Confirmed portfolio layers: ${layersText}
Already in selected user lists, exclude these handles: ${excludedText}

Raw candidates JSON:
${candidatesJson}

Return sources only.
Choose only candidates that are clearly relevant to the topic and selected goals.
Discard generic celebrities, unrelated accounts, inactive-looking accounts, brands unrelated to the topic, and low-information candidates.
Do not select accounts that are already in the selected user lists.
Use followers and verified as quality signals, but do not select an account only because it has many followers or is verified.
Assign each kept account to exactly one type: Core, Diversity, or Radar.
Prefer accounts with clear handles. Do not invent handles or names.
Keep the final list small and high precision: 3-9 accounts total.
Set candidateSource to the source channel(s) that produced the candidate, such as ai_seed, tweet_search, twitter_suggested, or twitter_list_members.
Use reason to briefly explain why the candidate matched and mention which source(s) it came from.`;
}
