import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SqliteDatabase = import('node:sqlite').DatabaseSync;

type CliOptions = {
  dbPath: string;
  outDir: string;
  domains: string[];
};

type TagRow = {
  domain: string;
  tag_key: string;
  name: string;
  description: string;
};

type KolRow = {
  kol_key: string;
  name?: string | null;
  handle?: string | null;
  username?: string | null;
  bio?: string | null;
  followers: number;
  verified: number;
  list_count: number;
  list_ids_json: string;
  list_names_json: string;
  matched_keywords_json: string;
  influence_score: number;
  score_details_json: string;
};

type KolTagRow = {
  kol_key: string;
  tag_key: string;
  confidence: number;
  reason?: string | null;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'twitter_lists.sqlite');
const defaultOutDir = path.join(repoRoot, 'data', 'export');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(options.dbPath);

  await mkdir(options.outDir, { recursive: true });
  const domains = options.domains.length ? options.domains : loadDomains(db);
  const interests = [];

  for (const domain of domains) {
    const tags = loadTags(db, domain);
    const fileName = `kol_${domain}.json`;
    const kolPayload = buildKolPayload(db, domain, tags);
    await writeJson(path.join(options.outDir, fileName), kolPayload);
    interests.push({
      domain,
      name: domainName(domain),
      description: domainDescription(domain),
      tags: tags.map(tag => ({
        key: tag.tag_key,
        name: tag.name,
        description: tag.description,
      })),
      kolFile: fileName,
      kolCount: kolPayload.kols.length,
    });
  }

  await writeJson(path.join(options.outDir, 'interest.json'), { interests });
  db.close();
  console.log(`Exported ${interests.length} domain(s) to ${options.outDir}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: defaultDbPath,
    outDir: defaultOutDir,
    domains: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
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
    if (arg === '--out-dir') {
      options.outDir = path.resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--out-dir=')) {
      options.outDir = path.resolve(arg.slice('--out-dir='.length));
      continue;
    }
    if (arg === '--domain' || arg === '--domains') {
      options.domains.push(...splitValues(readValue(args, index, arg)).map(slug));
      index += 1;
      continue;
    }
    if (arg.startsWith('--domain=')) {
      options.domains.push(...splitValues(arg.slice('--domain='.length)).map(slug));
      continue;
    }
    if (arg.startsWith('--domains=')) {
      options.domains.push(...splitValues(arg.slice('--domains='.length)).map(slug));
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  options.domains = [...new Set(options.domains.filter(Boolean))];
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

function loadDomains(db: SqliteDatabase): string[] {
  return (db.prepare('SELECT DISTINCT domain FROM tags ORDER BY domain ASC').all() as Array<{ domain: string }>)
    .map(row => row.domain);
}

function loadTags(db: SqliteDatabase, domain: string): TagRow[] {
  return db.prepare(`
    SELECT domain, tag_key, name, description
    FROM tags
    WHERE domain = ?
    ORDER BY tag_key ASC
  `).all(domain) as TagRow[];
}

function buildKolPayload(db: SqliteDatabase, domain: string, tags: TagRow[]) {
  const kolRows = db.prepare(`
    SELECT
      k.kol_key,
      k.name,
      k.handle,
      k.username,
      k.bio,
      k.followers,
      k.verified,
      k.list_count,
      k.list_ids_json,
      k.list_names_json,
      k.matched_keywords_json,
      k.influence_score,
      k.score_details_json
    FROM twitter_kols k
    WHERE EXISTS (
      SELECT 1 FROM kol_tags kt
      WHERE kt.domain = ? AND kt.kol_key = k.kol_key
    )
    ORDER BY k.influence_score DESC, k.list_count DESC, k.followers DESC
  `).all(domain) as KolRow[];

  const tagRows = db.prepare(`
    SELECT kol_key, tag_key, confidence, reason
    FROM kol_tags
    WHERE domain = ?
    ORDER BY confidence DESC, tag_key ASC
  `).all(domain) as KolTagRow[];
  const tagsByKol = groupTags(tagRows);

  return {
    domain,
    name: domainName(domain),
    description: domainDescription(domain),
    tags: tags.map(tag => ({
      key: tag.tag_key,
      name: tag.name,
      description: tag.description,
    })),
    kols: kolRows.map(kol => ({
      name: kol.name || '',
      handle: kol.handle || '',
      username: kol.username || '',
      bio: kol.bio || '',
      followers: kol.followers || 0,
      verified: Boolean(kol.verified),
      listCount: kol.list_count || 0,
      influenceScore: kol.influence_score || 0,
      tags: (tagsByKol.get(kol.kol_key) || []).map(tag => tag.key),
    })),
  };
}

function groupTags(rows: KolTagRow[]) {
  const map = new Map<string, Array<{ key: string; confidence: number; reason: string }>>();
  for (const row of rows) {
    const current = map.get(row.kol_key) || [];
    current.push({
      key: row.tag_key,
      confidence: row.confidence,
      reason: row.reason || '',
    });
    map.set(row.kol_key, current);
  }
  return map;
}

function domainName(domain: string): string {
  if (domain === 'ai') return 'AI';
  return domain.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function domainDescription(domain: string): string {
  if (domain === 'ai') return 'Artificial intelligence KOLs and subfield directions.';
  return `${domainName(domain)} KOLs and subfield directions.`;
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

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printUsage() {
  console.log(`
Usage:
  pnpm export:twitter-json
  pnpm export:twitter-json -- --domain ai --out-dir data/export

Outputs:
  interest.json
  kol_<domain>.json

Options:
  --db        SQLite path, default data/twitter_lists.sqlite
  --out-dir   Output directory, default data/export
  --domain    Domain(s) to export, comma-separated values are supported
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
