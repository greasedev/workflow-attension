import type { Agent, Dexie } from '@greaseclaw/workflow-sdk';
import type { PortfolioModel, Source } from './types';

type DbAgent = Pick<Agent, 'getDb'>;

type ListRecordInput = {
  key: string;
  name: string;
  listId?: string;
  mode?: string;
  created?: boolean;
};

const dbSetup = new WeakMap<Dexie, Promise<Dexie>>();

export function interestIdFor(topic: string): string {
  return String(topic || 'attention')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'attention';
}

export async function getPortfolioDb(agent: DbAgent): Promise<Dexie> {
  const db = agent.getDb();
  const current = dbSetup.get(db);
  if (current) return current;

  const setup = setupDb(db);
  dbSetup.set(db, setup);
  return setup;
}

export async function saveInterestField(
  agent: DbAgent,
  topic: string,
  model?: Partial<PortfolioModel>,
  selectedGoals: string[] = [],
): Promise<void> {
  const db = await getPortfolioDb(agent);
  const now = new Date().toISOString();
  await db.table('interest_fields').put({
    id: interestIdFor(topic),
    topic,
    selectedGoals,
    goals: model?.goals || [],
    distribution: model?.distribution || [],
    layers: model?.layers || [],
    searchQueries: model?.searchQueries || [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function saveKols(agent: DbAgent, topic: string, sources: Source[]): Promise<void> {
  if (!sources.length) return;
  const db = await getPortfolioDb(agent);
  const interestId = interestIdFor(topic);
  const now = new Date().toISOString();
  await db.table('kols').bulkPut(sources.map((source, index) => {
    const handle = cleanHandle(source.handle || source.name || `kol-${index}`);
    const listKey = String(source.type || source.portfolioType || '').toLowerCase();
    return {
      id: `${interestId}:${handle.toLowerCase() || index}`,
      interestId,
      name: source.name || handle,
      handle,
      listKey,
      role: source.role || '',
      content: source.content || '',
      stance: source.stance || '',
      lang: source.lang || '',
      focus: source.focus || 0,
      diversity: source.diversity || 0,
      reason: source.reason || '',
      source,
      createdAt: now,
      updatedAt: now,
    };
  }));
}

export async function saveLists(agent: DbAgent, topic: string, lists: ListRecordInput[]): Promise<void> {
  if (!lists.length) return;
  const db = await getPortfolioDb(agent);
  const interestId = interestIdFor(topic);
  const now = new Date().toISOString();
  await db.table('lists').bulkPut(lists.map(list => ({
    id: `${interestId}:${list.key}`,
    interestId,
    key: list.key,
    name: list.name,
    listId: list.listId || '',
    mode: list.mode || '',
    created: Boolean(list.created),
    createdAt: now,
    updatedAt: now,
  })));
}

async function setupDb(db: Dexie): Promise<Dexie> {
  if ((db as { isOpen?: () => boolean }).isOpen?.()) db.close();
  db.version(1).stores({
    interest_fields: '&id, topic, updatedAt',
    kols: '&id, interestId, handle, listKey, updatedAt',
    lists: '&id, interestId, listId, key, mode, updatedAt',
  });
  await db.open();
  return db;
}

function cleanHandle(value: string): string {
  return String(value || '').trim().replace(/^@/, '');
}
