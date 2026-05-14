import { Agent } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis, type WorkflowApis } from '../workflows/api';
import {
  extractListId,
  cleanHandle,
  capitalize,
  parseJson,
  clampNumber,
  unique,
  sleep,
  extractSearchTweets,
  extractTwitterLists,
  extractTwitterUserCandidates,
  candidatesFromSearchTweets,
  candidatesFromSources,
  initials,
  escapeHtml,
  escapeAttr,
  portfolioSchema,
  portfolioPrompt,
  searchQuerySchema,
  searchQueryPrompt,
  aiSourceSchema,
  aiSourcePrompt,
  candidateFilterSchema,
  candidateFilterPrompt,
  saveInterestField,
  saveKolCandidates,
  saveKols,
  saveLists,
  type Source,
  type Goal,
  type DistributionItem,
  type Layer,
  type PortfolioModel,
  type TwitterList,
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
const apis = createWorkflowApis(agent);
const listKeys: ('core' | 'diversity' | 'radar')[] = ['core', 'diversity', 'radar'];
const apiIntervalMs = 15_000;
const searchQueryLimit = 3;
const searchResultLimit = 10;
const twitterListFetchLimit = 100;
const suggestedKolLimit = 20;
const listSearchLimit = 30;
const listSearchQueryLimit = 2;
const listMembersListLimit = 4;
const listMembersLimit = 20;
const profileEnrichmentLimit = 12;

type CandidateChannel = 'ai_seed' | 'tweet_search' | 'twitter_suggested' | 'list_search';

const candidateChannels: Array<{ key: CandidateChannel; label: string; description: string }> = [
  { key: 'ai_seed', label: 'AI 推荐', description: '由大模型补充少量高置信账号' },
  { key: 'tweet_search', label: 'Tweet 搜索', description: '从相关推文作者中发现 KOL' },
  { key: 'twitter_suggested', label: '系统推荐', description: '读取 X.com 推荐关注用户并过滤' },
  { key: 'list_search', label: 'List 搜索', description: '搜索高关注 List 并读取成员' },
];

let step = 1;
let interest = '';
let error = '';
let loading = false;
let loadingState = emptyLoadingState();
let model = emptyModel();
let pickedGoals: string[] = [];
let picked: Record<string, Source[]> = emptyPicked();
let filters = { type: '全部', stance: '', lang: '' };
let ownedLists: TwitterList[] = [];
let listPlans: Record<ListKey, ListPlan> = emptyListPlans();
let activeChannels: CandidateChannel[] = candidateChannels.map(channel => channel.key);
let existingListHandles: string[] = [];
let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}

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
  candidateSource: string;
  state: 'new' | 'add' | 'ignore';
}

interface NormalizedModel {
  goals: Goal[];
  distribution: DistributionItem[];
  layers: Layer[];
  sources: NormalizedSource[];
  searchQueries: string[];
}

type ListKey = 'core' | 'diversity' | 'radar';

interface ListPlan {
  key: ListKey;
  name: string;
  description: string;
  mode: 'reuse' | 'create';
  listId: string;
  created: boolean;
}

type LoadingStepStatus = 'todo' | 'active' | 'done';

interface LoadingStep {
  label: string;
  status: LoadingStepStatus;
}

interface LoadingState {
  title: string;
  message: string;
  progress: number;
  steps: LoadingStep[];
}

function emptyModel(): NormalizedModel {
  return { goals: [], distribution: [], layers: [], sources: [], searchQueries: [] };
}

function emptyPicked(): Record<string, Source[]> {
  return { core: [], diversity: [], radar: [] };
}

function emptyListPlans(): Record<ListKey, ListPlan> {
  return Object.fromEntries(listKeys.map(key => [key, defaultListPlan(key)])) as Record<ListKey, ListPlan>;
}

function emptyLoadingState(): LoadingState {
  return { title: 'Agent 正在生成', message: '', progress: 8, steps: [] };
}

function defaultListPlan(key: ListKey): ListPlan {
  return {
    key,
    name: listNameForKey(key),
    description: `${interest || 'Attention'} ${capitalize(key)} attention portfolio`,
    mode: 'create',
    listId: '',
    created: false,
  };
}

function startLoading(title: string, message: string, steps: string[]) {
  loading = true;
  loadingState = {
    title,
    message,
    progress: 8,
    steps: steps.map((label, index) => ({ label, status: index === 0 ? 'active' : 'todo' })),
  };
  render();
}

function updateLoading(message: string, progress: number, activeIndex?: number) {
  loadingState = {
    ...loadingState,
    message,
    progress,
    steps: loadingState.steps.map((step, index) => ({
      ...step,
      status: activeIndex === undefined
        ? step.status
        : index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo',
    })),
  };
  render();
}

function stopLoading() {
  loading = false;
  loadingState = emptyLoadingState();
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
      <p class="tiny" style="margin-top:28px">Goals and structure come from Agent; recommended accounts come mostly from Twitter/X search with small AI seed supplements.</p>
    </section>`;
}

function loadingView(): string {
  const progress = clampNumber(loadingState.progress, 4, 100);
  return `
    <section class="view hero loading-panel">
      <div class="loader" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>${escapeHtml(loadingState.title || 'Agent 正在生成')}</h2>
      <p class="lead">${escapeHtml(loadingState.message || `正在为「${interest}」生成关注组合...`)}</p>
      <div class="loading-meter">
        <i style="width:${progress}%"></i>
      </div>
      <p class="tiny loading-percent">${progress}%</p>
      ${loadingState.steps.length ? `<div class="loading-steps">${loadingState.steps.map(loadingStepView).join('')}</div>` : ''}
    </section>`;
}

function loadingStepView(step: LoadingStep): string {
  return `<p class="loading-step ${step.status}"><span></span>${escapeHtml(step.label)}</p>`;
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
      ${nav('返回', '确认结构并生成推荐来源')}
      ${error ? `<p class="err" style="text-align:center">${escapeHtml(error)}</p>` : ''}
      <h2>你的 ${escapeHtml(interest)} 关注组合建议</h2>
      <div class="layout">
        <div class="card">
          <h3>组合配比</h3>
          <div class="bars">${model.distribution.map(distributionRow).join('')}</div>
        </div>
        <div class="grid layers">${model.layers.map(layerCard).join('')}</div>
      </div>
      <div class="card" style="margin-top:18px">
        <h3>KOL 候选来源</h3>
        <p class="tiny" style="margin-top:8px">至少激活 1 个来源；激活越多，候选池越完整，但 API 调用也会更多。</p>
        <div class="grid cols" style="margin-top:14px">${candidateChannels.map(channelCard).join('')}</div>
      </div>
      <div class="card" style="margin-top:18px">
        <h3>X.com 列表准备</h3>
        <p class="tiny" style="margin-top:8px">只会复用你自己创建或已订阅的列表；也可以改为创建新列表。</p>
        <div class="grid cols" style="margin-top:14px">${listKeys.map(listPlanCard).join('')}</div>
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

function channelCard(channel: { key: CandidateChannel; label: string; description: string }): string {
  const active = activeChannels.includes(channel.key);
  const disableLast = active && activeChannels.length === 1;
  return `
    <label class="card select ${active ? 'on' : ''}" style="display:block">
      <input type="checkbox" data-channel="${channel.key}" ${active ? 'checked' : ''} ${disableLast ? 'disabled' : ''}>
      <h3 style="margin-top:10px">${escapeHtml(channel.label)}</h3>
      <p class="muted" style="margin-top:8px">${escapeHtml(channel.description)}</p>
      <p class="tiny" style="margin-top:10px">${active ? '已激活' : '未激活'}</p>
    </label>`;
}

function listPlanCard(key: ListKey): string {
  const plan = listPlans[key] || defaultListPlan(key);
  const existingOptions = ownedLists.map(list => `
    <option value="${escapeAttr(list.id)}" ${plan.listId === list.id ? 'selected' : ''}>
      ${escapeHtml(list.name)} (${list.members ?? 0})
    </option>`).join('');
  const currentName = plan.mode === 'reuse'
    ? ownedLists.find(list => list.id === plan.listId)?.name || plan.name
    : plan.name;

  return `
    <div>
      <p><b>${escapeHtml(capitalize(key))}</b></p>
      <p class="tiny" style="margin:6px 0 10px">${escapeHtml(currentName)}</p>
      <label class="choice"><input type="radio" name="list-${key}" data-list-mode="${key}:reuse" ${plan.mode === 'reuse' ? 'checked' : ''} ${ownedLists.length ? '' : 'disabled'}> 复用已有列表</label>
      <select class="input" data-list-select="${key}" ${plan.mode === 'reuse' && ownedLists.length ? '' : 'disabled'} style="margin-top:8px">
        ${ownedLists.length ? existingOptions : '<option>没有可复用的自建列表</option>'}
      </select>
      <label class="choice" style="margin-top:10px"><input type="radio" name="list-${key}" data-list-mode="${key}:create" ${plan.mode === 'create' ? 'checked' : ''}> 创建新列表</label>
      <p class="tiny" style="margin-top:8px">${plan.mode === 'reuse' ? `将复用 list_id: ${escapeHtml(plan.listId)}` : `将创建：${escapeHtml(plan.name)}`}</p>
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
  const sourceTags = source.candidateSource
    .split(/[,+]/)
    .map(value => value.trim())
    .filter(Boolean)
    .map(sourceLabel);
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
      <p>${[...sourceTags, ...metadata].map(tag).join('')}</p>
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
      ${nav('返回', '添加账号到 X.com 列表', false, 'xgo')}
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
  $('#next')?.addEventListener('click', handleNext);
  $('#xgo')?.addEventListener('click', autoCreate);
  $$('[data-list-mode]').forEach(input => input.addEventListener('change', () => updateListPlanMode((input as HTMLInputElement).dataset.listMode!)));
  $$('[data-list-select]').forEach(select => select.addEventListener('change', () => updateListPlanSelection((select as HTMLSelectElement).dataset.listSelect!, (select as HTMLSelectElement).value)));
  $$('[data-channel]').forEach(input => input.addEventListener('change', () => toggleChannel((input as HTMLInputElement).dataset.channel as CandidateChannel)));

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
  startLoading('生成关注组合', `正在为「${value}」生成关注目标和组合结构...`, [
    '整理兴趣领域',
    '调用 Agent 生成目标',
    '生成组合结构',
  ]);

  try {
    updateLoading('正在调用 Agent 生成目标和组合结构...', 32, 1);
    model = normalizeModel(await generateStructure(value));
    await saveInterestField(agent, value, model);
    updateLoading('组合结构已生成，正在准备下一步...', 92, 2);
    pickedGoals = [];
    picked = emptyPicked();
    filters = { type: '全部', stance: '', lang: '' };
    ownedLists = [];
    listPlans = emptyListPlans();
    activeChannels = candidateChannels.map(channel => channel.key);
    existingListHandles = [];
    step = 2;
  } catch (err) {
    error = `生成失败：${(err as Error).message || err}`;
    step = 1;
  } finally {
    stopLoading();
    render();
  }
}

async function handleNext() {
  if (step === 2) {
    await prepareListPlansAndShowStructure();
    return;
  }
  if (step === 3) {
    await confirmListsAndGenerateRecommendedSources();
    return;
  }
  step = Math.min(5, step + 1);
  render();
}

async function prepareListPlansAndShowStructure() {
  error = '';
  startLoading('检查已有列表', `正在检查你已有的 X.com 列表，并尽量匹配可复用列表...`, [
    '读取 X.com Lists',
    '筛选用户自建列表',
    '匹配 Core / Diversity / Radar',
  ]);

  try {
    updateLoading('正在调用 twitter_lists 读取已有列表...', 28, 0);
    const response = await callWithLimit(() => apis.twitter_lists(twitterListFetchLimit));
    updateLoading('正在筛选可复用的自建列表...', 58, 1);
    ownedLists = extractTwitterLists(response).filter(list => list.type === 'suggest_owned_subscribed_list');
    updateLoading('正在为每个组合层匹配列表...', 82, 2);
    listPlans = buildListPlans(ownedLists);
    await saveLists(agent, interest, Object.values(listPlans));
    step = 3;
  } catch (err) {
    error = `读取 X.com 列表失败：${(err as Error).message || err}`;
    step = 2;
  } finally {
    stopLoading();
    render();
  }
}

async function confirmListsAndGenerateRecommendedSources() {
  const created = await ensurePortfolioLists();
  if (!created) return;
  await generateRecommendedSources();
}

async function generateStructure(topic: string): Promise<unknown> {
  const result = await agent.complete(portfolioPrompt(topic), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: portfolioSchema,
  });
  return result.json || parseJson(result.text || '');
}

function buildListPlans(lists: TwitterList[]): Record<ListKey, ListPlan> {
  return Object.fromEntries(listKeys.map(key => {
    const plan = defaultListPlan(key);
    const reusable = findReusableList(lists, key);
    if (reusable) {
      plan.mode = 'reuse';
      plan.listId = reusable.id;
      plan.name = reusable.name;
    }
    return [key, plan];
  })) as Record<ListKey, ListPlan>;
}

function findReusableList(lists: TwitterList[], key: ListKey): TwitterList | undefined {
  const expected = normalizeListName(listNameForKey(key));
  const topic = normalizeListName(interest);
  const layer = normalizeListName(capitalize(key));
  return lists.find(list => normalizeListName(list.name) === expected)
    || lists.find(list => {
      const name = normalizeListName(list.name);
      return Boolean(topic && layer && name.includes(topic) && name.includes(layer));
    });
}

function updateListPlanMode(value: string) {
  const [key, mode] = value.split(':') as [ListKey, ListPlan['mode']];
  const plan = listPlans[key];
  if (!plan) return;
  plan.mode = mode;
  plan.created = false;
  if (mode === 'reuse') {
    const selected = ownedLists.find(list => list.id === plan.listId) || ownedLists[0];
    if (selected) {
      plan.listId = selected.id;
      plan.name = selected.name;
    }
  } else {
    plan.listId = '';
    plan.name = listNameForKey(key);
    plan.description = `${interest} ${capitalize(key)} attention portfolio`;
  }
  model.sources = [];
  model.searchQueries = [];
  render();
}

function updateListPlanSelection(key: string, listId: string) {
  const plan = listPlans[key as ListKey];
  const list = ownedLists.find(item => item.id === listId);
  if (!plan || !list) return;
  plan.mode = 'reuse';
  plan.listId = list.id;
  plan.name = list.name;
  plan.created = false;
  model.sources = [];
  model.searchQueries = [];
  render();
}

function toggleChannel(channel: CandidateChannel) {
  if (activeChannels.includes(channel)) {
    if (activeChannels.length === 1) {
      render();
      return;
    }
    activeChannels = activeChannels.filter(item => item !== channel);
  } else {
    activeChannels = [...activeChannels, channel];
  }
  model.sources = [];
  model.searchQueries = [];
  picked = emptyPicked();
  render();
}

async function ensurePortfolioLists(): Promise<boolean> {
  error = '';
  startLoading('准备 X.com 列表', `正在确认 X.com 列表；会复用已选列表，并自动创建缺失的新列表...`, [
    '确认列表选择',
    '创建缺失列表',
    '保存 list_id',
  ]);

  try {
    updateLoading('正在确认哪些列表复用、哪些列表新建...', 18, 0);
    const createKeys = listKeys.filter(key => {
      const plan = listPlans[key] || defaultListPlan(key);
      return !(plan.mode === 'reuse' && plan.listId);
    });
    const totalCreates = Math.max(1, createKeys.length);

    for (const [index, key] of createKeys.entries()) {
      const plan = listPlans[key] || defaultListPlan(key);
      updateLoading(`正在创建 ${plan.name}...`, 35 + Math.round(index / totalCreates * 42), 1);
      const response = await callWithLimit(() => apis.twitter_list_create(plan.name, plan.description, true));
      const listId = extractListId(response);
      if (!listId) throw new Error(`${plan.name} 创建后没有返回 list_id`);
      listPlans[key] = { ...plan, mode: 'reuse', listId, created: true };
    }
    updateLoading('X.com 列表已准备完成，正在进入推荐生成...', 92, 2);
    await saveLists(agent, interest, Object.values(listPlans));
    existingListHandles = await readExistingListHandles();
    return true;
  } catch (err) {
    error = `准备 X.com 列表失败：${(err as Error).message || err}`;
    step = 3;
    return false;
  } finally {
    stopLoading();
    render();
  }
}

function listNameForKey(key: ListKey): string {
  return `${interest || 'Attention'} - ${capitalize(key)}`;
}

function normalizeListName(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

async function generateRecommendedSources() {
  if (model.sources.length) {
    step = 4;
    render();
    return;
  }

  error = '';
  startLoading('生成推荐来源', loadingIntroText(), recommendationLoadingSteps());

  try {
    updateLoading('正在整理已选择的关注目标和组合层...', 14, 0);
    const selectedGoals = pickedGoals
      .map(id => model.goals.find(goal => goal.id === id)?.title || id)
      .filter(Boolean);
    const layers = model.layers.map(layer => `${layer.name}: ${layer.description}`);
    const recommendation = await generateRecommendations(interest, selectedGoals, layers);
    model = normalizeModel({ ...model, ...recommendation });
    await saveInterestField(agent, interest, model, selectedGoals);
    await saveKols(agent, interest, model.sources);
    step = 4;
  } catch (err) {
    error = `生成推荐列表失败：${(err as Error).message || err}`;
    step = 3;
  } finally {
    stopLoading();
    render();
  }
}

function loadingIntroText(): string {
  const activeLabels = candidateChannels
    .filter(channel => activeChannels.includes(channel.key))
    .map(channel => channel.label)
    .join('、');
  return `正在根据已选择的目标和组合结构，通过「${activeLabels}」生成候选账号...`;
}

function recommendationLoadingSteps(): string[] {
  const steps = ['整理已选目标'];
  if (activeChannels.includes('tweet_search') || activeChannels.includes('list_search')) steps.push('推断搜索词');
  if (activeChannels.includes('ai_seed')) steps.push('生成 AI seed');
  if (activeChannels.includes('tweet_search')) steps.push('搜索 Tweet');
  if (activeChannels.includes('twitter_suggested')) steps.push('读取系统推荐');
  if (activeChannels.includes('list_search')) steps.push('搜索 List', '读取 List 成员');
  steps.push('补充 Profile', 'AI 过滤候选', '保存推荐列表');
  return steps;
}

function loadingStepIndex(label: string): number {
  return Math.max(0, loadingState.steps.findIndex(step => step.label === label));
}

async function generateRecommendations(topic: string, selectedGoals: string[], layers: string[]) {
  const needsSearchQueries = activeChannels.includes('tweet_search') || activeChannels.includes('list_search');
  let searchQueries = [topic];
  if (needsSearchQueries) {
    updateLoading('正在让 Agent 推断 Twitter/X 搜索词...', 26, loadingStepIndex('推断搜索词'));
    const result = await agent.complete(searchQueryPrompt(topic, selectedGoals, layers), {
      system: 'You generate concise valid JSON matching the provided schema.',
      jsonSchema: searchQuerySchema,
    });
    const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
    searchQueries = Array.isArray(data.searchQueries) && data.searchQueries.length
      ? data.searchQueries
      : [topic];
  }
  const candidates = [];

  if (activeChannels.includes('ai_seed')) {
    updateLoading('正在生成少量 AI seed 推荐账号...', 42, loadingStepIndex('生成 AI seed'));
    const aiSources = await generateAiSeedSources(topic, selectedGoals, layers);
    candidates.push(...candidatesFromSources(aiSources, 'ai_seed'));
  }

  if (activeChannels.includes('tweet_search')) {
    const queries = searchQueries.slice(0, searchQueryLimit);
    for (const [index, query] of queries.entries()) {
      updateLoading(`正在搜索 X.com：${query}`, 52 + Math.round(index / Math.max(1, queries.length) * 30), loadingStepIndex('搜索 Tweet'));
      const response = await callWithLimit(() => apis.twitter_search(query, undefined, searchResultLimit));
      candidates.push(...candidatesFromSearchTweets(extractSearchTweets(response)));
    }
  }

  candidates.push(...await collectExternalCandidates(searchQueries, activeChannels));
  await enrichCandidateProfiles(candidates);
  const filteredCandidates = excludeExistingCandidates(dedupeCandidates(candidates), existingListHandles);
  await saveKolCandidates(agent, topic, filteredCandidates);

  updateLoading('正在用 AI 统一过滤 KOL 候选...', 82, loadingStepIndex('AI 过滤候选'));
  const sources = await filterKolCandidates(topic, selectedGoals, layers, filteredCandidates, existingListHandles);
  if (!sources.length) throw new Error('没有生成可推荐账号');

  return {
    sources,
    searchQueries,
  };
}

async function generateAiSeedSources(topic: string, selectedGoals: string[], layers: string[]): Promise<Source[]> {
  const result = await agent.complete(aiSourcePrompt(topic, selectedGoals, layers), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: aiSourceSchema,
  });
  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  return Array.isArray(data.sources) ? data.sources : [];
}

async function collectExternalCandidates(searchQueries: string[], channels: CandidateChannel[]) {
  const suggestedCandidates = [];

  const listMemberCandidates = [];

  if (channels.includes('twitter_suggested')) {
    updateLoading('正在读取 Twitter/X 系统推荐用户...', 48, loadingStepIndex('读取系统推荐'));
    const suggestedResponse = await callWithLimit(() => apis.twitter_suggested(suggestedKolLimit));
    suggestedCandidates.push(...extractTwitterUserCandidates(suggestedResponse, 'twitter_suggested'));
  }

  if (channels.includes('list_search')) {
    for (const [index, query] of searchQueries.slice(0, listSearchQueryLimit).entries()) {
      updateLoading(`正在搜索相关 X.com List：${query}`, 52 + index * 6, loadingStepIndex('搜索 List'));
      const listsResponse = await callWithLimit(() => apis.twitter_list_search(query, listSearchLimit));
      const lists = pickHighSignalLists(extractTwitterLists(listsResponse), listMembersListLimit);
      for (const list of lists) {
        updateLoading(`正在读取 List 成员：${list.name}`, 58 + index * 6, loadingStepIndex('读取 List 成员'));
        const membersResponse = await callWithLimit(() => apis.twitter_list_members(list.id, listMembersLimit));
        listMemberCandidates.push(...extractTwitterUserCandidates(membersResponse, `twitter_list_members:${list.name}`));
      }
    }
  }

  return [...suggestedCandidates, ...listMemberCandidates];
}

async function enrichCandidateProfiles(candidates: unknown[]) {
  const needsProfile = dedupeCandidates(candidates)
    .filter(candidate => {
      const item = candidate as { followers?: number; verified?: boolean; bio?: string };
      return item.followers === undefined || item.verified === undefined || !item.bio;
    })
    .slice(0, profileEnrichmentLimit) as Array<{ handle?: string; username?: string; name?: string; bio?: string; followers?: number; verified?: boolean; reason?: string }>;

  for (const candidate of needsProfile) {
    const username = cleanHandle(candidate.handle || candidate.username || candidate.name || '');
    if (!username) continue;
    updateLoading(`正在补充 @${username} 的 profile 信息...`, 74, loadingStepIndex('补充 Profile'));
    const response = await callWithLimit(() => apis.twitter_profile(username));
    const profile = extractTwitterUserCandidates(response, 'twitter_profile')[0];
    if (!profile) continue;
    candidate.name = profile.name || candidate.name;
    candidate.handle = profile.handle || candidate.handle;
    candidate.username = profile.username || candidate.username;
    candidate.bio = profile.bio || candidate.bio || '';
    candidate.followers = profile.followers ?? candidate.followers;
    candidate.verified = profile.verified ?? candidate.verified;
    candidate.reason = [candidate.reason, profile.reason].filter(Boolean).join(' ');
  }
}

async function filterKolCandidates(topic: string, selectedGoals: string[], layers: string[], candidates: unknown[], excludedHandles: string[] = []): Promise<Source[]> {
  const deduped = dedupeCandidates(candidates).slice(0, 100);
  if (!deduped.length) return [];
  const result = await agent.complete(candidateFilterPrompt(
    topic,
    selectedGoals,
    layers,
    JSON.stringify(deduped),
    excludedHandles,
  ), {
    system: 'You generate concise valid JSON matching the provided schema.',
    jsonSchema: candidateFilterSchema,
  });
  const data = (result.json || parseJson(result.text || '')) as Partial<PortfolioModel>;
  return Array.isArray(data.sources) ? data.sources : [];
}

async function readExistingListHandles(): Promise<string[]> {
  const handles = [];
  for (const key of listKeys) {
    const listId = listPlans[key]?.listId;
    if (!listId) continue;
    updateLoading(`正在读取 ${listPlans[key].name} 已有成员，避免重复推荐...`, 88, 2);
    const response = await callWithLimit(() => apis.twitter_list_members(listId, listMembersLimit));
    handles.push(...extractTwitterUserCandidates(response, `existing_list:${listPlans[key].name}`)
      .map(candidate => cleanHandle(candidate.handle || candidate.username || candidate.name || ''))
      .filter(Boolean));
  }
  return unique(handles.map(handle => handle.toLowerCase()));
}

function dedupeCandidates(candidates: unknown[]) {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as { handle?: string; username?: string; name?: string };
    const key = cleanHandle(item.handle || item.username || item.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function excludeExistingCandidates(candidates: unknown[], excludedHandles: string[]) {
  const excluded = new Set(excludedHandles.map(handle => cleanHandle(handle).toLowerCase()));
  return candidates.filter(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as { handle?: string; username?: string; name?: string };
    const key = cleanHandle(item.handle || item.username || item.name || '').toLowerCase();
    return !key || !excluded.has(key);
  });
}

function pickHighSignalLists(lists: TwitterList[], limit: number): TwitterList[] {
  return lists
    .filter(list => list.id)
    .sort((a, b) => (b.followers || 0) - (a.followers || 0) || (b.members || 0) - (a.members || 0))
    .slice(0, limit);
}

function normalizeModel(value: unknown): NormalizedModel {
  const data = value && typeof value === 'object' ? value as Partial<PortfolioModel> : {};
  const normalized = {
    goals: Array.isArray(data.goals) ? data.goals.slice(0, 6) : [],
    distribution: Array.isArray(data.distribution) ? data.distribution : [],
    layers: normalizeLayers(data.layers),
    sources: Array.isArray(data.sources) ? data.sources.map(normalizeSource) : [],
    searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries.map(String) : [],
  };

  if (!normalized.goals.length) throw new Error('Agent 没有返回 goals');
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
    candidateSource: String(s?.candidateSource || inferCandidateSource(s?.reason || '')),
    state: 'new',
  };
}

function sourceLabel(value: string): string {
  const map: Record<string, string> = {
    ai_seed: 'AI 推荐',
    tweet_search: 'Tweet 搜索',
    twitter_suggested: '系统推荐',
    twitter_list_members: 'List 搜索',
    list_search: 'List 搜索',
  };
  const key = value.startsWith('twitter_list_members') ? 'twitter_list_members' : value;
  return map[key] || value;
}

function inferCandidateSource(reason: string): string {
  if (/tweet_search|tweet search|推文|tweet/i.test(reason)) return 'tweet_search';
  if (/suggested|系统推荐/i.test(reason)) return 'twitter_suggested';
  if (/list/i.test(reason)) return 'twitter_list_members';
  if (/ai_seed|AI/i.test(reason)) return 'ai_seed';
  return '';
}

function toggleGoal(id: string) {
  if (pickedGoals.includes(id)) {
    pickedGoals = pickedGoals.filter(goal => goal !== id);
  } else if (pickedGoals.length < 3) {
    pickedGoals.push(id);
  }
  model.sources = [];
  model.searchQueries = [];
  picked = emptyPicked();
  filters = { type: '全部', stance: '', lang: '' };
  ownedLists = [];
  listPlans = emptyListPlans();
  activeChannels = candidateChannels.map(channel => channel.key);
  existingListHandles = [];
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
        <h2>添加账号到 X.com 列表</h2>
        <p class="lead" style="text-align:center">复用或新建的列表已在组合结构阶段确认；这里会直接添加到对应列表。</p>
        <div class="meter"><i id="autoBar"></i></div>
        <div class="log" id="logs"></div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="primary" id="openLists">查看 X.com 列表</button>
          <button class="ghost" id="closeAuto">返回报告</button>
        </div>
      </section>
    </div>`);

  $('#closeAuto')?.addEventListener('click', () => {
    const modal = $('.modal');
    if (modal) modal.remove();
  });
  $('#openLists')?.addEventListener('click', openPreparedLists);

  const logs = $('#logs');
  const bar = $('#autoBar') as HTMLElement | null;
  const totalSteps = Math.max(1, allSources.length);
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
    if (listKeys.some(key => picked[key].length && !listPlans[key]?.listId)) {
      throw new Error('X.com 列表尚未准备完成，请回到组合结构页确认列表');
    }

    for (const source of allSources) {
      const key = source.type.toLowerCase() as ListKey;
      const listId = listPlans[key]?.listId || '';
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

      log(`添加 @${username} 到 ${source.type} List`);
      await callWithLimit(() => apis.twitter_list_add(listId, username));
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

function openPreparedLists() {
  const listIds = unique(listKeys.map(key => listPlans[key]?.listId).filter(Boolean));
  if (!listIds.length) {
    window.open('https://x.com/i/lists', '_blank', 'noopener');
    return;
  }
  for (const listId of listIds) {
    window.open(`https://x.com/i/lists/${encodeURIComponent(listId)}`, '_blank', 'noopener');
  }
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
