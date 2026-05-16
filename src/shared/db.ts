import type { Agent, Dexie } from '@greaseclaw/workflow-sdk';
import type { PortfolioModel, SavedTweet, SearchTweet, Source, TwitterUserCandidate, TweetMedia, TweetMention } from './types';

type DbAgent = Pick<Agent, 'getDb'>;

type ListRecordInput = {
  key: string;
  name: string;
  listId?: string;
  mode?: string;
  created?: boolean;
};

type TweetListInput = {
  listId: string;
  listName: string;
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
      selected: true,
      candidateSource: 'final',
      source,
      createdAt: now,
      updatedAt: now,
    };
  }));
}

export async function saveKolCandidates(agent: DbAgent, topic: string, candidates: TwitterUserCandidate[]): Promise<void> {
  if (!candidates.length) return;
  const db = await getPortfolioDb(agent);
  const interestId = interestIdFor(topic);
  const now = new Date().toISOString();
  await db.table('kols').bulkPut(candidates.map((candidate, index) => {
    const handle = cleanHandle(candidate.handle || candidate.username || candidate.name || `candidate-${index}`);
    return {
      id: `${interestId}:${handle.toLowerCase() || index}`,
      interestId,
      name: candidate.name || handle,
      handle,
      listKey: '',
      role: '',
      content: candidate.bio || '',
      stance: '',
      lang: '',
      followers: candidate.followers || 0,
      verified: Boolean(candidate.verified),
      focus: 0,
      diversity: 0,
      reason: candidate.reason || '',
      selected: false,
      candidateSource: candidate.source || 'candidate',
      rawCandidate: candidate,
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

export async function saveTweets(
  agent: DbAgent,
  topic: string,
  list: TweetListInput,
  tweets: SearchTweet[],
): Promise<number> {
  if (!tweets.length) return 0;
  const db = await getPortfolioDb(agent);
  const table = db.table('tweets');
  const interestId = interestIdFor(topic);
  const savedAt = new Date().toISOString();
  let saved = 0;

  for (const tweet of tweets) {
    if (!tweet.id) continue;
    const existing = await table.get(tweet.id) as SavedTweet | undefined;
    const listIds = unique([...(existing?.listIds || []), list.listId]);
    const listNames = unique([...(existing?.listNames || []), list.listName]);
    const user = tweet.user;
    await table.put({
      ...(existing || {}),
      id: tweet.id,
      interestId: existing?.interestId || interestId,
      listIds,
      listNames,
      userId: user?.id || existing?.userId,
      author: tweet.author || user?.screen_name || existing?.author || '',
      authorName: user?.name || existing?.authorName,
      authorAvatar: user?.avatar_url || existing?.authorAvatar,
      authorVerified: user?.is_verified ?? existing?.authorVerified,
      authorFollowers: user?.followers_count ?? existing?.authorFollowers,
      authorBio: user?.description || existing?.authorBio,
      text: tweet.text || existing?.text || '',
      url: tweet.url || existing?.url || '',
      likes: tweet.likes ?? existing?.likes ?? 0,
      retweets: tweet.retweets ?? existing?.retweets ?? 0,
      replies: tweet.replies ?? existing?.replies ?? 0,
      quotes: tweet.quotes ?? existing?.quotes ?? 0,
      bookmarks: tweet.bookmarks ?? existing?.bookmarks ?? 0,
      lang: tweet.lang || existing?.lang,
      media: mergeArrays(existing?.media, tweet.media) as TweetMedia[] | undefined,
      hashtags: mergeArrays(existing?.hashtags, tweet.hashtags) as string[] | undefined,
      mentions: mergeArrays(existing?.mentions, tweet.mentions) as TweetMention[] | undefined,
      isRetweet: tweet.is_retweet ?? existing?.isRetweet,
      createdAt: tweet.created_at || existing?.createdAt || '',
      savedAt,
      raw: tweet,
    });
    saved += existing ? 0 : 1;
  }

  return saved;
}

function mergeArrays<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  return [...(a || []), ...(b || [])];
}

export async function getSavedTweets(agent: DbAgent, limit = 200): Promise<SavedTweet[]> {
  const db = await getPortfolioDb(agent);
  const tweets = await db.table('tweets').orderBy('savedAt').reverse().limit(limit).toArray() as SavedTweet[];
  return tweets;
}

export async function getSavedLists(agent: DbAgent): Promise<Array<ListRecordInput & { interestId?: string }>> {
  const db = await getPortfolioDb(agent);
  return await db.table('lists').toArray();
}

async function setupDb(db: Dexie): Promise<Dexie> {
  if ((db as { isOpen?: () => boolean }).isOpen?.()) db.close();
  db.version(3).stores({
    interest_fields: '&id, topic, updatedAt',
    kols: '&id, interestId, handle, listKey, updatedAt',
    lists: '&id, interestId, listId, key, mode, updatedAt',
    tweets: '&id, interestId, *listIds, author, createdAt, savedAt, authorVerified, likes',
  });
  await db.open();
  return db;
}

function cleanHandle(value: string): string {
  return String(value || '').trim().replace(/^@/, '');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}
