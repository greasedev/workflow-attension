const app = document.querySelector('#app');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const domains = ['AI Agent', 'Crypto', 'Indie Hacking', 'Robotics', 'Climate Tech', 'Longevity'];

const goals = [
  ['tech', '技术学习', 'Technical Learning', '学习技术实现、框架、代码和开源项目', 'Engineering,Open Source,Tutorials', '⚙'],
  ['product', '产品机会', 'Product Opportunities', '发现新产品、新工具和应用场景', 'Product,Tools,Use Cases', '◎'],
  ['startup', '创业与商业化', 'Startup & Business', '观察创业机会、商业模式和市场趋势', 'Startup,Market,GTM', '↗'],
  ['invest', '投资研究', 'Investment Research', '跟踪赛道趋势、公司动态和投资机会', 'VC,Trends,Companies', '▣'],
  ['enterprise', '企业应用', 'Enterprise Applications', '了解企业真实落地、ROI 和部署案例', 'Enterprise,Case Study,ROI', '▥'],
  ['balanced', '综合关注', 'Balanced Coverage', '保持全面了解，避免视角过窄', 'Balanced', '◌'],
];

const sources = [
  ['LangChain', '@LangChainAI', 'L', 'Core', 'Open Source Project', 'Framework,Tool Use', 'Optimistic', 'English', 92, 40, 'Agent 框架核心来源，适合长期跟踪。'],
  ['Anthropic Engineering', '@AnthropicAI', 'A', 'Core', 'Company Blog', 'Research,Safety', 'Balanced', 'English', 90, 55, '高质量工程与安全视角，补足实践深度。'],
  ['Simon Willison', '@simonw', 'S', 'Core', 'Developer', 'Tutorials,Analysis', 'Balanced', 'English', 88, 65, '实践型开发者视角，分析清醒且可执行。'],
  ['Hugging Face', '@huggingface', 'H', 'Core', 'Platform', 'Models,Tools', 'Optimistic', 'English', 90, 50, '开源模型和工具生态的中心节点。'],
  ['Karpathy', '@karpathy', 'K', 'Core', 'Researcher', 'Training,Insights', 'Balanced', 'English', 92, 55, '顶级技术解释和方向判断来源。'],
  ['Agent Reliability Notes', '@AgentReliability', 'R', 'Diversity', 'Critical Observer', 'Failure Cases,Reliability', 'Cautious', 'English', 75, 95, '补充失败案例和可靠性视角，降低过度乐观。'],
  ['AI Enterprise Deploy', '@AIEnterprise', 'E', 'Diversity', 'Newsletter', 'Enterprise,ROI', 'Pragmatic', 'English', 70, 88, '跟踪真实企业部署和 ROI。'],
  ['中国AI Agent观察', '@AIAgent_CN', 'CN', 'Diversity', 'Media', 'Regional,Startups', 'Balanced', 'Chinese', 75, 85, '提供中文市场和区域视角。'],
  ['AI Safety Newsletter', '@AISafetyNews', 'Sa', 'Diversity', 'Newsletter', 'Safety,Alignment', 'Cautious', 'English', 68, 90, '补充安全和风险判断。'],
  ['AutoGPT', '@AutoGPT', 'G', 'Radar', 'Open Source Project', 'Autonomous Agents', 'Optimistic', 'English', 85, 45, '早期自治 Agent 项目，适合观察社区变化。'],
  ['Composio', '@composio', 'Co', 'Radar', 'Startup', 'Tools,Integration', 'Optimistic', 'English', 82, 55, 'Agent 工具调用方向的新兴平台。'],
  ['Agent Startup Radar', '@AgentStartups', 'St', 'Radar', 'Newsletter', 'Startups,Funding', 'Optimistic', 'English', 72, 70, '发现早期项目和融资信号。'],
].map((source, id) => ({
  id,
  name: source[0],
  handle: source[1],
  avatar: source[2],
  type: source[3],
  role: source[4],
  content: source[5],
  stance: source[6],
  lang: source[7],
  focus: source[8],
  diversity: source[9],
  reason: source[10],
  state: 'new',
}));

const distribution = [
  ['技术深度', 35],
  ['产品工具', 25],
  ['开源项目', 15],
  ['商业化', 10],
  ['批判观点', 10],
  ['跨领域', 5],
];

let step = 1;
let interest = '';
let pickedGoals = [];
let picked = { core: [], diversity: [], radar: [] };
let filters = { type: '全部', stance: '', lang: '' };
let processing = false;
let targetStep = 0;

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
    <main>${processing ? processingView() : views[step]()}</main>`;
  bindEvents();
}

function processingView() {
  const messages = ['分析领域关键词', '优化组合结构', '匹配高质量来源', '计算健康度'];
  const message = messages[targetStep - 2] || '处理中';
  setTimeout(() => {
    processing = false;
    step = targetStep;
    render();
  }, 850);

  return `
    <section class="view hero">
      <h2>Agent 正在处理</h2>
      <p class="lead">${message}${interest ? `：${escapeHtml(interest)}` : ''}...</p>
      <div class="meter"><i style="width:100%"></i></div>
    </section>`;
}

const views = {
  1: landingView,
  2: goalsView,
  3: portfolioView,
  4: sourcesView,
  5: reportView,
};

function landingView() {
  return `
    <section class="view hero">
      <h1>Build a focused<br><span class="gold">attention portfolio</span></h1>
      <p class="lead">建立一个既聚焦、又不形成信息茧房的关注列表</p>
      <div class="row">
        <input class="input" id="interest" placeholder="输入感兴趣的领域，例如：AI Agent、Web3、量化交易" value="${escapeHtml(interest)}">
        <button class="primary" id="start">开始生成</button>
      </div>
      <p id="err" class="err"></p>
      <div class="tags" style="margin-top:18px">${domains.map(domain => `<button class="tag" data-domain="${domain}">${domain}</button>`).join('')}</div>
      <p class="tiny" style="margin-top:28px">We optimize for information balance, not popularity.</p>
    </section>`;
}

function goalsView() {
  return `
    <section class="view">
      ${nav('返回', '生成关注组合', pickedGoals.length === 0)}
      <h2>你关注「${escapeHtml(interest)}」的主要目的是什么？</h2>
      <p class="lead" style="text-align:center">最多选择 3 个目标，我们会据此调整信息源结构。</p>
      <div class="grid goals">${goals.map(goalCard).join('')}</div>
      ${pickedGoals.length ? goalSummary() : ''}
    </section>`;
}

function goalCard(goal) {
  const selected = pickedGoals.includes(goal[0]);
  return `
    <button class="card select ${selected ? 'on' : ''}" data-goal="${goal[0]}">
      <div class="icon">${goal[5]}</div>
      <h3>${goal[1]}</h3>
      <p class="tiny">${goal[2]}</p>
      <p class="muted" style="margin-top:10px">${goal[3]}</p>
      ${goal[4].split(',').map(tag).join('')}
    </button>`;
}

function goalSummary() {
  return `
    <div class="summary">
      <span class="tiny">当前目标</span>
      <div>${pickedGoals.map(id => tag(goals.find(goal => goal[0] === id)[1])).join('')}</div>
    </div>`;
}

function portfolioView() {
  const layers = [
    ['Core List', '核心关注', '长期关注的高质量信息源，帮助你保持领域聚焦。', '研究者,开源项目,工程师,技术博客', '20-30'],
    ['Diversity List', '多元视角', '补充反方、实践、区域和边缘视角，避免信息茧房。', '批判者,企业用户,安全研究,非英语来源', '10-15'],
    ['Radar List', '趋势雷达', '临时观察新项目和新趋势，30 天后复查是否值得长期关注。', '新工具,早期社区,新创业者,Benchmark', '15-30'],
  ];

  return `
    <section class="view">
      ${nav('返回', '查看推荐来源')}
      <h2>你的 ${escapeHtml(interest)} 关注组合建议</h2>
      <div class="layout">
        <div class="card">
          <h3>组合配比</h3>
          <div class="bars">${distribution.map(distributionRow).join('')}</div>
        </div>
        <div class="grid layers">${layers.map(layerCard).join('')}</div>
      </div>
    </section>`;
}

function distributionRow(item) {
  return `
    <div class="barrow">
      <span class="tiny">${item[0]}</span>
      <div class="meter"><i style="width:${item[1]}%"></i></div>
      <span class="gold">${item[1]}%</span>
    </div>`;
}

function layerCard(layer) {
  return `
    <div class="card">
      <h3>${layer[0]}</h3>
      <p class="tiny">${layer[1]}</p>
      <p class="muted" style="margin-top:12px">${layer[2]}</p>
      ${layer[3].split(',').map(tag).join('')}
      <p class="gold" style="margin-top:14px">建议数量：${layer[4]} 个</p>
    </div>`;
}

function sourcesView() {
  const visibleSources = sources.filter(source =>
    source.state !== 'ignore'
    && (filters.type === '全部' || source.type === filters.type)
    && (!filters.stance || cnStance(source.stance) === filters.stance)
    && (!filters.lang || cnLang(source.lang) === filters.lang)
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
          ${['core', 'diversity', 'radar'].map(listBlock).join('')}
        </aside>
      </div>
    </section>`;
}

function healthCards(stats) {
  return [
    ['聚焦度', stats.focus],
    ['多元度', stats.diversity],
    ['重复风险', stats.redundancy],
    ['信息茧房', stats.cocoon],
  ].map(item => `<div class="card"><p class="tiny">${item[0]}</p><div class="score">${item[1]}</div></div>`).join('');
}

function filtersView() {
  return `
    <h3>筛选器</h3>
    ${['全部', 'Core', 'Diversity', 'Radar'].map(value => filterButton('filter', value, filters.type === value)).join('')}
    <p class="tiny" style="margin-top:16px">观点倾向</p>
    ${['乐观', '中立', '谨慎'].map(value => filterButton('stance', value, filters.stance === value)).join('')}
    <p class="tiny" style="margin-top:16px">语言</p>
    ${['英文', '中文'].map(value => filterButton('lang', value, filters.lang === value)).join('')}
    <button class="ghost" id="clear" style="margin-top:16px">清除筛选</button>`;
}

function filterButton(kind, value, active) {
  const cls = kind === 'filter' ? 'filter chip' : 'chip';
  return `<button class="${cls} ${active ? 'on' : ''}" data-${kind}="${value}">${value}</button>`;
}

function sourceCard(source) {
  const type = source.type.toLowerCase();
  const metadata = [source.role, source.content, cnStance(source.stance), cnLang(source.lang)];
  const actions = source.state === 'add'
    ? `<p class="ok">✓ 已加入 ${source.type} List</p>`
    : `<div class="source-actions">
        <button class="primary" data-add="${source.id}">加入关注组合</button>
        <button class="ghost" data-ignore="${source.id}">暂时忽略</button>
      </div>`;

  return `
    <article class="card source">
      <div class="source-head">
        <span class="avatar">${source.avatar}</span>
        <div><h3>${source.name}</h3><p class="tiny">${source.handle}</p></div>
        <span class="badge ${type}">${source.type}</span>
      </div>
      <p class="muted">${source.reason}</p>
      <p>${metadata.map(tag).join('')}</p>
      ${actions}
    </article>`;
}

function listBlock(key) {
  const items = picked[key];
  const required = { core: 25, diversity: 12, radar: 20 }[key];
  const body = items.length
    ? items.map((source, index) => `
      <p class="row" style="justify-content:space-between;margin-top:8px">
        <span><span class="avatar" style="width:24px;height:24px;display:inline-grid;margin-right:8px;font-size:11px">${source.avatar}</span>${source.name}</span>
        <button class="mini" data-remove="${key}:${index}">移除</button>
      </p>`).join('')
    : '<p class="tiny" style="margin-top:8px">尚未添加</p>';

  return `
    <div style="margin-top:16px">
      <p><b>${capitalize(key)}</b> <span class="tiny">${items.length}/${required}</span></p>
      ${body}
    </div>`;
}

function reportView() {
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
      <div class="grid cols">${['core', 'diversity', 'radar'].map(finalList).join('')}</div>
    </section>`;
}

function analysisCard(title, items) {
  return `<div class="card"><h3>${title}</h3><ul>${items.map(item => `<li class="muted">${item}</li>`).join('')}</ul></div>`;
}

function finalList(key) {
  const items = picked[key];
  const body = items.length
    ? items.map(source => `<p class="muted" style="margin-top:9px">${source.avatar} · ${source.name}</p>`).join('')
    : '<p class="tiny" style="margin-top:12px">尚未添加来源</p>';

  return `<div class="card"><h3>${capitalize(key)} List (${items.length})</h3>${body}</div>`;
}

function nav(back, next, disabled = false, id = 'next') {
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

  $$('[data-domain]').forEach(button => button.addEventListener('click', () => {
    $('#interest').value = button.dataset.domain;
    interest = button.dataset.domain;
  }));

  $$('[data-goal]').forEach(button => button.addEventListener('click', () => toggleGoal(button.dataset.goal)));
  $('#back')?.addEventListener('click', () => { step = Math.max(1, step - 1); render(); });
  $('#next')?.addEventListener('click', () => go(step + 1));
  $('#xgo')?.addEventListener('click', autoCreate);

  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { filters.type = button.dataset.filter; render(); }));
  $$('[data-stance]').forEach(button => button.addEventListener('click', () => {
    filters.stance = filters.stance === button.dataset.stance ? '' : button.dataset.stance;
    render();
  }));
  $$('[data-lang]').forEach(button => button.addEventListener('click', () => {
    filters.lang = filters.lang === button.dataset.lang ? '' : button.dataset.lang;
    render();
  }));

  $('#clear')?.addEventListener('click', () => { filters = { type: '全部', stance: '', lang: '' }; render(); });
  $('#addAll')?.addEventListener('click', () => { sources.filter(source => source.state === 'new').forEach(addSource); render(); });
  $$('[data-add]').forEach(button => button.addEventListener('click', () => { addSource(sources[button.dataset.add]); render(); }));
  $$('[data-ignore]').forEach(button => button.addEventListener('click', () => { sources[button.dataset.ignore].state = 'ignore'; render(); }));
  $$('[data-remove]').forEach(button => button.addEventListener('click', () => removeSource(button.dataset.remove)));
}

function start() {
  const value = $('#interest').value.trim();
  if (!value) {
    $('#err').textContent = '请先输入一个感兴趣的领域';
    return;
  }
  interest = value;
  go(2);
}

function toggleGoal(id) {
  if (pickedGoals.includes(id)) {
    pickedGoals = pickedGoals.filter(goal => goal !== id);
  } else if (pickedGoals.length < 3) {
    pickedGoals.push(id);
  }
  render();
}

function go(nextStep) {
  targetStep = nextStep;
  processing = nextStep > 1 && nextStep < 5;
  if (!processing) step = nextStep;
  render();
}

function addSource(source) {
  const key = source.type.toLowerCase();
  if (!picked[key].some(item => item.id === source.id)) {
    picked[key].push(source);
    source.state = 'add';
  }
}

function removeSource(value) {
  const [key, index] = value.split(':');
  const source = picked[key].splice(index, 1)[0];
  if (source) source.state = 'new';
  render();
}

function autoCreate() {
  const allSources = [...picked.core, ...picked.diversity, ...picked.radar];
  app.insertAdjacentHTML('beforeend', `
    <div class="modal">
      <section class="card view modal-panel">
        <h2>AI 自动创建 X.com 列表</h2>
        <p class="lead" style="text-align:center">正在模拟创建 Core / Diversity / Radar 列表</p>
        <div class="meter"><i id="autoBar"></i></div>
        <div class="log" id="logs"></div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <a class="primary" href="https://x.com/i/lists" target="_blank">查看 X.com 列表</a>
          <button class="ghost" id="closeAuto">返回报告</button>
        </div>
      </section>
    </div>`);

  $('#closeAuto').addEventListener('click', () => $('.modal').remove());

  const logs = $('#logs');
  const bar = $('#autoBar');
  const tasks = [
    '连接 X.com API',
    '创建 Core List',
    '创建 Diversity List',
    '创建 Radar List',
    ...allSources.map(source => `添加 ${source.handle}`),
  ];

  let index = 0;
  function tick() {
    bar.style.width = `${Math.round(index / tasks.length * 100)}%`;
    if (index < tasks.length) {
      logs.insertAdjacentHTML('beforeend', `<p>✓ ${tasks[index++]}</p>`);
      logs.scrollTop = 9999;
      setTimeout(tick, 220);
    } else {
      bar.style.width = '100%';
    }
  }
  tick();
}

function health() {
  const core = picked.core.length;
  const diversity = picked.diversity.length;
  const total = core + diversity + picked.radar.length;
  return {
    focus: Math.min(100, 75 + core * 3 - diversity),
    diversity: Math.min(100, 50 + diversity * 7),
    redundancy: total > 22 ? '中' : '低',
    cocoon: diversity < 3 ? '高' : diversity < 5 ? '中' : '低',
  };
}

function quality() {
  return Math.min(100, 70 + (picked.core.length > 3 ? 12 : 0));
}

function novelty() {
  return Math.min(100, 50 + picked.radar.length * 8);
}

function advantages() {
  const items = [];
  if (picked.core.length > 2) items.push('Core List 已有稳定高质量来源');
  if (picked.diversity.length > 1) items.push('已开始补充多元视角');
  if (picked.radar.length > 1) items.push('Radar List 可帮助发现新趋势');
  return items.length ? items : ['尚未添加来源，建议先关注推荐列表'];
}

function risks() {
  const items = [];
  if (picked.diversity.length < 3) items.push('批判性观点和落地案例偏少');
  if (!picked.diversity.some(source => source.lang === 'Chinese')) items.push('非英语来源覆盖偏低');
  if (!picked.radar.length) items.push('缺少新趋势观察');
  return items;
}

function tips() {
  const items = [];
  if (picked.diversity.length < 5) items.push(`增加 ${5 - picked.diversity.length} 个多元视角来源`);
  if (picked.core.length < 6) items.push(`增加 ${6 - picked.core.length} 个核心关注来源`);
  if (picked.radar.length) items.push('每 30 天复查 Radar List');
  return items;
}

function cnStance(value) {
  return { Optimistic: '乐观', Balanced: '中立', Cautious: '谨慎', Pragmatic: '务实' }[value] || value;
}

function cnLang(value) {
  return value === 'English' ? '英文' : value === 'Chinese' ? '中文' : value;
}

function tag(value) {
  return `<span class="pill">${value}</span>`;
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

render();
