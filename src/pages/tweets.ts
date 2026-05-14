import { Agent } from '@greaseclaw/workflow-sdk';
import {
  escapeAttr,
  escapeHtml,
  getSavedTweets,
  unique,
  type SavedTweet,
} from '../shared';

const app = document.querySelector('#app') as HTMLElement;
const agent = new Agent(window.agentOptions || {});

declare global {
  interface Window {
    agentOptions?: Record<string, unknown>;
  }
}

let tweets: SavedTweet[] = [];
let loading = true;
let error = '';
let query = '';
let listFilter = '全部';

loadTweets();

async function loadTweets() {
  loading = true;
  error = '';
  render();
  try {
    tweets = await getSavedTweets(agent, 500);
  } catch (err) {
    error = `读取已保存 Tweet 失败：${(err as Error).message || err}`;
  } finally {
    loading = false;
    render();
  }
}

function render() {
  const lists = ['全部', ...unique(tweets.flatMap(tweet => tweet.listNames || []))];
  const visible = tweets.filter(tweet => {
    const haystack = [
      tweet.author,
      tweet.text,
      tweet.url,
      ...(tweet.listNames || []),
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query.toLowerCase()))
      && (listFilter === '全部' || (tweet.listNames || []).includes(listFilter));
  });

  app.innerHTML = `
    <div class="top">
      <div class="steps">
        <span class="on now"><b>1</b>保存的 List Tweets</span>
        <span class="on"><b>${tweets.length}</b>已保存</span>
        <span class="on"><b>${visible.length}</b>当前显示</span>
      </div>
    </div>
    <main>
      <section class="view">
        <div class="nav">
          <a class="ghost" href="./index.html">返回组合</a>
          <button class="primary" id="refresh">刷新</button>
        </div>
        <h2>保存的 X.com List Tweets</h2>
        ${error ? `<p class="err" style="text-align:center">${escapeHtml(error)}</p>` : ''}
        <div class="card" style="margin-top:24px">
          <div class="row">
            <input class="input" id="query" placeholder="搜索作者、正文或列表名" value="${escapeAttr(query)}">
            <select class="input" id="listFilter">
              ${lists.map(list => `<option value="${escapeAttr(list)}" ${list === listFilter ? 'selected' : ''}>${escapeHtml(list)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${loading ? loadingView() : tweetListView(visible)}
      </section>
    </main>`;

  document.querySelector('#refresh')?.addEventListener('click', loadTweets);
  document.querySelector('#query')?.addEventListener('input', event => {
    query = (event.target as HTMLInputElement).value;
    render();
  });
  document.querySelector('#listFilter')?.addEventListener('change', event => {
    listFilter = (event.target as HTMLSelectElement).value;
    render();
  });
}

function loadingView(): string {
  return `
    <section class="view hero loading-panel">
      <div class="loader" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="lead">正在读取本地数据库...</p>
      <div class="loading-meter"><i style="width:68%"></i></div>
    </section>`;
}

function tweetListView(items: SavedTweet[]): string {
  if (!items.length) {
    return `<div class="card" style="margin-top:18px;text-align:center"><p class="muted">暂无保存的 Tweet。先运行同步 List Tweets 的 workflow。</p></div>`;
  }
  return `<div class="grid" style="margin-top:18px">${items.map(tweetCard).join('')}</div>`;
}

function tweetCard(tweet: SavedTweet): string {
  const url = tweet.url || (tweet.id ? `https://x.com/i/status/${tweet.id}` : '');
  const listTags = (tweet.listNames || []).map(name => `<span class="pill">${escapeHtml(name)}</span>`).join('');
  const meta = [
    tweet.author ? `@${tweet.author.replace(/^@/, '')}` : '',
    tweet.createdAt ? new Date(tweet.createdAt).toLocaleString() : '',
    tweet.likes ? `${tweet.likes} likes` : '',
  ].filter(Boolean).join(' · ');

  return `
    <article class="card source">
      <div class="source-head">
        <span class="avatar">${escapeHtml((tweet.author || 'T').slice(0, 2).toUpperCase())}</span>
        <div>
          <h3>${escapeHtml(tweet.author || 'Unknown')}</h3>
          <p class="tiny">${escapeHtml(meta)}</p>
        </div>
        ${url ? `<a class="mini" href="${escapeAttr(url)}" target="_blank" rel="noopener">打开</a>` : ''}
      </div>
      <p class="muted">${escapeHtml(tweet.text || '')}</p>
      <p>${listTags}</p>
    </article>`;
}
