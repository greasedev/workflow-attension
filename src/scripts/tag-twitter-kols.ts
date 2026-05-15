import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  dbPath: string;
  domain: string;
  model: string;
  ollamaUrl: string;
  minTags: number;
  maxKols?: number;
  refetch: boolean;
};

type AiTag = {
  domain: string;
  tag_key: string;
  name: string;
  description: string;
};

type KolForTagging = {
  kol_key: string;
  name?: string | null;
  handle?: string | null;
  username?: string | null;
  bio?: string | null;
  followers: number;
  verified: number;
  list_count: number;
  list_names_json: string;
  matched_keywords_json: string;
  influence_score: number;
};

type KolTagResult = {
  tag_key: string;
  confidence: number;
  reason: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'twitter_lists.sqlite');

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await mkdir(path.dirname(options.dbPath), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(options.dbPath);
  setupDb(db);

  let tags = loadTags(db, options.domain);
  if (tags.length < options.minTags || options.refetch) {
    tags = await generateAndSaveTags(db, options);
  }
  if (tags.length < options.minTags) {
    throw new Error(`Need at least ${options.minTags} ${options.domain} tags, got ${tags.length}`);
  }

  const kols = loadKols(db, options);
  if (!kols.length) {
    console.log('No twitter_kols rows need tagging.');
    db.close();
    return;
  }

  let tagged = 0;
  try {
    for (const [index, kol] of kols.entries()) {
      console.log(`Tagging ${index + 1}/${kols.length}: ${kol.handle || kol.username || kol.kol_key}`);
      const results = await tagKol(options, kol, tags);
      saveKolTags(db, options.domain, kol.kol_key, results);
      tagged += 1;
      console.log(`Tags: ${results.map(item => `${item.tag_key}:${item.confidence}`).join(', ') || '-'}`);
    }
  } finally {
    db.close();
  }

  console.log(`Done. Tagged ${tagged} KOL row(s) using ${tags.length} ${options.domain} tag(s).`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: defaultDbPath,
    domain: 'ai',
    model: process.env.OLLAMA_MODEL || 'gemma4:26b',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
    minTags: 6,
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
    if (arg === '--domain') {
      options.domain = slug(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--domain=')) {
      options.domain = slug(arg.slice('--domain='.length));
      continue;
    }
    if (arg.startsWith('--db=')) {
      options.dbPath = path.resolve(arg.slice('--db='.length));
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
    if (arg === '--min-tags') {
      options.minTags = normalizeInteger(readValue(args, index, arg), 6);
      index += 1;
      continue;
    }
    if (arg.startsWith('--min-tags=')) {
      options.minTags = normalizeInteger(arg.slice('--min-tags='.length), 6);
      continue;
    }
    if (arg === '--max-kols') {
      options.maxKols = normalizeInteger(readValue(args, index, arg), 0) || undefined;
      index += 1;
      continue;
    }
    if (arg.startsWith('--max-kols=')) {
      options.maxKols = normalizeInteger(arg.slice('--max-kols='.length), 0) || undefined;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  options.minTags = Math.max(6, options.minTags);
  if (!options.domain) options.domain = 'ai';
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

function setupDb(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tags (
      domain TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (domain, tag_key)
    );

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
  `);
}

function loadTags(db: SqliteDatabase, domain = 'ai'): AiTag[] {
  return db.prepare(`
    SELECT domain, tag_key, name, description
    FROM tags
    WHERE domain = ?
    ORDER BY tag_key ASC
  `).all(domain) as AiTag[];
}

async function generateAndSaveTags(db: SqliteDatabase, options: CliOptions): Promise<AiTag[]> {
  const prompt = [
    `Generate a ${options.domain.toUpperCase()}-domain taxonomy for classifying Twitter/X KOLs.`,
    `Return at least ${options.minTags} tags. Prefer 8-10 tags.`,
    `Tags should be useful subfields, tracks, or roles within the ${options.domain.toUpperCase()} ecosystem.`,
    'Return strict JSON only: {"tags":[{"tag_key":"lower_snake_case","name":"Short name","description":"One sentence"}]}',
    'Good coverage examples: foundation models, agents, research, infrastructure, applications, policy/safety, education, open source.',
  ].join('\n');

  let response: unknown;
  try {
    response = await ollamaJson(options, prompt);
  } catch (error) {
    console.warn(`Ollama tag generation returned invalid JSON; using fallback tags. ${error instanceof Error ? error.message : String(error)}`);
    response = { tags: fallbackTags(options.domain) };
  }
  const tags = normalizeTags(response, options.minTags, options.domain);
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO tags (domain, tag_key, name, description, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, tag_key) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      model = excluded.model,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN');
  try {
    for (const tag of tags) {
      statement.run(options.domain, tag.tag_key, tag.name, tag.description, options.model, now, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadTags(db, options.domain);
}

function normalizeTags(value: unknown, minTags: number, domain: string): AiTag[] {
  const rawTags = value && typeof value === 'object' && Array.isArray((value as { tags?: unknown }).tags)
    ? (value as { tags: unknown[] }).tags
    : [];
  const tags = rawTags
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as { tag_key?: unknown; key?: unknown; name?: unknown; description?: unknown };
      const name = String(raw.name || raw.tag_key || raw.key || '').trim();
      const tagKey = slug(String(raw.tag_key || raw.key || name));
      const description = String(raw.description || '').trim();
      if (!tagKey || !name) return null;
      return { domain, tag_key: tagKey, name, description: description || name };
    })
    .filter((tag): tag is AiTag => Boolean(tag));

  if (tags.length >= minTags) return dedupeTags(tags);
  return dedupeTags([...tags, ...fallbackTags(domain)]);
}

function fallbackTags(domain = 'ai'): AiTag[] {
  if (domain !== 'ai') return [];
  return [
    { domain: 'ai', tag_key: 'foundation_models', name: 'Foundation Models', description: 'Large language, multimodal, and generative model builders or commentators.' },
    { domain: 'ai', tag_key: 'ai_agents', name: 'AI Agents', description: 'Autonomous agents, tool use, workflow automation, and agent frameworks.' },
    { domain: 'ai', tag_key: 'ai_research', name: 'AI Research', description: 'Research scientists, labs, papers, benchmarks, and frontier model analysis.' },
    { domain: 'ai', tag_key: 'ai_infrastructure', name: 'AI Infrastructure', description: 'Model serving, GPUs, data systems, MLOps, training, and deployment infrastructure.' },
    { domain: 'ai', tag_key: 'ai_applications', name: 'AI Applications', description: 'AI products, startups, enterprise applications, and applied use cases.' },
    { domain: 'ai', tag_key: 'ai_safety_policy', name: 'AI Safety & Policy', description: 'Governance, regulation, alignment, safety, ethics, and societal impact.' },
    { domain: 'ai', tag_key: 'ai_education', name: 'AI Education', description: 'Teaching, tutorials, courses, explainers, and public AI literacy.' },
    { domain: 'ai', tag_key: 'open_source_ai', name: 'Open Source AI', description: 'Open models, datasets, libraries, community projects, and developer tooling.' },
  ];
}

function dedupeTags(tags: AiTag[]): AiTag[] {
  const seen = new Set<string>();
  const result: AiTag[] = [];
  for (const tag of tags) {
    if (seen.has(tag.tag_key)) continue;
    seen.add(tag.tag_key);
    result.push(tag);
  }
  return result;
}

function loadKols(db: SqliteDatabase, options: CliOptions): KolForTagging[] {
  const where = options.refetch
    ? ''
    : 'WHERE NOT EXISTS (SELECT 1 FROM kol_tags kt WHERE kt.domain = ? AND kt.kol_key = k.kol_key)';
  const limitSql = options.maxKols ? 'LIMIT ?' : '';
  const params: Array<string | number> = [];
  if (!options.refetch) params.push(options.domain);
  if (options.maxKols) params.push(options.maxKols);
  return db.prepare(`
    SELECT
      k.kol_key,
      k.name,
      k.handle,
      k.username,
      k.bio,
      k.followers,
      k.verified,
      k.list_count,
      k.list_names_json,
      k.matched_keywords_json,
      k.influence_score
    FROM twitter_kols k
    ${where}
    ORDER BY k.influence_score DESC, k.list_count DESC, k.followers DESC
    ${limitSql}
  `).all(...params) as KolForTagging[];
}

async function tagKol(options: CliOptions, kol: KolForTagging, tags: AiTag[]): Promise<KolTagResult[]> {
  const prompt = [
    `Classify this ${options.domain.toUpperCase()}-domain Twitter/X KOL into one or more provided tags.`,
    'Use the bio, list names, matched keywords, and account metadata. Multiple tags are allowed.',
    'Return strict JSON only: {"tags":[{"tag_key":"...","confidence":0.0,"reason":"short reason"}]}',
    '',
    `Allowed tags: ${JSON.stringify(tags)}`,
    `KOL: ${JSON.stringify({
      name: kol.name,
      handle: kol.handle,
      username: kol.username,
      bio: kol.bio,
      followers: kol.followers,
      verified: Boolean(kol.verified),
      list_count: kol.list_count,
      list_names: jsonArray(kol.list_names_json),
      matched_keywords: jsonArray(kol.matched_keywords_json),
      influence_score: kol.influence_score,
    })}`,
  ].join('\n');

  try {
    const raw = await ollamaJson(options, prompt);
    return normalizeKolTagResults(raw, tags);
  } catch (error) {
    console.warn(`Ollama KOL tag response was invalid for ${kol.kol_key}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function normalizeKolTagResults(value: unknown, tags: AiTag[]): KolTagResult[] {
  const allowed = new Set(tags.map(tag => tag.tag_key));
  const rawTags = value && typeof value === 'object' && Array.isArray((value as { tags?: unknown }).tags)
    ? (value as { tags: unknown[] }).tags
    : [];
  return rawTags
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as { tag_key?: unknown; confidence?: unknown; reason?: unknown };
      const tagKey = slug(String(raw.tag_key || ''));
      if (!allowed.has(tagKey)) return null;
      return {
        tag_key: tagKey,
        confidence: clamp(Number(raw.confidence), 0, 1),
        reason: String(raw.reason || '').replace(/\s+/g, ' ').slice(0, 500),
      };
    })
    .filter((item): item is KolTagResult => Boolean(item));
}

function saveKolTags(db: SqliteDatabase, domain: string, kolKey: string, results: KolTagResult[]) {
  db.prepare('DELETE FROM kol_tags WHERE domain = ? AND kol_key = ?').run(domain, kolKey);
  if (!results.length) return;

  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO kol_tags (domain, kol_key, tag_key, confidence, reason, tagged_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, kol_key, tag_key) DO UPDATE SET
      confidence = excluded.confidence,
      reason = excluded.reason,
      tagged_at = excluded.tagged_at
  `);
  db.exec('BEGIN');
  try {
    for (const result of results) {
      statement.run(domain, kolKey, result.tag_key, result.confidence, result.reason, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function ollamaJson(options: CliOptions, prompt: string): Promise<unknown> {
  const response = await fetch(options.ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      think: false,
      stream: false,
      format: 'json',
      prompt,
      options: { temperature: 0 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama request failed with ${response.status}: ${await response.text()}`);
  const data = await response.json() as { response?: string };
  return parseJsonObject(data.response || '');
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
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

function jsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(item => item !== 'null') : [];
  } catch {
    return [];
  }
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function printUsage() {
  console.log(`
Usage:
  pnpm tag:twitter-kols
  pnpm tag:twitter-kols -- --max-kols 20

Options:
  --db            SQLite path, default data/twitter_lists.sqlite
  --domain        Tagging domain, default ai
  --model         Ollama model, default gemma4:26b
  --ollama-url    Ollama generate endpoint, default http://localhost:11434/api/generate
  --min-tags      Minimum AI subfield tags to maintain, default 6
  --max-kols      Tag only top N untagged KOLs
  --refetch       Regenerate tags and re-tag KOLs even if already tagged

Tables:
  tags stores reusable domain taxonomies.
  kol_tags stores many-to-many KOL tag assignments by domain.
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
