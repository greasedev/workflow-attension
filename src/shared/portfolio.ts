// Portfolio schema and prompt

import type { JsonSchema } from '@greaseclaw/workflow-sdk';

export const portfolioSchema: JsonSchema = {
  type: 'object',
  required: ['goals', 'distribution', 'layers', 'searchQueries'],
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
    searchQueries: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'string' },
    },
  },
};

export function portfolioPrompt(topic: string): string {
  return `Generate an attention portfolio structure for "${topic}".

Do not generate recommended users or sources directly.
Return goals, distribution, layers, and searchQueries only.
searchQueries should be Twitter/X search queries that can discover active people, projects, companies, newsletters, and critical viewpoints for the topic.
Include a mix of technical, product, business, safety/criticism, and regional query angles.`;
}