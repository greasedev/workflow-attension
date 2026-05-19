import { Agent } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis, type ExecutionResult } from '../workflows/api';
import {
  extractListId,
  cleanHandle,
  capitalize,
  clampNumber,
  unique,
  sleep,
  extractTwitterLists,
  extractTwitterUserCandidates,
  initials,
  escapeHtml,
  escapeAttr,
  saveInterestField,
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

type ListKey = 'core' | 'radar';
type LoadingStepStatus = 'todo' | 'active' | 'done';

interface InterestTag {
  key: string;
  name: string;
  description: string;
}

interface InterestDomain {
  domain: string;
  name: string;
  description: string;
  tags: InterestTag[];
  kolFile: string;
  kolCount?: number;
}

interface InterestIndex {
  interests: InterestDomain[];
}

interface KolRecord {
  name?: string;
  handle?: string;
  username?: string;
  bio?: string;
  followers?: number;
  verified?: boolean;
  listCount?: number;
  influenceScore?: number;
  tags?: string[];
}

interface KolExport extends InterestDomain {
  kols: KolRecord[];
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

interface ListPlan {
  key: ListKey;
  name: string;
  description: string;
  mode: 'reuse' | 'create';
  listId: string;
  created: boolean;
}

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

interface HealthStats {
  focus: number;
  diversity: number;
  redundancy: string;
  cocoon: string;
}

const agent = new Agent(window.agentOptions || {});
const apis = createWorkflowApis(agent);
const exportBaseUrl = 'https://raw.githubusercontent.com/greasedev/workflow-attension/refs/heads/main/data/export';
const interestUrl = `${exportBaseUrl}/interest.json`;
const listKeys: ListKey[] = ['core', 'radar'];
const apiIntervalMs = 15_000;
const addAccountDelayMinMs = 5_000;
const addAccountDelayMaxMs = 10_000;
const duplicateCheckMembersLimit = 200;
const twitterListFetchLimit = 100;
const maxSimpleListSize = 20;

let step = 1;
let interest = '';
let error = '';
let loginRequired = false;
let loginMessage = '';
let loading = false;
let loadingState = emptyLoadingState();
let model = emptyModel();
let picked: Record<string, Source[]> = emptyPicked();
let allRecommendedSources: NormalizedSource[] = [];
let filters = { type: '全部', stance: '', lang: '' };
let ownedLists: TwitterList[] = [];
let listPlans: Record<ListKey, ListPlan> = emptyListPlans();
let nextApiAt = 0;
let simpleInterests: InterestDomain[] = [];
let simpleInterestLoading = false;
let simpleSelectedDomain = '';
let simpleSelectedTags: string[] = [];
let simpleKolData: KolExport | null = null;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}

function emptyModel(): NormalizedModel {
  return { goals: [], distribution: [], layers: [], sources: [], searchQueries: [] };
}

function emptyPicked(): Record<string, Source[]> {
  return { core: [], radar: [] };
}

function emptyListPlans(): Record<ListKey, ListPlan> {
  return Object.fromEntries(listKeys.map(key => [key, defaultListPlan(key)])) as Record<ListKey, ListPlan>;
}

function emptyLoadingState(): LoadingState {
  return { title: '正在生成', message: '', progress: 8, steps: [] };
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
    steps: loadingState.steps.map((item, index) => ({
      ...item,
      status: activeIndex === undefined
        ? item.status
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
  const labels = ['领域与方向', '结构与推荐', '确认添加'];
  const progressWidth = (step - 1) * 50;
  app.innerHTML = `
    <div class="top">
      <div class="progress"><i style="width:${progressWidth}%"></i></div>
      <div class="steps">${labels.map((label, index) => `
        <span class="${index < step ? 'on' : ''} ${index + 1 === step ? 'now' : ''}">
          <b>${index + 1}</b>${label}
        </span>`).join('')}</div>
    </div>
    <main>${loginRequired ? loginRequiredView() : loading ? loadingView() : views[step]()}</main>`;
  bindEvents();
}

const views: Record<number, () => string> = {
  1: landingView,
  2: sourcesView,
  3: reportView,
};

function landingView(): string {
  const current = selectedInterestDomain();
  const tags = current?.tags || [];
  return `
    <section class="view">
      <div class="simple-head">
        <h1>Simple attention portfolio</h1>
        <p class="lead">选择兴趣领域和子方向，生成 Core / Radar 推荐列表。</p>
      </div>
      ${error ? `<p class="err" style="text-align:center">${escapeHtml(error)}</p>` : ''}
      ${simpleInterestLoading ? '<p class="muted" style="text-align:center">正在获取领域数据...</p>' : ''}
      <h3>兴趣领域</h3>
      <div class="grid simple-domains">${simpleInterests.map(domainCard).join('')}</div>
      ${current ? `
        <div class="simple-section">
          <h3>子方向</h3>
          <p class="tiny" style="margin-top:6px">可多选；不选时默认覆盖该领域全部方向。</p>
          <div class="grid simple-tags">${tags.map(tagCard).join('')}</div>
        </div>
        <div class="summary">
          <span class="tiny">将获取</span>
          <p style="margin-top:8px">${escapeHtml(current.name)} · ${escapeHtml(String(current.kolCount || 0))} 个候选 KOL</p>
          <div style="margin-top:8px">${selectedTagNames().map(tag).join('') || tag('全部子方向')}</div>
        </div>` : ''}
      <div class="row" style="justify-content:center;margin-top:26px">
        <button class="primary" id="start" ${current ? '' : 'disabled'}>生成组合</button>
      </div>
    </section>`;
}

function domainCard(domain: InterestDomain): string {
  const selected = simpleSelectedDomain === domain.domain;
  return `
    <button class="card select ${selected ? 'on' : ''}" data-domain="${escapeAttr(domain.domain)}">
      <h3>${escapeHtml(domain.name)}</h3>
      <p class="muted" style="margin-top:10px">${escapeHtml(domain.description)}</p>
      <p class="tiny" style="margin-top:12px">${escapeHtml(String(domain.kolCount || 0))} 个候选 KOL</p>
    </button>`;
}

function tagCard(item: InterestTag): string {
  const selected = simpleSelectedTags.includes(item.key);
  return `
    <button class="card select ${selected ? 'on' : ''}" data-tag-key="${escapeAttr(item.key)}">
      <h3>${escapeHtml(item.name)}</h3>
      <p class="muted" style="margin-top:8px">${escapeHtml(item.description)}</p>
    </button>`;
}

function loadingView(): string {
  const progress = clampNumber(loadingState.progress, 4, 100);
  return `
    <section class="view hero loading-panel">
      <div class="loader" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>${escapeHtml(loadingState.title)}</h2>
      <p class="lead">${escapeHtml(loadingState.message)}</p>
      <div class="loading-meter"><i style="width:${progress}%"></i></div>
      <p class="tiny loading-percent">${progress}%</p>
      <div class="loading-steps">${loadingState.steps.map(item => `<p class="loading-step ${item.status}"><span></span>${escapeHtml(item.label)}</p>`).join('')}</div>
    </section>`;
}

function loginRequiredView(): string {
  return `
    <section class="view hero">
      <h2>需要登录 X.com</h2>
      <p class="lead">${escapeHtml(loginMessage || '需要登录后才能获取可复用列表。请在浏览器中登录 X.com，完成后回到这里继续。')}</p>
      <div class="row" style="justify-content:center">
        <button class="primary" id="continueAfterLogin">我已登录，继续</button>
        <button class="ghost" id="openX">打开 X.com</button>
      </div>
      ${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
    </section>`;
}

function sourcesView(): string {
  const visibleSources = model.sources.filter(source =>
    source.state !== 'ignore'
    && (filters.type === '全部' || source.type === filters.type)
  );
  const hasNewSources = model.sources.some(source => source.state === 'new');
  return `
    <section class="view">
      ${nav('返回', '下一步，开始建立关注列表')}
      ${error ? `<p class="err" style="text-align:center">${escapeHtml(error)}</p>` : ''}
      <div class="health">${healthCards(health())}</div>
      <div class="card" style="margin-bottom:18px">
        <h3>X.com 列表选择</h3>
        <p class="tiny" style="margin-top:8px">可以复用已有列表；复用时会自动避开列表里已经存在的账号。</p>
        <div class="grid cols" style="margin-top:14px">${listKeys.map(listPlanCard).join('')}</div>
      </div>
      <div class="grid sources">
        <aside class="card side">${filtersView()}</aside>
        <section class="grid">
          <div class="row" style="justify-content:space-between">
            <h3>推荐来源 (${visibleSources.length})</h3>
            <button class="primary" id="addAll" ${hasNewSources ? '' : 'disabled'}>${hasNewSources ? '关注全部' : '已全部关注'}</button>
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
        ${ownedLists.length ? existingOptions : '<option>没有可复用列表</option>'}
      </select>
      <label class="choice" style="margin-top:10px"><input type="radio" name="list-${key}" data-list-mode="${key}:create" ${plan.mode === 'create' ? 'checked' : ''}> 创建新列表</label>
      <p class="tiny" style="margin-top:8px">${plan.mode === 'reuse' ? '将避开该列表里已有账号' : `将创建：${escapeHtml(plan.name)}`}</p>
    </div>`;
}

function reportView(): string {
  const stats = health();
  const total = Math.round((stats.focus + stats.diversity + quality() + novelty()) / 4);
  const summary = total >= 80
    ? '整体较健康，既能保持聚焦，也有多元视角。'
    : total >= 60
      ? '基础不错，建议继续补充 Radar 来源。'
      : '需要增加 Radar 来源并压缩重复内容。';
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

function nav(back: string, next: string, disabled = false, id = 'next'): string {
  return `
    <div class="nav">
      <button class="ghost" id="back">${back}</button>
      <button class="primary" id="${id}" ${disabled ? 'disabled' : ''}>${next} →</button>
    </div>`;
}

function bindEvents() {
  $('#start')?.addEventListener('click', start);
  $('#continueAfterLogin')?.addEventListener('click', continueAfterLogin);
  $('#openX')?.addEventListener('click', () => window.open('https://x.com/home', '_blank', 'noopener'));
  $$('[data-domain]').forEach(button => button.addEventListener('click', () => selectDomain(button.dataset.domain!)));
  $$('[data-tag-key]').forEach(button => button.addEventListener('click', () => toggleTag(button.dataset.tagKey!)));
  $('#back')?.addEventListener('click', () => { step = Math.max(1, step - 1); render(); });
  $('#next')?.addEventListener('click', () => { step = Math.min(3, step + 1); render(); });
  $('#xgo')?.addEventListener('click', handleAddToLists);
  $$('[data-list-mode]').forEach(input => input.addEventListener('change', () => void updateListPlanMode((input as HTMLInputElement).dataset.listMode!)));
  $$('[data-list-select]').forEach(select => select.addEventListener('change', () => void updateListPlanSelection((select as HTMLSelectElement).dataset.listSelect!, (select as HTMLSelectElement).value)));
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { filters.type = button.dataset.filter!; render(); }));
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

async function loadInterests() {
  simpleInterestLoading = true;
  error = '';
  render();
  try {
    const response = await fetch(interestUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json() as InterestIndex;
    simpleInterests = Array.isArray(data.interests) ? data.interests : [];
    if (!simpleInterests.length) throw new Error('没有可选领域');
  } catch (err) {
    error = `获取领域失败：${(err as Error).message || err}`;
  } finally {
    simpleInterestLoading = false;
    render();
  }
}

function selectedInterestDomain(): InterestDomain | undefined {
  return simpleInterests.find(domain => domain.domain === simpleSelectedDomain);
}

function selectedTagNames(): string[] {
  const current = selectedInterestDomain();
  if (!current) return [];
  return simpleSelectedTags.map(key => current.tags.find(item => item.key === key)?.name || key).filter(Boolean);
}

function selectDomain(domain: string) {
  simpleSelectedDomain = domain;
  simpleSelectedTags = [];
  simpleKolData = null;
  error = '';
  render();
}

function toggleTag(key: string) {
  simpleSelectedTags = simpleSelectedTags.includes(key)
    ? simpleSelectedTags.filter(item => item !== key)
    : [...simpleSelectedTags, key];
  simpleKolData = null;
  render();
}

async function start() {
  const domain = selectedInterestDomain();
  if (!domain) {
    error = '请先选择一个兴趣领域';
    render();
    return;
  }

  interest = domain.name;
  error = '';
  loginRequired = false;
  loginMessage = '';
  startLoading('生成组合', `即将为 ${domain.name} 获取推荐数据，并生成 Core / Radar 组合...`, [
    '准备生成组合',
    '获取领域推荐数据',
    '按子方向筛选',
    '获取可复用列表',
    '生成 Core / Radar 列表',
  ]);

  try {
    updateLoading('准备生成组合，请稍候几秒...', 8, 0);
    await sleep(3000);
    updateLoading(`正在获取 ${domain.name} 推荐数据...`, 28, 1);
    simpleKolData = await fetchKolData(domain);
    updateLoading('正在按所选子方向筛选候选账号...', 58, 2);
    model = normalizeModel(buildModel(simpleKolData));
    allRecommendedSources = model.sources.map(source => ({ ...source, state: 'new' }));
    picked = emptyPicked();
    filters = { type: '全部', stance: '', lang: '' };
    ownedLists = [];
    listPlans = emptyListPlans();
    updateLoading('正在获取可复用的 X.com 列表...', 72, 3);
    await prepareListPlans();
    await finishRecommendationSetup(false);
  } catch (err) {
    if (isLoginRequiredError(err)) {
      pauseForLogin((err as Error).message);
    } else {
      error = `生成组合失败：${(err as Error).message || err}`;
      step = 1;
    }
  } finally {
    stopLoading();
    render();
  }
}

async function continueAfterLogin() {
  loginRequired = false;
  error = '';
  startLoading('继续生成组合', '正在重新获取可复用列表...', [
    '获取可复用列表',
    '移除重复账号',
    '进入推荐列表',
  ]);

  try {
    updateLoading('正在获取可复用的 X.com 列表...', 32, 0);
    await prepareListPlans();
    await finishRecommendationSetup(false);
  } catch (err) {
    if (isLoginRequiredError(err)) {
      pauseForLogin((err as Error).message);
    } else {
      error = `继续失败：${(err as Error).message || err}`;
      step = 1;
    }
  } finally {
    stopLoading();
    render();
  }
}

async function finishRecommendationSetup(showDuplicateLoading: boolean) {
  updateLoading('正在根据可复用列表移除重复账号...', 84, 1);
  await applyDuplicateFilterForSelectedLists(showDuplicateLoading);
  model.sources.forEach(addSource);
  await saveInterestField(agent, interest, model, selectedTagNames());
  await saveKols(agent, interest, model.sources);
  updateLoading('推荐列表已建立，正在进入确认页...', 92, 2);
  step = 2;
}

function pauseForLogin(message: string) {
  loginRequired = true;
  loginMessage = message || '需要登录后才能获取可复用列表。请先登录 X.com，再回来继续。';
  error = '';
}

async function fetchKolData(domain: InterestDomain): Promise<KolExport> {
  const response = await fetch(`${exportBaseUrl}/${domain.kolFile}`);
  if (!response.ok) throw new Error(`推荐数据获取失败：${response.status} ${response.statusText}`);
  const data = await response.json() as KolExport;
  if (!Array.isArray(data.kols)) throw new Error('推荐数据格式不正确');
  return data;
}

async function prepareListPlans() {
  const response = await callWithLimit(() => apis.twitter_lists(twitterListFetchLimit));
  if (hasApiError(response)) {
    ownedLists = [];
    listPlans = emptyListPlans();
    throw loginRequiredError(response);
  }
  ownedLists = extractTwitterLists(response).filter(list => list.type === 'suggest_owned_subscribed_list');
  listPlans = buildListPlans(ownedLists);
}

function hasApiError(response: ExecutionResult): boolean {
  if (response.success === false || response.error) return true;
  const extractData = response.task?.extract_data;
  if (!extractData) return false;
  if (typeof extractData === 'string') {
    return /error|failed|失败|错误|exception|not logged|cookie/i.test(extractData);
  }
  if (Array.isArray(extractData)) {
    return (extractData as Array<{ error?: string; success?: boolean }>).some(item => {
      if (!item || typeof item !== 'object') return false;
      return Boolean(item.error || item.success === false);
    });
  }
  if (typeof extractData === 'object') {
    const data = extractData as { error?: string; success?: boolean };
    return Boolean(data.error || data.success === false);
  }
  return false;
}

function loginRequiredError(response: ExecutionResult): Error {
  const detail = response.error || String(response.task?.extract_data || '');
  const message = /login|登录|auth|unauthor|cookie|session/i.test(detail)
    ? '需要登录后才能获取可复用列表。请先登录 X.com，再回来继续。'
    : '暂时无法获取可复用列表。请确认 X.com 已登录后再继续。';
  const error = new Error(message);
  error.name = 'LoginRequiredError';
  return error;
}

function isLoginRequiredError(error: unknown): boolean {
  return error instanceof Error && error.name === 'LoginRequiredError';
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

function normalizeListName(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

async function updateListPlanMode(value: string) {
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
  await applyDuplicateFilterForSelectedLists();
}

async function updateListPlanSelection(key: string, listId: string) {
  const plan = listPlans[key as ListKey];
  const list = ownedLists.find(item => item.id === listId);
  if (!plan || !list) return;
  plan.mode = 'reuse';
  plan.listId = list.id;
  plan.name = list.name;
  plan.created = false;
  await applyDuplicateFilterForSelectedLists();
}

async function applyDuplicateFilterForSelectedLists(showLoading = true) {
  if (showLoading) {
    startLoading('更新推荐列表', '正在检查复用列表中的已有账号...', [
      '读取已有成员',
      '移除重复账号',
      '更新推荐组合',
    ]);
  }

  try {
    const excludedByKey = await readExistingHandlesByListKey();
    model.sources = allRecommendedSources
      .filter(source => {
        const key = source.type.toLowerCase() as ListKey;
        const username = cleanHandle(source.handle || source.name).toLowerCase();
        return !username || !excludedByKey[key]?.has(username);
      })
      .map(source => ({ ...source, state: 'new' }));
    picked = emptyPicked();
    model.sources.forEach(addSource);
    await saveLists(agent, interest, Object.values(listPlans));
  } catch (err) {
    error = `检查复用列表失败：${(err as Error).message || err}`;
  } finally {
    if (showLoading) stopLoading();
    render();
  }
}

async function readExistingHandlesByListKey(): Promise<Record<ListKey, Set<string>>> {
  const result: Record<ListKey, Set<string>> = { core: new Set(), radar: new Set() };
  for (const key of listKeys) {
    const plan = listPlans[key];
    if (plan?.mode !== 'reuse' || !plan.listId) continue;
    const response = await callWithLimit(() => apis.twitter_list_members(plan.listId, duplicateCheckMembersLimit));
    const handles = extractTwitterUserCandidates(response, `existing_list:${plan.name}`)
      .map(candidate => cleanHandle(candidate.handle || candidate.username || candidate.name || '').toLowerCase())
      .filter(Boolean);
    result[key] = new Set(handles);
  }
  return result;
}

function buildModel(data: KolExport): PortfolioModel {
  const chosenTags = simpleSelectedTags.length ? simpleSelectedTags : data.tags.map(item => item.key);
  const tagSet = new Set(chosenTags);
  const tagNames = selectedTagNames();
  const relevantKols = data.kols
    .filter(kol => (kol.tags || []).some(key => tagSet.has(key)))
    .sort((a, b) => (b.influenceScore || 0) - (a.influenceScore || 0) || (b.followers || 0) - (a.followers || 0));
  const core = pickCoreKols(relevantKols, tagSet, maxSimpleListSize);
  const radar = pickRadarKols(relevantKols, chosenTags, core, maxSimpleListSize);
  const topicText = tagNames.length ? tagNames.join('、') : data.name;
  return {
    goals: data.tags.map(item => ({
      id: item.key,
      title: item.name,
      titleEn: item.key,
      description: item.description,
      tags: [data.name],
      icon: '◎',
    })),
    distribution: [
      { label: 'Core', value: 70 },
      { label: 'Radar', value: 30 },
    ],
    layers: [
      {
        key: 'core',
        name: 'Core',
        nameCn: '核心关注',
        description: `高影响力、高相关度账号，用于稳定覆盖 ${topicText} 的主线信息。`,
        tags: tagNames,
        suggested: core.length,
      },
      {
        key: 'radar',
        name: 'Radar',
        nameCn: '雷达观察',
        description: `补充相邻议题、项目和趋势观察，帮助发现 ${topicText} 的新信号。`,
        tags: tagNames,
        suggested: radar.length,
      },
    ],
    sources: [
      ...core.map((kol, index) => kolToSource(kol, 'Core', index)),
      ...radar.map((kol, index) => kolToSource(kol, 'Radar', index)),
    ],
    searchQueries: [data.domain, ...chosenTags],
  };
}

function pickCoreKols(kols: KolRecord[], tagSet: Set<string>, limit: number): KolRecord[] {
  return kols
    .map(kol => ({
      kol,
      score: directionScore(kol, tagSet) * 4
        + (kol.influenceScore || 0)
        + Math.log10((kol.followers || 0) + 10)
        + (kol.verified ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.kol);
}

function pickRadarKols(kols: KolRecord[], chosenTags: string[], core: KolRecord[], limit: number): KolRecord[] {
  const coreHandles = new Set(core.map(kolKey));
  const candidates = kols.filter(kol => !coreHandles.has(kolKey(kol)));
  const selected: KolRecord[] = [];
  const seen = new Set<string>();
  const perTagLimit = Math.max(2, Math.ceil(limit / Math.max(1, chosenTags.length)));

  for (const tagKey of shuffle(chosenTags)) {
    const tagPool = candidates
      .filter(kol => (kol.tags || []).includes(tagKey) && !seen.has(kolKey(kol)))
      .map(kol => ({
        kol,
        score: (kol.listCount || 0) * 3
          + (kol.influenceScore || 0) * 0.65
          + Math.log10((kol.followers || 0) + 10)
          + Math.random() * 12,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perTagLimit);

    for (const item of tagPool) {
      if (selected.length >= limit) break;
      const key = kolKey(item.kol);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(item.kol);
    }
  }

  if (selected.length < limit) {
    const fillPool = shuffle(candidates)
      .filter(kol => !seen.has(kolKey(kol)))
      .sort((a, b) => radarScore(b) - radarScore(a));
    for (const kol of fillPool) {
      if (selected.length >= limit) break;
      seen.add(kolKey(kol));
      selected.push(kol);
    }
  }

  return selected;
}

function directionScore(kol: KolRecord, tagSet: Set<string>): number {
  return (kol.tags || []).filter(key => tagSet.has(key)).length;
}

function radarScore(kol: KolRecord): number {
  return (kol.listCount || 0) * 3 + (kol.influenceScore || 0) * 0.65 + Math.log10((kol.followers || 0) + 10);
}

function kolKey(kol: KolRecord): string {
  return cleanHandle(kol.handle || kol.username || kol.name || '').toLowerCase();
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function kolToSource(kol: KolRecord, type: 'Core' | 'Radar', index: number): Source {
  const score = clampNumber(kol.influenceScore || 70, 0, 100);
  const followers = typeof kol.followers === 'number' ? `${kol.followers.toLocaleString()} followers` : 'followers unknown';
  const matchedTags = (kol.tags || []).map(key => simpleKolData?.tags.find(item => item.key === key)?.name || key);
  return {
    id: `${type.toLowerCase()}-${cleanHandle(kol.handle || kol.username || kol.name || String(index))}`,
    name: kol.name || kol.username || 'Unknown source',
    handle: kol.handle || (kol.username ? `@${kol.username}` : ''),
    type,
    role: kol.verified ? 'Verified KOL' : 'KOL',
    content: matchedTags.slice(0, 3).join(' / '),
    stance: type === 'Core' ? '主线' : '观察',
    lang: 'EN',
    focus: type === 'Core' ? Math.max(78, score) : Math.max(62, score - 6),
    diversity: type === 'Radar' ? Math.max(72, score) : 55,
    reason: `${followers} · influence ${score}. Matched ${matchedTags.slice(0, 3).join(', ') || 'domain'}. ${kol.bio || ''}`.trim(),
    candidateSource: '',
  };
}

function normalizeModel(value: PortfolioModel): NormalizedModel {
  return {
    goals: value.goals.slice(0, 12),
    distribution: value.distribution,
    layers: value.layers,
    sources: value.sources.map(normalizeSource),
    searchQueries: value.searchQueries || [],
  };
}

function normalizeSource(source: Source, index: number): NormalizedSource {
  const type = source.type === 'Core' ? 'Core' : 'Radar';
  return {
    id: String(source.id || `source-${index}`),
    name: String(source.name || 'Unknown source'),
    handle: String(source.handle || ''),
    avatar: String(source.avatar || initials(source.name || 'S')).slice(0, 3),
    type,
    role: String(source.role || ''),
    content: String(source.content || ''),
    stance: String(source.stance || ''),
    lang: String(source.lang || ''),
    focus: clampNumber(source.focus, 0, 100),
    diversity: clampNumber(source.diversity, 0, 100),
    reason: String(source.reason || ''),
    candidateSource: String(source.candidateSource || ''),
    state: 'new',
  };
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
    ${['全部', ...unique(model.sources.map(source => source.type))].map(value => filterButton(value, filters.type === value)).join('')}
    <button class="ghost" id="clear" style="margin-top:16px">清除筛选</button>`;
}

function filterButton(value: string, active: boolean): string {
  return `<button class="filter chip ${active ? 'on' : ''}" data-filter="${escapeAttr(value)}">${escapeHtml(value)}</button>`;
}

function sourceCard(source: NormalizedSource): string {
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
        <div><h3>${escapeHtml(source.name)}</h3><p class="tiny">${escapeHtml(source.handle)}</p></div>
        <span class="badge ${escapeAttr(source.type.toLowerCase())}">${escapeHtml(source.type)}</span>
      </div>
      <p class="muted">${escapeHtml(source.reason)}</p>
      <p>${[source.role, source.content, source.stance, source.lang].filter(Boolean).map(tag).join('')}</p>
      ${actions}
    </article>`;
}

function listBlock(key: string): string {
  const items = picked[key] || [];
  const layer = model.layers.find(item => item.key === key);
  const required = layer?.suggested || '动态';
  const body = items.length
    ? items.map((source, index) => `
      <p class="row" style="justify-content:space-between;margin-top:8px">
        <span><span class="avatar" style="width:24px;height:24px;display:inline-grid;margin-right:8px;font-size:11px">${escapeHtml(source.avatar || initials(source.name || 'S'))}</span>${escapeHtml(source.name || '')}</span>
        <button class="mini" data-remove="${key}:${index}">移除</button>
      </p>`).join('')
    : '<p class="tiny" style="margin-top:8px">尚未添加</p>';
  return `
    <div style="margin-top:16px">
      <p><b>${escapeHtml(layer?.name || capitalize(key))}</b> <span class="tiny">${items.length}/${required}</span></p>
      ${body}
    </div>`;
}

function finalList(key: string): string {
  const items = picked[key] || [];
  const layer = model.layers.find(item => item.key === key);
  const body = items.length
    ? items.map(source => `<p class="muted" style="margin-top:9px">${escapeHtml(source.avatar || initials(source.name || 'S'))} · ${escapeHtml(source.name || '')}</p>`).join('')
    : '<p class="tiny" style="margin-top:12px">尚未添加来源</p>';
  return `<div class="card"><h3>${escapeHtml(layer?.name || capitalize(key))} (${items.length})</h3>${body}</div>`;
}

function analysisCard(title: string, items: string[]): string {
  return `<div class="card"><h3>${title}</h3><ul>${items.map(item => `<li class="muted">${escapeHtml(item)}</li>`).join('')}</ul></div>`;
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

async function handleAddToLists() {
  if (listKeys.some(key => picked[key].length && !listPlans[key]?.listId)) {
    const ready = await ensurePortfolioLists();
    if (!ready) return;
  }
  await autoCreate();
}

async function ensurePortfolioLists(): Promise<boolean> {
  error = '';
  startLoading('准备 X.com 列表', '正在自动创建 Core / Radar 列表...', [
    '确认列表',
    '创建缺失列表',
    '保存 list_id',
  ]);

  try {
    for (const [index, key] of listKeys.entries()) {
      const plan = listPlans[key] || defaultListPlan(key);
      if (!picked[key].length || plan.listId) continue;
      updateLoading(`正在创建 ${plan.name}...`, 35 + index * 24, 1);
      const response = await callWithLimit(() => apis.twitter_list_create(plan.name, plan.description, true));
      const listId = extractListId(response);
      if (!listId) throw new Error(`${plan.name} 创建后没有返回 list_id`);
      listPlans[key] = { ...plan, listId, created: true };
    }
    updateLoading('X.com 列表已准备完成...', 92, 2);
    await saveLists(agent, interest, Object.values(listPlans));
    return true;
  } catch (err) {
    error = `准备 X.com 列表失败：${(err as Error).message || err}`;
    return false;
  } finally {
    stopLoading();
    render();
  }
}

async function autoCreate() {
  const allSources = listKeys.flatMap(key => picked[key]);
  app.insertAdjacentHTML('beforeend', `
    <div class="modal">
      <section class="card view modal-panel">
        <h2>添加账号到 X.com 列表</h2>
        <p class="lead" style="text-align:center">这里会跳过目标列表中已经存在的账号。</p>
        <div class="meter"><i id="autoBar"></i></div>
        <div class="log" id="logs"></div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="primary" id="openLists">查看 X.com 列表</button>
          <button class="ghost" id="closeAuto">返回报告</button>
        </div>
      </section>
    </div>`);

  $('#closeAuto')?.addEventListener('click', () => $('.modal')?.remove());
  $('#openLists')?.addEventListener('click', openPreparedLists);

  const logs = $('#logs');
  const bar = $('#autoBar') as HTMLElement | null;
  const totalSteps = Math.max(1, allSources.length + 1);
  let done = 0;
  const log = (message: string, status = 'ok') => {
    logs?.insertAdjacentHTML('beforeend', `<p class="${status}">${escapeHtml(message)}</p>`);
    if (logs) logs.scrollTop = 9999;
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
    log('准备添加账号：将先检查目标列表中已有成员，再逐个提交添加请求');
    log('即将开始连接 X.com，请稍候几秒...');
    if (bar) bar.style.width = '6%';
    await sleep(3000);
    log('开始检查目标列表已有成员');
    const existingHandlesByList = await readExistingHandlesByTargetList(log);
    advance();
    for (const source of allSources) {
      const key = source.type?.toLowerCase() as ListKey;
      const listId = listPlans[key]?.listId || '';
      const username = cleanHandle(source.handle || source.name || '');
      if (!listId || !username) {
        log(`跳过 ${source.handle || source.name}：缺少 list_id 或用户名`, 'warn');
        advance();
        continue;
      }

      const existingHandles = existingHandlesByList.get(listId) || new Set<string>();
      const normalizedUsername = username.toLowerCase();
      if (existingHandles.has(normalizedUsername)) {
        log(`跳过 @${username}：已在 ${source.type} List 中`, 'warn');
        advance();
        continue;
      }

      const waitMs = randomBetween(addAccountDelayMinMs, addAccountDelayMaxMs);
      log(`等待 ${Math.round(waitMs / 1000)} 秒后添加 @${username}`);
      await sleep(waitMs);
      log(`添加 @${username} 到 ${source.type} List`);
      await callWithLimit(() => apis.twitter_list_add(listId, username));
      existingHandles.add(normalizedUsername);
      existingHandlesByList.set(listId, existingHandles);
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

async function readExistingHandlesByTargetList(log: (message: string, status?: string) => void): Promise<Map<string, Set<string>>> {
  const byList = new Map<string, Set<string>>();
  const targets = unique(listKeys
    .filter(key => picked[key].length)
    .map(key => listPlans[key]?.listId)
    .filter(Boolean));

  for (const listId of targets) {
    const plan = Object.values(listPlans).find(item => item.listId === listId);
    log(`检查 ${plan?.name || listId} 已有成员，避免重复添加`);
    const response = await callWithLimit(() => apis.twitter_list_members(listId, duplicateCheckMembersLimit));
    const handles = extractTwitterUserCandidates(response, `existing_list:${plan?.name || listId}`)
      .map(candidate => cleanHandle(candidate.handle || candidate.username || candidate.name || '').toLowerCase())
      .filter(Boolean);
    byList.set(listId, new Set(handles));
    log(`已读取 ${plan?.name || listId} 的 ${handles.length} 个已有成员`);
  }
  return byList;
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

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function listNameForKey(key: ListKey): string {
  return `${interest || 'Attention'} - ${capitalize(key)}`;
}

function health(): HealthStats {
  const core = picked.core.length;
  const radar = picked.radar.length;
  const total = core + radar;
  const selectedTags = unique(listKeys
    .flatMap(key => picked[key])
    .flatMap(source => String(source.content || '').split('/').map(item => item.trim()))
    .filter(Boolean));
  const expectedTags = selectedTagNames().length || selectedInterestDomain()?.tags.length || 1;
  const coverageRatio = Math.min(1, selectedTags.length / Math.max(1, expectedTags));
  const balanceRatio = total ? Math.min(core, radar) / Math.max(core, radar || 1) : 0;
  const duplicateRisk = total > 36 ? '高' : total > 28 ? '中' : '低';

  return {
    focus: clampNumber(58 + Math.min(core, 14) * 2.1 + balanceRatio * 8 - Math.max(0, radar - core) * 0.6, 35, 92),
    diversity: clampNumber(42 + Math.min(radar, 14) * 1.8 + coverageRatio * 18 + balanceRatio * 8, 30, 90),
    redundancy: duplicateRisk,
    cocoon: coverageRatio < 0.45 || radar < 4 ? '高' : coverageRatio < 0.75 || radar < 8 ? '中' : '低',
  };
}

function quality(): number {
  const selected = listKeys.flatMap(key => picked[key]);
  if (!selected.length) return 50;
  const average = selected.reduce((sum, source) => sum + (source.focus || 0), 0) / selected.length;
  return clampNumber(average * 0.82 + 10, 35, 90);
}

function novelty(): number {
  const radarTags = unique(picked.radar
    .flatMap(source => String(source.content || '').split('/').map(item => item.trim()))
    .filter(Boolean));
  return clampNumber(42 + Math.min(picked.radar.length, 14) * 1.9 + radarTags.length * 3.5, 30, 88);
}

function advantages(): string[] {
  const items: string[] = [];
  if (picked.core.length > 2) items.push('Core List 已有稳定高质量来源');
  if (picked.radar.length > 2) items.push('Radar List 可帮助发现新趋势');
  return items.length ? items : ['尚未添加来源，建议先关注推荐列表'];
}

function risks(): string[] {
  const items: string[] = [];
  if (picked.radar.length < 3) items.push('Radar 观察来源偏少');
  if (!picked.radar.length) items.push('缺少新趋势观察');
  return items;
}

function tips(): string[] {
  const items: string[] = [];
  if (picked.core.length < 6) items.push(`增加 ${6 - picked.core.length} 个核心关注来源`);
  if (picked.radar.length < 6) items.push(`增加 ${6 - picked.radar.length} 个 Radar 观察来源`);
  if (picked.radar.length) items.push('每 30 天复查 Radar List');
  return items;
}

function tag(value: string): string {
  return `<span class="pill">${escapeHtml(value)}</span>`;
}

render();
void loadInterests();
