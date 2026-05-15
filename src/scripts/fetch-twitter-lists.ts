import { Agent } from '@greaseclaw/workflow-sdk/local';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkflowApis, type ExecutionResult } from '../workflows/api';
import { extractTwitterLists, sleep, type TwitterList } from '../shared';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  keywords: string[];
  limit: number;
  dbPath: string;
  intervalMs: number;
};

type SavedList = TwitterList & {
  keyword: string;
  raw: unknown;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'twitter_lists.sqlite');

async function main() {
  loadEnv();

  const options = parseArgs(process.argv.slice(2));
  if (!options.keywords.length) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(options.dbPath);
  setupDb(db);

  const agent = new Agent({});
  const apis = createWorkflowApis(agent);

  let saved = 0;
  let seen = 0;

  try {
    for (const [index, keyword] of options.keywords.entries()) {
      if (index > 0 && options.intervalMs > 0) await sleep(options.intervalMs);

      console.log(`Searching Twitter/X lists for "${keyword}" (limit ${options.limit})...`);
      const response = await apis.twitter_list_search(keyword, options.limit);
      if (!response.success) {
        console.warn(`Search failed for "${keyword}": ${response.error || 'unknown error'}`);
        saveRun(db, keyword, options.limit, 0, 0, response);
        continue;
      }

      const lists = listsWithRaw(response, keyword);
      const savedForKeyword = saveLists(db, lists);
      saveRun(db, keyword, options.limit, lists.length, savedForKeyword, response);
      seen += lists.length;
      saved += savedForKeyword;
      console.log(`Found ${lists.length} list(s), inserted ${savedForKeyword} new row(s).`);
    }
  } finally {
    await agent.dispose();
    db.close();
  }

  console.log(`Done. Seen ${seen} list result(s), inserted ${saved} new row(s) into ${options.dbPath}`);
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
    keywords: [],
    limit: 30,
    dbPath: defaultDbPath,
    intervalMs: 15_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--keyword' || arg === '--keywords' || arg === '-k') {
      options.keywords.push(...splitKeywords(readValue(args, index, arg)));
      index += 1;
      continue;
    }
    if (arg.startsWith('--keyword=')) {
      options.keywords.push(...splitKeywords(arg.slice('--keyword='.length)));
      continue;
    }
    if (arg.startsWith('--keywords=')) {
      options.keywords.push(...splitKeywords(arg.slice('--keywords='.length)));
      continue;
    }
    if (arg === '--limit' || arg === '-l') {
      options.limit = normalizeLimit(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = normalizeLimit(arg.slice('--limit='.length));
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
    if (arg === '--interval-ms') {
      options.intervalMs = normalizeInterval(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--interval-ms=')) {
      options.intervalMs = normalizeInterval(arg.slice('--interval-ms='.length));
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    options.keywords.push(...splitKeywords(arg));
  }

  options.keywords = [...new Set(options.keywords.map(item => item.trim()).filter(Boolean))];
  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function splitKeywords(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeLimit(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 30;
  return Math.min(100, Math.max(1, Math.round(number)));
}

function normalizeInterval(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 15_000;
  return Math.max(0, Math.round(number));
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

    CREATE TABLE IF NOT EXISTS twitter_list_fetch_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
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

function saveLists(db: SqliteDatabase, lists: SavedList[]): number {
  if (!lists.length) return 0;

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM twitter_lists WHERE id = ?');
  const upsertList = db.prepare(`
    INSERT INTO twitter_lists (id, name, members, followers, mode, type, raw_json, first_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      members = excluded.members,
      followers = excluded.followers,
      mode = excluded.mode,
      type = excluded.type,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);
  const upsertKeyword = db.prepare(`
    INSERT INTO twitter_list_keywords (keyword, list_id, fetched_at)
    VALUES (?, ?, ?)
    ON CONFLICT(keyword, list_id) DO UPDATE SET fetched_at = excluded.fetched_at
  `);

  let inserted = 0;
  db.exec('BEGIN');
  try {
    for (const list of lists) {
      const alreadyExists = existing.get(list.id);
      upsertList.run(
        list.id,
        list.name,
        list.members ?? null,
        list.followers ?? null,
        list.mode ?? null,
        list.type ?? null,
        JSON.stringify(list.raw),
        now,
        now,
      );
      upsertKeyword.run(list.keyword, list.id, now);
      if (!alreadyExists) inserted += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return inserted;
}

function saveRun(
  db: SqliteDatabase,
  keyword: string,
  limit: number,
  resultCount: number,
  insertedCount: number,
  response: ExecutionResult,
) {
  db.prepare(`
    INSERT INTO twitter_list_fetch_runs
      (keyword, limit_value, result_count, inserted_count, response_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(keyword, limit, resultCount, insertedCount, JSON.stringify(response), new Date().toISOString());
}

function listsWithRaw(response: ExecutionResult, keyword: string): SavedList[] {
  const normalized = extractTwitterLists(response);
  const rawItems = extractRawListItems(response);

  return normalized.map((list, index) => ({
    ...list,
    keyword,
    raw: rawItems[index] || list,
  }));
}

function extractRawListItems(value: unknown): unknown[] {
  const payload = extractPayload(value);
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as {
    data?: unknown;
    lists?: unknown;
    results?: unknown;
    task?: { extract_data?: unknown };
  };
  for (const candidate of [obj.data, obj.lists, obj.results, obj.task?.extract_data]) {
    const lists = extractRawListItems(candidate);
    if (lists.length) return lists;
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
  pnpm fetch:twitter-lists -- "AI Agent" "crypto"
  pnpm fetch:twitter-lists -- --keywords "AI Agent,crypto" --limit 50

Options:
  -k, --keyword, --keywords  Keyword(s), comma-separated values are supported
  -l, --limit                Max lists per keyword, default 30, max 100
  --db                       SQLite path, default data/twitter_lists.sqlite
  --interval-ms              Delay between keyword searches, default 15000
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
