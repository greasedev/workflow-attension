import { Agent } from '@greaseclaw/workflow-sdk/local';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkflowApis, type ExecutionResult } from '../workflows/api';
import { cleanHandle, extractTwitterUserCandidates, sleep, type TwitterUserCandidate } from '../shared';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  dbPath: string;
  listIds: string[];
  keywords: string[];
  memberLimit: number;
  maxLists?: number;
  maxPages?: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  refetch: boolean;
  allLists: boolean;
};

type StoredList = {
  id: string;
  name: string;
};

type SavedMember = TwitterUserCandidate & {
  key: string;
  raw: unknown;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'twitter_lists.sqlite');

async function main() {
  loadEnv();

  const options = parseArgs(process.argv.slice(2));

  await mkdir(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(options.dbPath);
  setupDb(db);

  const lists = resolveLists(db, options);
  if (!lists.length) {
    console.log('No twitter_lists rows matched the provided filters.');
    db.close();
    return;
  }

  const agent = new Agent({});
  const apis = createWorkflowApis(agent);

  let apiCalls = 0;
  let seenMembers = 0;
  let insertedMembers = 0;
  let linkedMembers = 0;

  try {
    for (const list of lists) {
      const result = await fetchListMembers(db, apis, list, options, async () => {
        if (apiCalls > 0) {
          const waitMs = randomInterval(options.minIntervalMs, options.maxIntervalMs);
          console.log(`Waiting ${Math.round(waitMs / 1000)}s before next API call...`);
          await sleep(waitMs);
        }
        apiCalls += 1;
      });

      seenMembers += result.seenMembers;
      insertedMembers += result.insertedMembers;
      linkedMembers += result.linkedMembers;
    }
  } finally {
    await agent.dispose();
    db.close();
  }

  console.log(
    `Done. Fetched ${lists.length} list(s), saw ${seenMembers} member result(s), ` +
    `inserted ${insertedMembers} member row(s), linked ${linkedMembers} list-member row(s).`,
  );
}

function loadEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: defaultDbPath,
    listIds: [],
    keywords: [],
    memberLimit: 100,
    minIntervalMs: 15_000,
    maxIntervalMs: 30_000,
    refetch: false,
    allLists: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--refetch') {
      options.refetch = true;
      continue;
    }
    if (arg === '--all-lists') {
      options.allLists = true;
      continue;
    }
    if (arg === '--db') {
      options.dbPath = path.resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--db=')) {
      options.dbPath = path.resolve(arg.slice('--db='.length));
      continue;
    }
    if (arg === '--list-id' || arg === '--list-ids') {
      options.listIds.push(...splitValues(readValue(args, index, arg)));
      index += 1;
      continue;
    }
    if (arg.startsWith('--list-id=')) {
      options.listIds.push(...splitValues(arg.slice('--list-id='.length)));
      continue;
    }
    if (arg.startsWith('--list-ids=')) {
      options.listIds.push(...splitValues(arg.slice('--list-ids='.length)));
      continue;
    }
    if (arg === '--keyword' || arg === '--keywords' || arg === '-k') {
      options.keywords.push(...splitValues(readValue(args, index, arg)));
      index += 1;
      continue;
    }
    if (arg.startsWith('--keyword=')) {
      options.keywords.push(...splitValues(arg.slice('--keyword='.length)));
      continue;
    }
    if (arg.startsWith('--keywords=')) {
      options.keywords.push(...splitValues(arg.slice('--keywords='.length)));
      continue;
    }
    if (arg === '--member-limit' || arg === '--limit' || arg === '-l') {
      options.memberLimit = normalizeLimit(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--member-limit=')) {
      options.memberLimit = normalizeLimit(arg.slice('--member-limit='.length));
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.memberLimit = normalizeLimit(arg.slice('--limit='.length));
      continue;
    }
    if (arg === '--max-lists') {
      options.maxLists = normalizePositiveInteger(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--max-lists=')) {
      options.maxLists = normalizePositiveInteger(arg.slice('--max-lists='.length));
      continue;
    }
    if (arg === '--max-pages') {
      options.maxPages = normalizePositiveInteger(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--max-pages=')) {
      options.maxPages = normalizePositiveInteger(arg.slice('--max-pages='.length));
      continue;
    }
    if (arg === '--min-interval-ms') {
      options.minIntervalMs = normalizeInterval(readValue(args, index, arg), options.minIntervalMs);
      index += 1;
      continue;
    }
    if (arg.startsWith('--min-interval-ms=')) {
      options.minIntervalMs = normalizeInterval(arg.slice('--min-interval-ms='.length), options.minIntervalMs);
      continue;
    }
    if (arg === '--max-interval-ms') {
      options.maxIntervalMs = normalizeInterval(readValue(args, index, arg), options.maxIntervalMs);
      index += 1;
      continue;
    }
    if (arg.startsWith('--max-interval-ms=')) {
      options.maxIntervalMs = normalizeInterval(arg.slice('--max-interval-ms='.length), options.maxIntervalMs);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.maxIntervalMs < options.minIntervalMs) {
    options.maxIntervalMs = options.minIntervalMs;
  }
  options.listIds = unique(options.listIds);
  options.keywords = unique(options.keywords);
  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function splitValues(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

function normalizeLimit(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(100, Math.max(1, Math.round(number)));
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(1, Math.round(number));
}

function normalizeInterval(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function randomInterval(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

function setupDb(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS twitter_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members INTEGER,
      followers INTEGER,
      mode TEXT,
      type TEXT,
      raw_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      matched_keywords TEXT NOT NULL DEFAULT '[]',
      keyword_match_status TEXT NOT NULL DEFAULT 'unclassified',
      keyword_match_reason TEXT,
      keyword_match_model TEXT,
      keyword_matched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS twitter_list_keywords (
      keyword TEXT NOT NULL,
      list_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (keyword, list_id),
      FOREIGN KEY (list_id) REFERENCES twitter_lists(id)
    );

    CREATE TABLE IF NOT EXISTS twitter_members (
      member_key TEXT PRIMARY KEY,
      name TEXT,
      handle TEXT,
      username TEXT,
      bio TEXT,
      followers INTEGER,
      verified INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS twitter_list_members (
      list_id TEXT NOT NULL,
      member_key TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (list_id, member_key),
      FOREIGN KEY (list_id) REFERENCES twitter_lists(id),
      FOREIGN KEY (member_key) REFERENCES twitter_members(member_key)
    );

    CREATE TABLE IF NOT EXISTS twitter_list_member_fetch_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id TEXT NOT NULL,
      list_name TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      inserted_member_count INTEGER NOT NULL,
      linked_member_count INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS twitter_list_member_sync_state (
      list_id TEXT PRIMARY KEY,
      next_cursor TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      member_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (list_id) REFERENCES twitter_lists(id)
    );
  `);
  ensureTwitterListClassificationColumns(db);
}

function ensureTwitterListClassificationColumns(db: SqliteDatabase) {
  const columns = new Set((db.prepare('PRAGMA table_info(twitter_lists)').all() as Array<{ name: string }>).map(item => item.name));
  const additions: Array<[string, string]> = [
    ['matched_keywords', "TEXT NOT NULL DEFAULT '[]'"],
    ['keyword_match_status', "TEXT NOT NULL DEFAULT 'unclassified'"],
    ['keyword_match_reason', 'TEXT'],
    ['keyword_match_model', 'TEXT'],
    ['keyword_matched_at', 'TEXT'],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE twitter_lists ADD COLUMN ${name} ${definition}`);
  }
}

function resolveLists(db: SqliteDatabase, options: CliOptions): StoredList[] {
  const byId = new Map<string, StoredList>();

  if (options.listIds.length) {
    const statement = db.prepare(`
      SELECT id, name
      FROM twitter_lists
      WHERE id = ? ${options.allLists ? '' : "AND keyword_match_status = 'matched'"}
    `);
    for (const listId of options.listIds) {
      const row = statement.get(listId) as StoredList | undefined;
      if (row) byId.set(row.id, row);
      else if (options.allLists) byId.set(listId, { id: listId, name: `List ${listId}` });
    }
  } else if (options.keywords.length) {
    const statement = db.prepare(`
      SELECT l.id, l.name
      FROM twitter_lists l
      JOIN twitter_list_keywords k ON k.list_id = l.id
      WHERE k.keyword = ? ${options.allLists ? '' : "AND l.keyword_match_status = 'matched'"}
      ORDER BY COALESCE(l.followers, 0) DESC, COALESCE(l.members, 0) DESC, l.updated_at DESC, l.name ASC
    `);
    for (const keyword of options.keywords) {
      for (const row of statement.all(keyword) as StoredList[]) {
        byId.set(row.id, row);
      }
    }
  } else {
    const rows = db.prepare(`
      SELECT id, name
      FROM twitter_lists
      ${options.allLists ? '' : "WHERE keyword_match_status = 'matched'"}
      ORDER BY COALESCE(followers, 0) DESC, COALESCE(members, 0) DESC, updated_at DESC, name ASC
    `).all() as StoredList[];
    for (const row of rows) byId.set(row.id, row);
  }

  const lists = options.refetch
    ? [...byId.values()]
    : [...byId.values()].filter(list => !hasCompletedMembers(db, list.id));
  return options.maxLists ? lists.slice(0, options.maxLists) : lists;
}

function hasCompletedMembers(db: SqliteDatabase, listId: string): boolean {
  const row = db.prepare('SELECT completed FROM twitter_list_member_sync_state WHERE list_id = ? LIMIT 1').get(listId) as
    | { completed?: number }
    | undefined;
  return Boolean(row?.completed);
}

async function fetchListMembers(
  db: SqliteDatabase,
  apis: ReturnType<typeof createWorkflowApis>,
  list: StoredList,
  options: CliOptions,
  beforeApiCall: () => Promise<void>,
) {
  let cursor = options.refetch ? '' : getSavedNextCursor(db, list.id);
  let page = 0;
  let seenMembers = 0;
  let insertedMembers = 0;
  let linkedMembers = 0;
  const seenCursors = new Set<string>();

  if (options.refetch) resetSyncState(db, list.id);

  while (true) {
    if (cursor) {
      if (seenCursors.has(cursor)) {
        console.warn(`Stopping ${list.id}: repeated cursor ${cursor}`);
        updateSyncState(db, list.id, cursor, false, 0, 0);
        break;
      }
      seenCursors.add(cursor);
    }

    await beforeApiCall();
    const pageLabel = cursor ? `cursor ${cursor}` : 'first page';
    console.log(`Fetching members for "${list.name}" (${list.id}), ${pageLabel}, limit ${options.memberLimit}...`);

    const response = await apis.twitter_list_members(list.id, options.memberLimit, cursor || undefined);
    if (!response.success) {
      console.warn(`Fetch failed for list ${list.id}: ${response.error || 'unknown error'}`);
      saveRun(db, list, options.memberLimit, 0, 0, 0, response);
      updateSyncState(db, list.id, cursor, false, 0, 0);
      break;
    }

    const rawItems = extractRawMemberItems(response);
    const nextCursor = extractNextCursor(rawItems);
    const members = membersWithRaw(response);
    const result = saveMembers(db, list, members);
    saveRun(db, list, options.memberLimit, members.length, result.insertedMembers, result.linkedMembers, response);

    page += 1;
    seenMembers += members.length;
    insertedMembers += result.insertedMembers;
    linkedMembers += result.linkedMembers;
    const completed = !nextCursor || members.length < options.memberLimit;
    updateSyncState(db, list.id, completed ? '' : nextCursor, completed, 1, members.length);
    console.log(
      `Page ${page}: found ${members.length} member(s), inserted ${result.insertedMembers}, ` +
      `linked ${result.linkedMembers}${completed ? ', completed' : ', next cursor found'}.`,
    );

    if (completed) {
      break;
    }

    cursor = nextCursor;

    if (options.maxPages && page >= options.maxPages) {
      console.log(`Reached --max-pages ${options.maxPages} for list ${list.id}; saved cursor for resume.`);
      break;
    }
  }

  return { seenMembers, insertedMembers, linkedMembers };
}

function getSavedNextCursor(db: SqliteDatabase, listId: string): string {
  const row = db.prepare('SELECT next_cursor FROM twitter_list_member_sync_state WHERE list_id = ? LIMIT 1').get(listId) as
    | { next_cursor?: string | null }
    | undefined;
  return row?.next_cursor || '';
}

function updateSyncState(
  db: SqliteDatabase,
  listId: string,
  nextCursor: string,
  completed: boolean,
  pageCount: number,
  memberCount: number,
) {
  db.prepare(`
    INSERT INTO twitter_list_member_sync_state
      (list_id, next_cursor, completed, page_count, member_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(list_id) DO UPDATE SET
      next_cursor = excluded.next_cursor,
      completed = excluded.completed,
      page_count = twitter_list_member_sync_state.page_count + excluded.page_count,
      member_count = twitter_list_member_sync_state.member_count + excluded.member_count,
      updated_at = excluded.updated_at
  `).run(listId, nextCursor || null, completed ? 1 : 0, pageCount, memberCount, new Date().toISOString());
}

function resetSyncState(db: SqliteDatabase, listId: string) {
  db.prepare('DELETE FROM twitter_list_member_sync_state WHERE list_id = ?').run(listId);
}

function saveMembers(db: SqliteDatabase, list: StoredList, members: SavedMember[]) {
  if (!members.length) return { insertedMembers: 0, linkedMembers: 0 };

  const now = new Date().toISOString();
  const existingMember = db.prepare('SELECT member_key FROM twitter_members WHERE member_key = ?');
  const existingLink = db.prepare('SELECT member_key FROM twitter_list_members WHERE list_id = ? AND member_key = ?');
  const upsertMember = db.prepare(`
    INSERT INTO twitter_members
      (member_key, name, handle, username, bio, followers, verified, raw_json, first_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_key) DO UPDATE SET
      name = excluded.name,
      handle = excluded.handle,
      username = excluded.username,
      bio = excluded.bio,
      followers = excluded.followers,
      verified = excluded.verified,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);
  const upsertLink = db.prepare(`
    INSERT INTO twitter_list_members (list_id, member_key, fetched_at)
    VALUES (?, ?, ?)
    ON CONFLICT(list_id, member_key) DO UPDATE SET fetched_at = excluded.fetched_at
  `);

  let insertedMembers = 0;
  let linkedMembers = 0;
  db.exec('BEGIN');
  try {
    for (const member of members) {
      const hadMember = existingMember.get(member.key);
      const hadLink = existingLink.get(list.id, member.key);
      upsertMember.run(
        member.key,
        member.name ?? null,
        member.handle ?? null,
        member.username ?? null,
        member.bio ?? null,
        member.followers ?? null,
        member.verified ? 1 : 0,
        JSON.stringify(member.raw),
        now,
        now,
      );
      upsertLink.run(list.id, member.key, now);
      if (!hadMember) insertedMembers += 1;
      if (!hadLink) linkedMembers += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { insertedMembers, linkedMembers };
}

function saveRun(
  db: SqliteDatabase,
  list: StoredList,
  limit: number,
  resultCount: number,
  insertedMemberCount: number,
  linkedMemberCount: number,
  response: ExecutionResult,
) {
  db.prepare(`
    INSERT INTO twitter_list_member_fetch_runs
      (list_id, list_name, limit_value, result_count, inserted_member_count, linked_member_count, response_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    list.id,
    list.name,
    limit,
    resultCount,
    insertedMemberCount,
    linkedMemberCount,
    JSON.stringify(response),
    new Date().toISOString(),
  );
}

function membersWithRaw(response: ExecutionResult): SavedMember[] {
  const normalized = extractTwitterUserCandidates(response, 'twitter_list_members');
  const rawItems = extractRawMemberItems(response).filter(item => !hasNextCursor(item));

  return normalized
    .map((member, index) => {
      const key = memberKey(member, rawItems[index]);
      if (!key) return null;
      return {
        ...member,
        key,
        raw: rawItems[index] || member,
      };
    })
    .filter((member): member is SavedMember => Boolean(member));
}

function extractNextCursor(rawItems: unknown[]): string {
  if (!rawItems.length) return '';
  return findNextCursor(rawItems[rawItems.length - 1]);
}

function findNextCursor(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const item = value as {
    next_cursor?: unknown;
    nextCursor?: unknown;
    cursor?: unknown;
    data?: unknown;
  };
  for (const candidate of [item.next_cursor, item.nextCursor, item.cursor]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return findNextCursor(item.data);
}

function hasNextCursor(value: unknown): boolean {
  return Boolean(findNextCursor(value));
}

function memberKey(member: TwitterUserCandidate, raw: unknown): string {
  const rawObj = raw && typeof raw === 'object'
    ? raw as { id?: string | number; rest_id?: string | number; user_id?: string | number }
    : {};
  const id = rawObj.id ?? rawObj.rest_id ?? rawObj.user_id;
  if (id) return `id:${String(id)}`;

  const handle = cleanHandle(member.handle || member.username || member.name || '');
  return handle ? `handle:${handle.toLowerCase()}` : '';
}

function extractRawMemberItems(value: unknown): unknown[] {
  const payload = extractPayload(value);
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as {
    data?: unknown;
    users?: unknown;
    members?: unknown;
    results?: unknown;
    task?: { extract_data?: unknown };
  };
  for (const candidate of [obj.data, obj.users, obj.members, obj.results, obj.task?.extract_data]) {
    const members = extractRawMemberItems(candidate);
    if (members.length) return members;
  }
  return [];
}

function extractPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return parseMaybeJson(value);
  const obj = value as ExecutionResult & { data?: unknown };
  if (obj.task?.extract_data !== undefined) return parseMaybeJson(obj.task.extract_data);
  if (obj.data !== undefined) return parseMaybeJson(obj.data);
  return value;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
}

function printUsage() {
  console.log(`
Usage:
  pnpm fetch:twitter-list-members
  pnpm fetch:twitter-list-members -- --keyword "AI" --member-limit 100
  pnpm fetch:twitter-list-members -- --list-id 123456 --member-limit 50

Options:
  --db                 SQLite path, default data/twitter_lists.sqlite
  --list-id(s)         List id(s) to fetch, comma-separated values are supported
  -k, --keyword(s)     Fetch lists previously found for keyword(s)
  -l, --member-limit   Max members per API call, default 100, max 100
  --max-lists          Stop after N lists
  --max-pages          Stop after N pages per list and save cursor for resume
  --min-interval-ms    Minimum delay between API calls, default 15000
  --max-interval-ms    Maximum delay between API calls, default 30000
  --refetch            Include lists that already have member fetch runs
  --all-lists          Ignore keyword_match_status and fetch unclassified/no_match lists too
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
