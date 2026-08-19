// RSS ヘッドラインと 株価/為替 (Yahoo Finance chart API) の取得。
// どちらもウィジェットが存在するときだけ heartbeat で定期更新する。
'use strict';

const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

const rssCache = new Map();    // url -> { items: [{title, link}], fetchedAt, error }
const tickerCache = new Map(); // symbol -> { price, prevClose, changePct, currency, fetchedAt, error }

let rssUrls = [];
let tickerSymbols = [];

async function fetchText(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 WidgetWall/4.0', 'Accept': '*/*' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- RSS
function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// 依存なしの簡易 RSS/Atom パーサ (title だけ取れれば十分)
function parseFeed(xml) {
  const items = [];
  const itemRe = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 12) {
    const block = m[0];
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    if (t) {
      const title = decodeEntities(t[1]);
      if (title) items.push({ title });
    }
  }
  return items;
}

async function refreshRss(url) {
  try {
    const xml = await fetchText(url);
    const items = parseFeed(xml);
    rssCache.set(url, { items, fetchedAt: Date.now(), error: items.length === 0 });
  } catch (e) {
    const prev = rssCache.get(url);
    rssCache.set(url, { items: prev ? prev.items : [], fetchedAt: Date.now(), error: true });
  }
  emitter.emit('rss', { url, ...rssCache.get(url) });
}

// ---------------------------------------------------------------- 株価・為替
async function refreshSymbol(sym) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
    const j = JSON.parse(await fetchText(url));
    const meta = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    if (!meta || meta.regularMarketPrice == null) throw new Error('no data');
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    tickerCache.set(sym, {
      price,
      prevClose: prev,
      changePct: prev ? ((price - prev) / prev) * 100 : 0,
      currency: meta.currency || '',
      name: meta.shortName || sym,
      fetchedAt: Date.now(),
      error: false,
    });
  } catch (e) {
    const p = tickerCache.get(sym);
    tickerCache.set(sym, { ...(p || { price: null, changePct: null }), fetchedAt: Date.now(), error: true });
  }
  emitter.emit('ticker', { symbol: sym, ...tickerCache.get(sym) });
}

// ---------------------------------------------------------------- スケジューリング
// config 側から「今必要な購読対象」を渡してもらう
function sync(urls, symbols) {
  rssUrls = [...new Set(urls.filter(Boolean))];
  tickerSymbols = [...new Set(symbols.flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean))];

  if (rssUrls.length) {
    heartbeat.register('rss', 30 * 60 * 1000, () => rssUrls.forEach(refreshRss), false);
    for (const u of rssUrls) if (!rssCache.has(u)) refreshRss(u);
  } else {
    heartbeat.unregister('rss');
  }

  if (tickerSymbols.length) {
    heartbeat.register('ticker', 10 * 60 * 1000, () => tickerSymbols.forEach(refreshSymbol), false);
    for (const s of tickerSymbols) if (!tickerCache.has(s)) refreshSymbol(s);
  } else {
    heartbeat.unregister('ticker');
  }
}

function snapshot() {
  return {
    rss: Object.fromEntries(rssCache),
    ticker: Object.fromEntries(tickerCache),
  };
}

module.exports = { sync, snapshot, on: (...a) => emitter.on(...a) };
