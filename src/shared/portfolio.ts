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
  return `Generate Twitter/X search queries for an attention portfolio.

Topic: ${topic}
Selected user goals: ${goalsText}
Confirmed portfolio layers: ${layersText}

Do not generate recommended users or sources directly.
Return searchQueries only.
Queries should discover active people, projects, companies, newsletters, and critical viewpoints.
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
        required: ['name', 'handle', 'type', 'role', 'content', 'stance', 'lang', 'reason'],
        properties: {
          name: { type: 'string' },
          handle: { type: 'string' },
          type: { type: 'string', enum: ['Core', 'Diversity', 'Radar'] },
          role: { type: 'string' },
          content: { type: 'string' },
          stance: { type: 'string' },
          lang: { type: 'string' },
          reason: { type: 'string' },
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
