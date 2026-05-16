import { Agent } from '@greaseclaw/workflow-sdk';
import {
  escapeAttr,
  escapeHtml,
  getSavedTweets,
  unique,
  type SavedTweet,
  type TweetMedia,
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
      tweet.authorName,
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
  return `<div class="tweet-feed">${items.map(tweetCard).join('')}</div>`;
}

function tweetCard(tweet: SavedTweet): string {
  const url = tweet.url || (tweet.id ? `https://x.com/i/status/${tweet.id}` : '');
  const listTags = (tweet.listNames || []).slice(0, 2).map(name => `<span class="pill">${escapeHtml(name)}</span>`).join('');
  const authorHandle = tweet.author?.replace(/^@/, '') || '';
  const authorDisplay = tweet.authorName || authorHandle || 'Unknown';
  const authorUrl = authorHandle ? `https://x.com/${authorHandle}` : '';
  const verifiedBadge = tweet.authorVerified ? '<span class="verified" title="Verified">✓</span>' : '';
  const timeAgo = tweet.createdAt ? formatTimeAgo(tweet.createdAt) : '';
  const engagement = formatEngagement(tweet);
  const mediaHtml = formatMedia(tweet.media);
  const isRetweetBadge = tweet.isRetweet ? '<span class="pill retweet">RT</span>' : '';

  return `
    <article class="tweet-card">
      <div class="tweet-header">
        ${tweet.authorAvatar
          ? `<img class="tweet-avatar" src="${escapeAttr(tweet.authorAvatar)}" alt="${escapeAttr(authorDisplay)}" loading="lazy">`
          : `<span class="tweet-avatar-placeholder">${escapeHtml(authorDisplay.slice(0, 2).toUpperCase())}</span>`
        }
        <div class="tweet-author">
          <div class="tweet-author-name">
            ${escapeHtml(authorDisplay)}
            ${verifiedBadge}
          </div>
          <div class="tweet-author-handle">
            @${escapeHtml(authorHandle)}${timeAgo ? ` · ${timeAgo}` : ''}
          </div>
        </div>
        ${url ? `<a class="tweet-link" href="${escapeAttr(url)}" target="_blank" rel="noopener">→</a>` : ''}
      </div>
      <div class="tweet-content">
        ${isRetweetBadge}
        ${formatTweetText(tweet.text || '')}
      </div>
      ${mediaHtml}
      <div class="tweet-footer">
        <div class="tweet-engagement">${engagement}</div>
        ${listTags ? `<div class="tweet-tags">${listTags}</div>` : ''}
      </div>
    </article>`;
}

function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  } catch {
    return '';
  }
}

function formatEngagement(tweet: SavedTweet): string {
  const parts: string[] = [];
  if (tweet.likes) parts.push(`<span class="stat likes">${formatNumber(tweet.likes)}</span>`);
  if (tweet.retweets) parts.push(`<span class="stat retweets">${formatNumber(tweet.retweets)}</span>`);
  if (tweet.replies) parts.push(`<span class="stat replies">${formatNumber(tweet.replies)}</span>`);
  return parts.join('');
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatTweetText(text: string): string {
  // Escape HTML first
  let html = escapeHtml(text);
  // Linkify URLs
  html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Linkify mentions
  html = html.replace(/@([a-zA-Z0-9_]+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener">@$1</a>');
  // Bold hashtags
  html = html.replace(/#([a-zA-Z0-9_一-龥]+)/g, '<b>#$1</b>');
  return html;
}

function formatMedia(media?: TweetMedia[]): string {
  if (!media?.length) return '';
  const images = media.filter(m => m.type === 'photo' || m.url?.includes('pbs.twimg.com'));
  const videos = media.filter(m => m.type === 'video' || m.video_url);

  if (videos.length) {
    const video = videos[0];
    const thumbUrl = video.url || '';
    return `
      <div class="tweet-media tweet-video">
        ${thumbUrl ? `<img src="${escapeAttr(thumbUrl)}" alt="Video thumbnail" loading="lazy">` : ''}
        <span class="video-indicator">▶</span>
      </div>`;
  }

  if (images.length) {
    const cols = images.length >= 4 ? 'cols-4' : images.length >= 2 ? 'cols-2' : 'cols-1';
    return `
      <div class="tweet-media ${cols}">
        ${images.map(img => `<img src="${escapeAttr(img.url || '')}" alt="Tweet media" loading="lazy">`).join('')}
      </div>`;
  }

  return '';
}