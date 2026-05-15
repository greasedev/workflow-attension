import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  dbPath: string;
  minLists: number;
  minScore: number;
  limit?: number;
  matchedOnly: boolean;
};

type KolSourceRow = {
  kol_key: string;
  member_keys_json: string;
  name?: string | null;
  handle?: string | null;
  username?: string | null;
  bio?: string | null;
  followers?: number | null;
  verified: number;
  raw_json: string;
  first_seen_at: string;
  updated_at: string;
  list_count: number;
  list_ids_json: string;
  list_names_json: string;
  matched_keywords_json: string;
};

type KolRecord = {
  kol_key: string;
  member_keys: string[];
  name: string;
  handle: string;
  username: string;
  bio: string;
  followers: number;
  verified: boolean;
  list_count: number;
  list_ids: string[];
  list_names: string[];
  matched_keywords: string[];
  influence_score: number;
  score_details: {
    followerScore: number;
    verifiedScore: number;
    listScore: number;
  };
  raw_json: string;
  first_seen_at: string;
  updated_at: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'twitter_lists.sqlite');

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await mkdir(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(options.dbPath);
  setupDb(db);

  const rows = loadKolRows(db, options);
  const records = rows.map(toKolRecord).filter(record => record.influence_score >= options.minScore);
  clearGeneratedKols(db);
  saveKolRecords(db, options.limit ? records.slice(0, options.limit) : records);
  db.close();

  const saved = options.limit ? Math.min(records.length, options.limit) : records.length;
  console.log(`Generated ${saved} KOL row(s) in twitter_kols from ${rows.length} unique member(s).`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: defaultDbPath,
    minLists: 1,
    minScore: 0,
    matchedOnly: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--all-lists') {
      options.matchedOnly = false;
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
    if (arg === '--min-lists') {
      options.minLists = normalizeInteger(readValue(args, index, arg), 1);
      index += 1;
      continue;
    }
    if (arg.startsWith('--min-lists=')) {
      options.minLists = normalizeInteger(arg.slice('--min-lists='.length), 1);
      continue;
    }
    if (arg === '--min-score') {
      options.minScore = normalizeNumber(readValue(args, index, arg), 0);
      index += 1;
      continue;
    }
    if (arg.startsWith('--min-score=')) {
      options.minScore = normalizeNumber(arg.slice('--min-score='.length), 0);
      continue;
    }
    if (arg === '--limit') {
      options.limit = normalizeInteger(readValue(args, index, arg), 0) || undefined;
      index += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = normalizeInteger(arg.slice('--limit='.length), 0) || undefined;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function normalizeInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function normalizeNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

function setupDb(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS twitter_kols (
      kol_key TEXT PRIMARY KEY,
      member_keys_json TEXT NOT NULL DEFAULT '[]',
      name TEXT,
      handle TEXT,
      username TEXT,
      bio TEXT,
      followers INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0,
      list_count INTEGER NOT NULL DEFAULT 0,
      list_ids_json TEXT NOT NULL DEFAULT '[]',
      list_names_json TEXT NOT NULL DEFAULT '[]',
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      influence_score REAL NOT NULL DEFAULT 0,
      score_details_json TEXT NOT NULL DEFAULT '{}',
      raw_json TEXT NOT NULL,
      first_seen_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  migrateLegacyKolTable(db);
}

function loadKolRows(db: SqliteDatabase, options: CliOptions): KolSourceRow[] {
  const matchedWhere = options.matchedOnly ? "AND l.keyword_match_status = 'matched'" : '';
  return db.prepare(`
    WITH member_base AS (
      SELECT
        m.*,
        lower(replace(coalesce(nullif(m.username, ''), nullif(m.handle, ''), m.member_key), '@', '')) AS kol_key
      FROM twitter_members m
      WHERE coalesce(nullif(m.username, ''), nullif(m.handle, '')) IS NOT NULL
    )
    SELECT
      m.kol_key,
      json_group_array(DISTINCT m.member_key) AS member_keys_json,
      max(m.name) AS name,
      max(m.handle) AS handle,
      max(m.username) AS username,
      max(m.bio) AS bio,
      max(COALESCE(m.followers, 0)) AS followers,
      max(m.verified) AS verified,
      max(m.raw_json) AS raw_json,
      min(m.first_seen_at) AS first_seen_at,
      max(m.updated_at) AS updated_at,
      COUNT(DISTINCT lm.list_id) AS list_count,
      json_group_array(DISTINCT lm.list_id) AS list_ids_json,
      json_group_array(DISTINCT l.name) AS list_names_json,
      json_group_array(DISTINCT kw.value) AS matched_keywords_json
    FROM member_base m
    JOIN twitter_list_members lm ON lm.member_key = m.member_key
    JOIN twitter_lists l ON l.id = lm.list_id
    LEFT JOIN json_each(COALESCE(l.matched_keywords, '[]')) kw
    WHERE 1 = 1 ${matchedWhere}
    GROUP BY m.kol_key
    HAVING list_count >= ?
    ORDER BY list_count DESC, COALESCE(m.followers, 0) DESC, m.verified DESC
  `).all(options.minLists) as KolSourceRow[];
}

function toKolRecord(row: KolSourceRow): KolRecord {
  const followers = Math.max(0, Number(row.followers || 0));
  const verified = Boolean(row.verified);
  const listCount = Math.max(0, Number(row.list_count || 0));
  const scoreDetails = scoreFor({ followers, verified, listCount });

  return {
    kol_key: row.kol_key,
    member_keys: jsonArray(row.member_keys_json),
    name: row.name || '',
    handle: row.handle || '',
    username: row.username || '',
    bio: row.bio || '',
    followers,
    verified,
    list_count: listCount,
    list_ids: jsonArray(row.list_ids_json),
    list_names: jsonArray(row.list_names_json),
    matched_keywords: jsonArray(row.matched_keywords_json).filter(Boolean),
    influence_score: round(scoreDetails.followerScore + scoreDetails.verifiedScore + scoreDetails.listScore),
    score_details: scoreDetails,
    raw_json: row.raw_json,
    first_seen_at: row.first_seen_at,
    updated_at: new Date().toISOString(),
  };
}

function scoreFor(input: { followers: number; verified: boolean; listCount: number }) {
  const followerScore = clamp((Math.log10(input.followers + 1) / 7) * 60, 0, 60);
  const verifiedScore = input.verified ? 15 : 0;
  const listScore = clamp((Math.log2(input.listCount + 1) / Math.log2(11)) * 25, 0, 25);
  return {
    followerScore: round(followerScore),
    verifiedScore,
    listScore: round(listScore),
  };
}

function saveKolRecords(db: SqliteDatabase, records: KolRecord[]) {
  const statement = db.prepare(`
    INSERT INTO twitter_kols
      (
        kol_key, member_keys_json, name, handle, username, bio, followers, verified, list_count,
        list_ids_json, list_names_json, matched_keywords_json, influence_score,
        score_details_json, raw_json, first_seen_at, updated_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kol_key) DO UPDATE SET
      member_keys_json = excluded.member_keys_json,
      name = excluded.name,
      handle = excluded.handle,
      username = excluded.username,
      bio = excluded.bio,
      followers = excluded.followers,
      verified = excluded.verified,
      list_count = excluded.list_count,
      list_ids_json = excluded.list_ids_json,
      list_names_json = excluded.list_names_json,
      matched_keywords_json = excluded.matched_keywords_json,
      influence_score = excluded.influence_score,
      score_details_json = excluded.score_details_json,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN');
  try {
    for (const record of records) {
      statement.run(
        record.kol_key,
        JSON.stringify(record.member_keys),
        record.name,
        record.handle,
        record.username,
        record.bio,
        record.followers,
        record.verified ? 1 : 0,
        record.list_count,
        JSON.stringify(record.list_ids),
        JSON.stringify(record.list_names),
        JSON.stringify(record.matched_keywords),
        record.influence_score,
        JSON.stringify(record.score_details),
        record.raw_json,
        record.first_seen_at,
        record.updated_at,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function clearGeneratedKols(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kol_tags (
      domain TEXT NOT NULL,
      kol_key TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      reason TEXT,
      tagged_at TEXT NOT NULL,
      PRIMARY KEY (domain, kol_key, tag_key),
      FOREIGN KEY (kol_key) REFERENCES twitter_kols(kol_key)
    );

    DELETE FROM kol_tags
    WHERE kol_key IN (SELECT kol_key FROM twitter_kols);

    DELETE FROM twitter_kols;
  `);
}

function migrateLegacyKolTable(db: SqliteDatabase) {
  const columns = new Set((db.prepare('PRAGMA table_info(twitter_kols)').all() as Array<{ name: string }>).map(item => item.name));
  if (!columns.has('member_key')) return;

  db.exec(`
    ALTER TABLE twitter_kols RENAME TO twitter_kols_legacy_member_key;

    CREATE TABLE twitter_kols (
      kol_key TEXT PRIMARY KEY,
      member_keys_json TEXT NOT NULL DEFAULT '[]',
      name TEXT,
      handle TEXT,
      username TEXT,
      bio TEXT,
      followers INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0,
      list_count INTEGER NOT NULL DEFAULT 0,
      list_ids_json TEXT NOT NULL DEFAULT '[]',
      list_names_json TEXT NOT NULL DEFAULT '[]',
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      influence_score REAL NOT NULL DEFAULT 0,
      score_details_json TEXT NOT NULL DEFAULT '{}',
      raw_json TEXT NOT NULL,
      first_seen_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

function jsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(item => item !== 'null') : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function printUsage() {
  console.log(`
Usage:
  pnpm generate:twitter-kols
  pnpm generate:twitter-kols -- --min-lists 2 --min-score 40 --limit 100

Options:
  --db          SQLite path, default data/twitter_lists.sqlite
  --min-lists   Minimum matched-list appearances, default 1
  --min-score   Minimum influence score, default 0
  --limit       Save only top N rows after scoring
  --all-lists   Include list memberships from unclassified/no_match lists

KOL uniqueness:
  KOL rows are keyed by lower(username or handle), not by Twitter numeric id.
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
