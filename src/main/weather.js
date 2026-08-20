// Open-Meteo (APIキー不要) から天気を取得する。
// 座標ごとにキャッシュし、現在の天気ウィジェットと予報ウィジェットの両方に使う。
const brand = require('../shared/brand');
'use strict';

const { EventEmitter } = require('events');
const heartbeat = require('./heartbeat');

const emitter = new EventEmitter();

// WMO weather code → 表示
const CODES = {
  0: ['☀️', '快晴'], 1: ['🌤️', '晴れ'], 2: ['⛅', '晴れ時々曇り'], 3: ['☁️', '曇り'],
  45: ['🌫️', '霧'], 48: ['🌫️', '霧氷'],
  51: ['🌦️', '霧雨'], 53: ['🌦️', '霧雨'], 55: ['🌧️', '強い霧雨'],
  56: ['🌧️', '着氷性の霧雨'], 57: ['🌧️', '着氷性の霧雨'],
  61: ['🌧️', '小雨'], 63: ['🌧️', '雨'], 65: ['🌧️', '大雨'],
  66: ['🌧️', '着氷性の雨'], 67: ['🌧️', '着氷性の雨'],
  71: ['🌨️', '小雪'], 73: ['🌨️', '雪'], 75: ['❄️', '大雪'], 77: ['❄️', '霧雪'],
  80: ['🌦️', 'にわか雨'], 81: ['🌧️', 'にわか雨'], 82: ['⛈️', '激しいにわか雨'],
  85: ['🌨️', 'にわか雪'], 86: ['🌨️', '激しいにわか雪'],
  95: ['⛈️', '雷雨'], 96: ['⛈️', '雷雨と雹'], 99: ['⛈️', '激しい雷雨'],
};

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];

const latestByKey = new Map();  // "lat,lon" -> データ
let subscribers = () => [];     // 現在購読すべき options 一覧を返す関数

function keyOf(o) {
  return `${(+o.lat).toFixed(3)},${(+o.lon).toFixed(3)}`;
}

async function fetchJson(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': brand.UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// 都市名検索 (設定画面用)
async function searchCity(query) {
  if (!query || !query.trim()) return [];
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=ja&format=json&name=' + encodeURIComponent(query.trim());
  try {
    const j = await fetchJson(url);
    return (j.results || []).map(r => ({
      name: r.name,
      admin: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch (e) {
    console.error('geocoding failed:', e.message);
    return [];
  }
}

function deco(code) {
  return CODES[code] || ['🌡️', '─'];
}

async function refresh(widgetOptions) {
  const o = widgetOptions || {};
  if (o.lat == null || o.lon == null) return null;
  const key = keyOf(o);
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${o.lat}&longitude=${o.lon}`
    + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
    + '&hourly=temperature_2m,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,weather_code'
    + '&forecast_days=7&timezone=auto';
  try {
    const j = await fetchJson(url);
    const cur = j.current || {};
    const daily = j.daily || {};
    const hourly = j.hourly || {};
    const code = cur.weather_code ?? 3;
    const [emoji, desc] = deco(code);

    // 時間別: 今から 3 時間おきに 6 コマ
    const hours = [];
    if (hourly.time) {
      const nowIdx = hourly.time.findIndex(t => new Date(t).getTime() >= Date.now());
      for (let i = Math.max(0, nowIdx); i < hourly.time.length && hours.length < 6; i += 3) {
        const [he] = deco(hourly.weather_code[i]);
        hours.push({
          h: new Date(hourly.time[i]).getHours(),
          temp: Math.round(hourly.temperature_2m[i]),
          emoji: he,
        });
      }
    }

    // 週間: 今日から 7 日
    const days = [];
    if (daily.time) {
      for (let i = 0; i < daily.time.length; i++) {
        const d = new Date(daily.time[i] + 'T00:00:00');
        const [de] = deco(daily.weather_code[i]);
        days.push({
          dow: WEEK_JA[d.getDay()],
          day: d.getDate(),
          emoji: de,
          hi: Math.round(daily.temperature_2m_max[i]),
          lo: Math.round(daily.temperature_2m_min[i]),
        });
      }
    }

    const data = {
      city: o.city || '',
      temp: Math.round(cur.temperature_2m ?? 0),
      humidity: cur.relative_humidity_2m ?? null,
      wind: cur.wind_speed_10m ?? null,
      code, emoji, desc,
      hi: days[0] ? days[0].hi : null,
      lo: days[0] ? days[0].lo : null,
      hourly: hours,
      daily: days,
      fetchedAt: Date.now(),
      error: false,
    };
    latestByKey.set(key, data);
    emitter.emit('update', { key, data });
    return data;
  } catch (e) {
    console.error('weather fetch failed:', e.message);
    if (!latestByKey.has(key)) {
      const data = { city: o.city || '', temp: null, error: true, emoji: '🌡️', desc: '取得待ち', hourly: [], daily: [], fetchedAt: Date.now() };
      latestByKey.set(key, data);
      emitter.emit('update', { key, data });
    }
    return latestByKey.get(key);
  }
}

function refreshAll() {
  const seen = new Set();
  for (const o of subscribers()) {
    if (!o || o.lat == null) continue;
    const k = keyOf(o);
    if (seen.has(k)) continue;
    seen.add(k);
    refresh(o);
  }
}

// getSubscribers() = 天気・予報ウィジェットの options 配列を返す関数
function schedule(getSubscribers, intervalMin) {
  subscribers = getSubscribers;
  heartbeat.register('weather', Math.max(5, intervalMin || 30) * 60 * 1000, refreshAll, true);
}

function stopSchedule() {
  heartbeat.unregister('weather');
}

function getLatest() {
  // 設定画面のステータス表示用 (先頭の 1 件)
  return latestByKey.values().next().value || null;
}

function snapshot() {
  return Object.fromEntries(latestByKey);
}

module.exports = { searchCity, refresh, schedule, stopSchedule, getLatest, snapshot, keyOf, on: (...a) => emitter.on(...a) };
