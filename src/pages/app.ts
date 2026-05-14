import { Agent } from '@greaseclaw/workflow-sdk';
import {
  profileExists,
  extractListId,
  cleanHandle,
  capitalize,
  parseJson,
  clampNumber,
  unique,
  sleep,
  extractSearchTweets,
  sourcesFromSearchTweets,
  initials,
  escapeHtml,
  escapeAttr,
  portfolioSchema,
  portfolioPrompt,
  type Source,
  type Goal,
  type DistributionItem,
  type Layer,
  type PortfolioModel,
} from '../shared';

const app = document.querySelector('#app') as HTMLElement;
const $ = <T extends HTMLElement>(selector: string, root: Document | HTMLElement = document): T | null =>
  root.querySelector<T>(selector);
const $$ = <T extends HTMLElement>(selector: string, root: Document | HTMLElement = document): T[] =>
  [...root.querySelectorAll<T>(selector)];

declare global {
  interface Window {
    agentOptions?: Record<string, unknown>;
  }
}

const agent = new Agent(window.agentOptions || {});
const apiBaseUrl = (import.meta as { env: { CDP_BASE_URL?: string } }).env?.CDP_BASE_URL || 'http://localhost:9222/json/api';
const listKeys: ('core' | 'diversity' | 'radar')[] = ['core', 'diversity', 'radar'];
const apiIntervalMs = 900;

let step = 1;
let interest = '';
let error = '';
let loading = false;
let model = emptyModel();
let pickedGoals: string[] = [];
let picked: Record<string, Source[]> = emptyPicked();
let filters = { type: '全部', stance: '', lang: '' };
let nextApiAt = 0;

interface NormalizedSource extends Source {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  type: string;
  role: string;
  content: string;
  stance: string;
  lang: string;
  focus: number;
  diversity: number;
  reason: string;
  state: 'new' | 'add' | 'ignore';
}

interface NormalizedModel {
  goals: Goal[];
  distribution: DistributionItem[];
  layers: Layer[];
  sources: NormalizedSource[];
}

function emptyModel(): NormalizedModel {
  return { goals: [], distribution: [], layers: [], sources: [] };
}

function emptyPicked(): Record<string, Source[]> {
  return { core: [], diversity: [], radar: [] };
}

function render() {
  const labels = ['兴趣领域', '关注目标', '组合结构', '推荐来源', '健康报告'];
  app.innerHTML = `
    <div class="top">
      <div class="progress"><i style="width:${(step - 1) * 25}%"></i></div>
      <div class="steps">${labels.map((label, index) => `
        <span class="${index < step ? 'on' : ''} ${index + 1 === step ? 'now' : ''}">
          <b>${index + 1}</b>${label}
        </span>`).join('')}</div>
    </div>
    <main>${loading ? loadingView() : views[step]()}</main>`;
  bindEvents();
}

const views: Record<number, () => string> = {
  1: landingView,
  2: goalsView,
  3: portfolioView,
  4: sourcesView,
  5: reportView,
};

function landingView(): string {
  return `
    <section class="view hero">
      <h1>Build a focused<br><span class="gold">attention portfolio</span></h1>
      <p class="lead">输入一个领域，由 Agent 动态生成目标、结构和候选信息源。</p>
      <div class="row">
        <input class="input" id="interest" placeholder="输入你感兴趣的领域" value="${escapeHtml(interest)}">
        <button class="primary" id="start">生成组合</button>
      </div>
      ${error ? `<p class="err">${escapeHtml(error)}</p>` : '<p id="err" class="err"></p>'}
      <p class="tiny" style="margin-top:28px">Goals, sources, and analysis are generated through the workflow Agent.</p>
    </section>`;
}

function loadingView(): string {
  return `
    <section class="view hero">
      <h2>Agent 正在生成</h2>
      <p class="lead">正在为「${escapeHtml(interest)}」生成关注目标、组合结构和候选来源...</p>
      <div class="meter"><i style="width:100%"></i></div>
    </section>`;
}

function goalsView(): string {
  return `
    <section class="view">
      ${nav('返回', '生成关注组合', pickedGoals.length === 0)}
      <h2>你关注「${escapeHtml(interest)}」的主要目的是什么？</h2>
      <p class="lead" style="text-align:center">目标由 Agent 生成，最多选择 3 个。</p>
      <div class="grid goals">${model.goals.map(goalCard).join('')}</div>
      ${pickedGoals.length ? goalSummary() : ''}
    </section>`;
}

function goalCard(goal: Goal): string {
  const selected = pickedGoals.includes(goal.id);
  return `
    <button class="card select ${selected ? 'on' : ''}" data-goal="${escapeAttr(goal.id)}">
      <div class="icon">${escapeHtml(goal.icon || '◎')}</div>
      <h3>${escapeHtml(goal.title)}</h3>
      <p class="tiny">${escapeHtml(goal.titleEn || goal.id)}</p>
      <p class="muted" style="margin-top:10px">${escapeHtml(goal.description)}</p>
      ${(goal.tags || []).map(tag).join('')}
    </button>`;
}

function goalSummary(): string {
  return `
    <div class="summary">
      <span class="tiny">当前目标</span>
      <div>${pickedGoals.map(id => tag(model.goals.find(goal => goal.id === id)?.title || id)).join('')}</div>
    </div>`;
}

function portfolioView(): string {
  return `
    <section class="view">
      ${nav('返回', '查看推荐来源')}
      <h2>你的 ${escapeHtml(interest)} 关注组合建议</h2>
      <div class="layout">
        <div class="card">
          <h3>组合配比</h3>
          <div class="bars">${model.distribution.map(distributionRow).join('')}</div>
        </div>
        <div class="grid layers">${model.layers.map(layerCard).join('')}</div>
      </div>
    </section>`;
}

function distributionRow(item: DistributionItem): string {
  return `
    <div class="barrow">
      <span class="tiny">${escapeHtml(item.label)}</span>
      <div class="meter"><i style="width:${clampNumber(item.value, 0, 100)}%"></i></div>
      <span class="gold">${clampNumber(item.value, 0, 100)}%</span>
    </div>`;
}

function layerCard(layer: Layer): string {
  return `
    <div class="card">
      <h3>${escapeHtml(layer.name)}</h3>
      <p class="tiny">${escapeHtml(layer.nameCn || layer.key)}</p>
      <p class="muted" style="margin-top:12px">${escapeHtml(layer.description)}</p>
      ${(layer.tags || []).map(tag).join('')}
      <p class="gold" style="margin-top:14px">建议数量：${escapeHtml(String(layer.suggested || '动态'))}</p>
    </div>`;
}

function sourcesView(): string {
  const visibleSources = model.sources.filter(source =>
    source.state !== 'ignore'
    && (filters.type === '全部' || source.type === filters.type)
    && (!filters.stance || source.stance === filters.stance)
    && (!filters.lang || source.lang === filters.lang)
  );
  const stats = health();

  return `
    <section class="view">
      ${nav('返回', '生成健康报告')}
      <div class="health">${healthCards(stats)}</div>
      <div class="grid sources">
        <aside class="card side">${filtersView()}</aside>
        <section class="grid">
          <div class="row" style="justify-content:space-between">
            <h3>推荐来源 (${visibleSources.length})</h3>
            <button class="primary" id="addAll">关注全部</button>
          </div>
          ${visibleSources.map(sourceCard).join('')}
        </section>
        <aside class="card side">
          <h3>我的 ${escapeHtml(interest)} 组合</h3>
          ${listKeys.map(listBlock).join('')}
        </aside>
      </div>
    </section>`;
}

interface HealthStats {
  focus: number;
  diversity: number;
  redundancy: string;
  cocoon: string;
}

function healthCards(stats: HealthStats): string {
  return [
    ['聚焦度', stats.focus],
    ['多元度', stats.diversity],
    ['重复风险', stats.redundancy],
    ['信息茧房', stats.cocoon],
  ].map(item => `<div class="card"><p class="tiny">${item[0]}</p><div class="score">${item[1]}</div></div>`).join('');
}

function filtersView(): string {
  return `
    <h3>筛选器</h3>
    ${['全部', ...unique(model.sources.map(source => source.type))].map(value => filterButton('filter', value, filters.type === value)).join('')}
    <p class="tiny" style="margin-top:16px">观点倾向</p>
    ${unique(model.sources.map(source => source.stance)).map(value => filterButton('stance', value, filters.stance === value)).join('')}
    <p class="tiny" style="margin-top:16px">语言</p>
    ${unique(model.sources.map(source => source.lang)).map(value => filterButton('lang', value, filters.lang === value)).join('')}
    <button class="ghost" id="clear" style="margin-top:16px">清除筛选</button>`;
}

function filterButton(kind: string, value: string, active: boolean): string {
  const cls = kind === 'filter' ? 'filter chip' : 'chip';
  return `<button class="${cls} ${active ? 'on' : ''}" data-${kind}="${escapeAttr(value)}">${escapeHtml(value)}</button>`;
}

function sourceCard(source: NormalizedSource): string {
  const type = source.type.toLowerCase();
  const metadata = [source.role, source.content, source.stance, source.lang].filter(Boolean);
  const actions = source.state === 'add'
    ? `<p class="ok">✓ 已加入 ${escapeHtml(source.type)} List</p>`
    : `<div class="source-actions">
        <button class="primary" data-add="${source.id}">加入关注组合</button>
        <button class="ghost" data-ignore="${source.id}">暂时忽略</button>
      </div>`;

  return `
    <article class="card source">
      <div class="source-head">
        <span class="avatar">${escapeHtml(source.avatar || initials(source.name))}</span>
        <div><h3>${escapeHtml(source.name)}</h3><p class="tiny">${escapeHtml(source.handle || '')}</p></div>
        <span class="badge ${escapeAttr(type)}">${escapeHtml(source.type)}</span>
      </div>
      <p class="muted">${escapeHtml(source.reason)}</p>
      <p>${metadata.map(tag).join('')}</p>
      ${actions}
    </article>`;
}

function listBlock(key: string): string {
  const items = picked[key];
  const layer = model.layers.find(item => item.key === key);
  const required = layer?.suggested || '动态';
  const body = items.length
    ? items.map((source, index) => `
      <p class="row" style="justify-content:space-between;margin-top:8px">
        <span><span class="avatar" style="width:24px;height:24px;display:inline-grid;margin-right:8px;font-size:11px">${escapeHtml(source.avatar || initials(source.name))}</span>${escapeHtml(source.name)}</span>
        <button class="mini" data-remove="${key}:${index}">移除</button>
      </p>`).join('')
    : '<p class="tiny" style="margin-top:8px">尚未添加</p>';

  return `
    <div style="margin-top:16px">
      <p><b>${escapeHtml(layer?.name || capitalize(key))}</b> <span class="tiny">${items.length}/${required}</span></p>
      ${body}
    </div>`;
}

function reportView(): string {
  const stats = health();
  const total = Math.round((stats.focus + stats.diversity + quality() + novelty()) / 4);
  const summary = total >= 80
    ? '整体较健康，既能保持聚焦，也有多元视角。'
    : total >= 60
      ? '基础不错，建议继续补充多元来源。'
      : '需要增加 Diversity 来源并压缩重复内容。';

  return `
    <section class="view report">
      ${nav('返回', '开始在 X.com 上建立列表', false, 'xgo')}
      <div class="scorebox">
        <h2>${escapeHtml(interest)} 关注组合健康度报告</h2>
        <div class="bigscore" style="--pct:${total}%"><b>${total}</b></div>
        <p class="muted">${summary}</p>
      </div>
      <div class="grid cols">
        ${analysisCard('当前优势', advantages())}
        ${analysisCard('当前风险', risks())}
        ${analysisCard('建议调整', tips())}
      </div>
      <h3 style="margin:28px 0 14px">最终关注组合</h3>
      <div class="grid cols">${listKeys.map(finalList).join('')}</div>
    </section>`;
}

function analysisCard(title: string, items: string[]): string {
  return `<div class="card"><h3>${title}</h3><ul>${items.map(item => `<li class="muted">${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}

function finalList(key: string): string {
  const items = picked[key];
  const layer = model.layers.find(item => item.key === key);
  const body = items.length
    ? items.map(source => `<p class="muted" style="margin-top:9px">${escapeHtml(source.avatar || initials(source.name))} · ${escapeHtml(source.name)}</p>`).join('')
    : '<p class="tiny" style="margin-top:12px">尚未添加来源</p>';

  return `<div class="card"><h3>${escapeHtml(layer?.name || capitalize(key))} (${items.length})</h3>${body}</div>`;
}

function nav(back: string, next: string, disabled = false, id = 'next'): string {
  return `
    <div class="nav">
      <button class="ghost" id="back">${back}</button>
      <button class="primary" id="${id}" ${disabled ? 'disabled' : ''}>${next} →</button>
    </div>`;
}

function bindEvents() {
  $('#start')?.addEventListener('click', start);
  $('#interest')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') start();
  });

  $$('[data-goal]').forEach(button => button.addEventListener('click', () => toggleGoal(button.dataset.goal!)));
  $('#back')?.addEventListener('click', () => {
    step = Math.max(1, step - 1);
    render();
  });
  $('#next')?.addEventListener('click', () => { step = Math.min(5, step + 1); render(); });
  $('#xgo')?.addEventListener('click', autoCreate);

  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { filters.type = button.dataset.filter!; render(); }));
  $$('[data-stance]').forEach(button => button.addEventListener('click', () => {
    filters.stance = filters.stance === button.dataset.stance ? '' : button.dataset.stance!;
    render();
  }));
  $$('[data-lang]').forEach(button => button.addEventListener('click', () => {
    filters.lang = filters.lang === button.dataset.lang ? '' : button.dataset.lang!;
    render();
  }));

  $('#clear')?.addEventListener('click', () => { filters = { type: '全部', stance: '', lang: '' }; render(); });
  $('#addAll')?.addEventListener('click', () => { model.sources.filter(source => source.state === 'new').forEach(addSource); render(); });
  $$('[data-add]').forEach(button => button.addEventListener('click', () => {
    const source = model.sources.find(item => item.id === button.dataset.add);
    if (source) addSource(source);
    render();
  }));
  $$('[data-ignore]').forEach(button => button.addEventListener('click', () => {
    const source = model.sources.find(item => item.id === button.dataset.ignore);
    if (source) source.state = 'ignore';
    render();
  }));
  $$('[data-remove]').forEach(button => button.addEventListener('click', () => removeSource(button.dataset.remove!)));
}

async function start() {
  const input = $('#interest') as HTMLInputElement | null;
  const value = input?.value.trim();
  if (!value) {
    const errEl = $('#err');
    if (errEl) errEl.textContent = '请先输入一个感兴趣的领域';
    return;
  }

  interest = value;
  error = '';
  loading = true;
  render();

  try {
    model = normalizeModel(await generatePortfolio(value));
    pickedGoals = [];
    picked = emptyPicked();
    filters = { type: '全部', stance: '', lang: '' };
    step = 2;
  } catch (err) {
    error = `生成失败：${(err as Error).message || err}`;
    step = 1;
  } finally {
    loading = false;
    render();
  }
}

async function generatePortfolio(topic: string): Promise<unknown> {
  const result = await agent.complete(portfolioPrompt(topic), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: portfolioSchema,
  });
  const structure = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  const searchQueries = Array.isArray(structure.searchQueries) && structure.searchQueries.length
    ? structure.searchQueries
    : [topic];
  const tweets = [];

  for (const query of searchQueries.slice(0, 6)) {
    const response = await workflowApiCall('/v1/custom/twitter-search', {
      method: 'POST',
      body: { query, limit: 20 },
    });
    tweets.push(...extractSearchTweets(response));
  }

  return {
    ...structure,
    sources: sourcesFromSearchTweets(tweets, 18),
  };
}

function normalizeModel(value: unknown): NormalizedModel {
  const data = value && typeof value === 'object' ? value as Partial<PortfolioModel> : {};
  const normalized = {
    goals: Array.isArray(data.goals) ? data.goals.slice(0, 6) : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: normalizeLayers(data.layers),
    sources: Array.isArray(data.sources) ? data.sources.map(normalizeSource) : [],
  };

  if (!normalized.goals.length) throw new Error('Agent 没有返回 goals');
  if (!normalized.sources.length) throw new Error('Agent 没有返回 sources');
  return normalized;
}

function normalizeLayers(layers: unknown): Layer[] {
  const input = Array.isArray(layers) ? layers : [];
  return listKeys.map(key => {
    const layer = input.find(item => item && typeof item === 'object' && (item as Layer).key === key) as Layer | undefined;
    return {
      key,
      name: layer?.name || capitalize(key),
      nameCn: layer?.nameCn || key,
      description: layer?.description || '',
      tags: Array.isArray(layer?.tags) ? layer.tags : [],
      suggested: layer?.suggested || '动态',
    };
  });
}

function normalizeSource(source: unknown, index: number): NormalizedSource {
  const s = source && typeof source === 'object' ? source as Partial<Source> : {};
  const type = listKeys.map(capitalize).includes(s?.type) ? s.type! : 'Radar';
  return {
    id: String(s?.id || `source-${index}`),
    name: String(s?.name || 'Unknown source'),
    handle: String(s?.handle || ''),
    avatar: String(s?.avatar || initials(s?.name || 'S')).slice(0, 3),
    type,
    role: String(s?.role || ''),
    content: String(s?.content || ''),
    stance: String(s?.stance || ''),
    lang: String(s?.lang || ''),
    focus: clampNumber(s?.focus, 0, 100),
    diversity: clampNumber(s?.diversity, 0, 100),
    reason: String(s?.reason || ''),
    state: 'new',
  };
}

function toggleGoal(id: string) {
  if (pickedGoals.includes(id)) {
    pickedGoals = pickedGoals.filter(goal => goal !== id);
  } else if (pickedGoals.length < 3) {
    pickedGoals.push(id);
  }
  render();
}

function addSource(source: NormalizedSource) {
  const key = source.type.toLowerCase();
  if (!picked[key].some(item => item.id === source.id)) {
    picked[key].push(source);
    source.state = 'add';
  }
}

function removeSource(value: string) {
  const [key, index] = value.split(':');
  const source = picked[key].splice(Number(index), 1)[0];
  if (source) source.state = 'new';
  render();
}

async function autoCreate() {
  const allSources = listKeys.flatMap(key => picked[key]);
  app.insertAdjacentHTML('beforeend', `
    <div class="modal">
      <section class="card view modal-panel">
        <h2>AI 自动创建 X.com 列表</h2>
        <p class="lead" style="text-align:center">通过 workflow SDK page bridge 调用 X.com list API</p>
        <div class="meter"><i id="autoBar"></i></div>
        <div class="log" id="logs"></div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <a class="primary" href="https://x.com/i/lists" target="_blank">查看 X.com 列表</a>
          <button class="ghost" id="closeAuto">返回报告</button>
        </div>
      </section>
    </div>`);

  $('#closeAuto')?.addEventListener('click', () => {
    const modal = $('.modal');
    if (modal) modal.remove();
  });

  const logs = $('#logs');
  const bar = $('#autoBar') as HTMLElement | null;
  const selectedLists = listKeys.filter(key => picked[key].length);
  const totalSteps = Math.max(1, selectedLists.length + allSources.length * 2);
  let done = 0;
  const log = (message: string, status = 'ok') => {
    if (logs) {
      logs.insertAdjacentHTML('beforeend', `<p class="${status}">${escapeHtml(message)}</p>`);
      logs.scrollTop = 9999;
    }
  };
  const advance = () => {
    done += 1;
    if (bar) bar.style.width = `${Math.min(100, Math.round(done / totalSteps * 100))}%`;
  };

  if (!allSources.length) {
    log('请先添加至少一个关注源。', 'err');
    if (bar) bar.style.width = '100%';
    return;
  }

  try {
    log('初始化 workflow SDK page bridge');
    const createdLists: Record<string, string> = {};

    for (const key of selectedLists) {
      const listName = `${interest} - ${capitalize(key)}`;
      log(`创建列表：${listName}`);
      const result = await workflowApiCall('/v1/custom/twitter-list-create', {
        method: 'POST',
        body: {
          name: listName,
          description: `${interest} ${capitalize(key)} attention portfolio`,
          is_private: true,
        },
      });
      createdLists[key] = extractListId(result);
      log(createdLists[key] ? `列表创建请求完成：${createdLists[key]}` : '列表创建请求已提交，未返回 list_id');
      advance();
    }

    for (const source of allSources) {
      const key = source.type.toLowerCase();
      const listId = createdLists[key];
      if (!listId) {
        log(`跳过 ${source.handle || source.name}：缺少 ${source.type} list_id`, 'warn');
        advance();
        continue;
      }

      const username = cleanHandle(source.handle || source.name);
      if (!username) {
        log(`跳过 ${source.name}：缺少用户名`, 'warn');
        advance();
        continue;
      }

      log(`检查用户是否存在：@${username}`);
      const profile = await workflowApiCall('/v1/custom/twitter-profile', {
        method: 'POST',
        body: { username },
      });
      advance();

      if (!profileExists(profile)) {
        log(`跳过 @${username}：用户不存在或无法读取 profile`, 'warn');
        advance();
        continue;
      }

      log(`添加 @${username} 到 ${source.type} List`);
      await workflowApiCall('/v1/custom/twitter-list-add', {
        method: 'POST',
        body: {
          list_id: listId,
          username,
        },
      });
      log(`已提交添加请求：@${username}`);
      advance();
    }

    if (bar) bar.style.width = '100%';
    log('完成：workflow SDK API 调用流程结束');
  } catch (err) {
    if (bar) bar.style.width = '100%';
    log(`调用失败：${(err as Error).message || err}`, 'err');
    log('请确认 X.com API/Chrome DevTools 代理已启动，或在 workflow 运行环境中执行。', 'warn');
  }
}

interface WorkflowApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

async function workflowApiCall(endpoint: string, options: WorkflowApiOptions = {}): Promise<unknown> {
  await throttleApi();
  const url = `${apiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof data === 'object' && (data as { message?: string }).message ? (data as { message: string }).message : `Request failed: ${response.status}`);
  }
  return data;
}

async function throttleApi(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
}

function health(): HealthStats {
  const core = picked.core.length;
  const diversity = picked.diversity.length;
  const total = listKeys.reduce((sum, key) => sum + picked[key].length, 0);
  return {
    focus: Math.min(100, 70 + core * 4 - diversity),
    diversity: Math.min(100, 45 + diversity * 8),
    redundancy: total > 22 ? '中' : '低',
    cocoon: diversity < 3 ? '高' : diversity < 5 ? '中' : '低',
  };
}

function quality(): number {
  const selected = listKeys.flatMap(key => picked[key]);
  if (!selected.length) return 50;
  return Math.round(selected.reduce((sum, source) => sum + (source.focus || 0), 0) / selected.length);
}

function novelty(): number {
  return Math.min(100, 50 + picked.radar.length * 8);
}

function advantages(): string[] {
  const items: string[] = [];
  if (picked.core.length > 2) items.push('Core List 已有稳定高质量来源');
  if (picked.diversity.length > 1) items.push('已开始补充多元视角');
  if (picked.radar.length > 1) items.push('Radar List 可帮助发现新趋势');
  return items.length ? items : ['尚未添加来源，建议先关注推荐列表'];
}

function risks(): string[] {
  const items: string[] = [];
  if (picked.diversity.length < 3) items.push('批判性观点和落地案例偏少');
  if (!picked.diversity.some(source => /中文|Chinese|China/i.test(source.lang || ''))) items.push('非英语来源覆盖偏低');
  if (!picked.radar.length) items.push('缺少新趋势观察');
  return items;
}

function tips(): string[] {
  const items: string[] = [];
  if (picked.diversity.length < 5) items.push(`增加 ${5 - picked.diversity.length} 个多元视角来源`);
  if (picked.core.length < 6) items.push(`增加 ${6 - picked.core.length} 个核心关注来源`);
  if (picked.radar.length) items.push('每 30 天复查 Radar List');
  return items;
}

function tag(value: string): string {
  return `<span class="pill">${escapeHtml(value)}</span>`;
}

render();
