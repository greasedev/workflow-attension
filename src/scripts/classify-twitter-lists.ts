import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  dbPath: string;
  keywords: string[];
  model: string;
  ollamaUrl: string;
  maxLists?: number;
  refetch: boolean;
};

type ListForClassify = {
  id: string;
  name: string;
  members?: number | null;
  followers?: number | null;
  raw_json: string;
  keywords_json: string;
};

type Classification = {
  matched: boolean;
  matched_keywords: string[];
  reason: string;
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
    console.log('No twitter_lists rows need classification.');
    db.close();
    return;
  }

  let matched = 0;
  let rejected = 0;
  try {
    for (const [index, list] of lists.entries()) {
      const keywords = JSON.parse(list.keywords_json) as string[];
      console.log(`Classifying ${index + 1}/${lists.length}: "${list.name}" against [${keywords.join(', ')}]`);
      const result = await classifyList(options, list, keywords);
      saveClassification(db, list.id, result, options.model);
      if (result.matched) matched += 1;
      else rejected += 1;
      console.log(`${result.matched ? 'matched' : 'no_match'}: ${result.matched_keywords.join(', ') || '-'} - ${result.reason}`);
    }
  } finally {
    db.close();
  }

  console.log(`Done. Classified ${lists.length} list(s): ${matched} matched, ${rejected} rejected.`);
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
    keywords: [],
    model: process.env.OLLAMA_MODEL || 'gemma4:26b',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
    refetch: false,
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
    if (arg === '--db') {
      options.dbPath = path.resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--db=')) {
      options.dbPath = path.resolve(arg.slice('--db='.length));
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
    if (arg === '--model') {
      options.model = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
      continue;
    }
    if (arg === '--ollama-url') {
      options.ollamaUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--ollama-url=')) {
      options.ollamaUrl = arg.slice('--ollama-url='.length);
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
    throw new Error(`Unknown option: ${arg}`);
  }

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

function normalizePositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(1, Math.round(number));
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

function resolveLists(db: SqliteDatabase, options: CliOptions): ListForClassify[] {
  const keywordWhere = options.keywords.length
    ? `WHERE k.keyword IN (${options.keywords.map(() => '?').join(', ')})`
    : '';
  const statusWhere = options.refetch ? '' : "HAVING l.keyword_match_status = 'unclassified'";
  const limitSql = options.maxLists ? 'LIMIT ?' : '';
  const params: Array<string | number> = [...options.keywords];
  if (options.maxLists) params.push(options.maxLists);

  return db.prepare(`
    SELECT
      l.id,
      l.name,
      l.members,
      l.followers,
      l.raw_json,
      json_group_array(DISTINCT k.keyword) AS keywords_json
    FROM twitter_lists l
    JOIN twitter_list_keywords k ON k.list_id = l.id
    ${keywordWhere}
    GROUP BY l.id
    ${statusWhere}
    ORDER BY COALESCE(l.followers, 0) DESC, COALESCE(l.members, 0) DESC, l.updated_at DESC, l.name ASC
    ${limitSql}
  `).all(...params) as ListForClassify[];
}

async function classifyList(options: CliOptions, list: ListForClassify, keywords: string[]): Promise<Classification> {
  const nameMatches = keywords.filter(keyword => keywordMatchesListName(keyword, list.name));
  if (nameMatches.length) {
    return {
      matched: true,
      matched_keywords: nameMatches,
      reason: `List name directly matches keyword(s): ${nameMatches.join(', ')}`,
    };
  }

  const raw = parseRawList(list.raw_json);
  const rawForPrompt = rawMatchesList(raw, list.id) ? raw : {};
  const prompt = [
    'You classify whether an X/Twitter List truly matches one or more target keywords.',
    'Reject accidental substring matches. Example: "Airdrop" does not match keyword "AI" unless the list is actually about artificial intelligence.',
    'Return strict JSON only with this schema:',
    '{"matched": boolean, "matched_keywords": string[], "reason": string}',
    '',
    `Target keywords: ${JSON.stringify(keywords)}`,
    `List name: ${list.name}`,
    `Members count: ${list.members ?? ''}`,
    `Followers count: ${list.followers ?? ''}`,
    `Raw list metadata: ${JSON.stringify(rawForPrompt).slice(0, 1200)}`,
  ].join('\n');

  const response = await fetch(options.ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      think: false,
      format: 'json',
      prompt,
      options: { temperature: 0 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}: ${await response.text()}`);
  }
  const data = await response.json() as { response?: string };
  return normalizeClassification(data.response || '', keywords);
}

function keywordMatchesListName(keyword: string, name: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(name);
}

function parseRawList(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return rawJson;
  }
}

function rawMatchesList(raw: unknown, listId: string): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const item = raw as { id?: unknown; list_id?: unknown; rest_id?: unknown; data?: unknown };
  for (const candidate of [item.id, item.list_id, item.rest_id]) {
    if (candidate && String(candidate) === listId) return true;
  }
  return rawMatchesList(item.data, listId);
}

function normalizeClassification(text: string, keywords: string[]): Classification {
  let parsed: Partial<Classification>;
  try {
    parsed = parseJsonObject(text) as Partial<Classification>;
  } catch {
    parsed = parseLooseClassification(text);
  }
  const keywordByLower = new Map(keywords.map(keyword => [keyword.toLowerCase(), keyword]));
  const matchedKeywords = Array.isArray(parsed.matched_keywords)
    ? parsed.matched_keywords
      .map(keyword => keywordByLower.get(String(keyword).toLowerCase()))
      .filter((keyword): keyword is string => Boolean(keyword))
    : [];
  return {
    matched: Boolean(parsed.matched) && matchedKeywords.length > 0,
    matched_keywords: matchedKeywords,
    reason: String(parsed.reason || '').slice(0, 500),
  };
}

function parseLooseClassification(text: string): Partial<Classification> {
  const matched = /"matched"\s*:\s*true/i.test(text);
  const keywordsMatch = text.match(/"matched_keywords"\s*:\s*\[([^\]]*)\]/i);
  const matchedKeywords = keywordsMatch
    ? [...keywordsMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
    : [];
  const reasonMatch = text.match(/"reason"\s*:\s*"([\s\S]*)/i);
  const reason = reasonMatch ? reasonMatch[1].replace(/["{}]+$/g, '').replace(/\s+/g, ' ').trim() : 'Loose parse fallback';
  return {
    matched,
    matched_keywords: matchedKeywords,
    reason,
  };
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(trimmed.replace(/\r?\n/g, ' '));
    } catch {
      // Fall through to fenced/object extraction.
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const objectText = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(objectText);
      } catch {
        return JSON.parse(objectText.replace(/\r?\n/g, ' '));
      }
    }
    throw new Error(`Ollama did not return JSON: ${trimmed.slice(0, 200)}`);
  }
}

function saveClassification(db: SqliteDatabase, listId: string, result: Classification, model: string) {
  db.prepare(`
    UPDATE twitter_lists
    SET
      matched_keywords = ?,
      keyword_match_status = ?,
      keyword_match_reason = ?,
      keyword_match_model = ?,
      keyword_matched_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(result.matched_keywords),
    result.matched ? 'matched' : 'no_match',
    result.reason,
    model,
    new Date().toISOString(),
    listId,
  );
}

function printUsage() {
  console.log(`
Usage:
  pnpm classify:twitter-lists
  pnpm classify:twitter-lists -- --keyword AI --max-lists 20

Options:
  --db            SQLite path, default data/twitter_lists.sqlite
  -k, --keyword   Only classify lists found by keyword(s)
  --max-lists     Stop after N lists
  --model         Ollama model, default gemma4:26b
  --ollama-url    Ollama generate endpoint, default http://localhost:11434/api/generate
  --refetch       Re-classify rows that already have keyword_match_status
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
