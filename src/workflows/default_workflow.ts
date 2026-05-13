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

type Source = {
  name?: string;
  handle?: string;
  type?: string;
  portfolioType?: string;
};

type Portfolio = {
  core?: Source[];
  diversity?: Source[];
  radar?: Source[];
};

type PortfolioModel = {
  goals: unknown[];
  distribution: unknown[];
  layers: unknown[];
  sources: unknown[];
};

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
    const result = await generatePortfolio(agent, topic);
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
    const response = await apis.twitter_list_create(
      name,
      `${interest} ${capitalize(key)} attention portfolio`,
      true,
    );
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

      const addResponse = await apis.twitter_list_add(listId, username);
      addedAccounts.push({ key, handle: username, response: addResponse });
    }
  }

  return { createdLists, addedAccounts, skippedAccounts };
}

const portfolioSchema = {
  type: 'object',
  required: ['goals', 'distribution', 'layers', 'sources'],
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
    sources: {
      type: 'array',
      minItems: 12,
      maxItems: 18,
      items: {
        type: 'object',
        required: ['id', 'name', 'handle', 'avatar', 'type', 'role', 'content', 'stance', 'lang', 'focus', 'diversity', 'reason'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          handle: { type: 'string' },
          avatar: { type: 'string' },
          type: { type: 'string', enum: ['Core', 'Diversity', 'Radar'] },
          role: { type: 'string' },
          content: { type: 'string' },
          stance: { type: 'string' },
          lang: { type: 'string' },
          focus: { type: 'number' },
          diversity: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

async function generatePortfolio(agent: Agent, topic: string): Promise<PortfolioModel> {
  const { text } = await agent.complete(portfolioPrompt(topic), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: portfolioSchema,
  });
  const data = parseJson(text) as Partial<PortfolioModel>;
  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: Array.isArray(data.layers) ? data.layers : [],
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

function portfolioPrompt(topic: string) {
  return `Generate an attention portfolio for this topic: ${topic}

Return valid JSON matching the schema. Use real public accounts/projects/publications when known; otherwise use descriptive placeholders useful for the topic. Distribution values must sum to 100.`;
}

function parseJson(text: string): unknown {
  const withoutFence = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Agent did not return JSON');
  }
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function normalizePortfolio(value: unknown): Required<Portfolio> {
  const portfolio = value && typeof value === 'object' ? value as Portfolio : {};
  return {
    core: Array.isArray(portfolio.core) ? portfolio.core : [],
    diversity: Array.isArray(portfolio.diversity) ? portfolio.diversity : [],
    radar: Array.isArray(portfolio.radar) ? portfolio.radar : [],
  };
}

function extractListId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const data = value as {
    list_id?: string;
    id?: string;
    data?: { list_id?: string; id?: string };
    task?: { extract_data?: string };
  };

  if (data.list_id) return data.list_id;
  if (data.id) return data.id;
  if (data.data?.list_id) return data.data.list_id;
  if (data.data?.id) return data.data.id;

  if (data.task?.extract_data) {
    try {
      const parsed = JSON.parse(data.task.extract_data);
      return parsed.list_id || parsed.id || parsed.data?.list_id || parsed.data?.id || '';
    } catch {
      return data.task.extract_data;
    }
  }

  return '';
}

function cleanHandle(value: string) {
  return value.trim().replace(/^@/, '');
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
// @ts-ignore
globalThis.execute = execute;
