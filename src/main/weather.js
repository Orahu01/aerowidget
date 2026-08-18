// Open-Meteo (APIキー不要) から天気を取得する
'use strict';

const { EventEmitter } = require('events');

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

let latest = null;   // { city, temp, code, emoji, desc, hi, lo, humidity, wind, fetchedAt }
let timer = null;

async function fetchJson(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'WidgetWall/1.0' } });
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

// config の weather ウィジェット (最初の1つ) に基づいて取得
async function refresh(widget) {
  if (!widget || widget.lat == null || widget.lon == null) return null;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${widget.lat}&longitude=${widget.lon}`
    + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
  try {
    const j = await fetchJson(url);
    const cur = j.current || {};
    const daily = j.daily || {};
    const code = cur.weather_code ?? 3;
    const [emoji, desc] = CODES[code] || ['🌡️', '─'];
    latest = {
      city: widget.city || '',
      temp: Math.round(cur.temperature_2m ?? 0),
      humidity: cur.relative_humidity_2m ?? null,
      wind: cur.wind_speed_10m ?? null,
      code, emoji, desc,
      hi: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : null,
      lo: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : null,
      fetchedAt: Date.now(),
      error: false,
    };
    emitter.emit('update', latest);
    return latest;
  } catch (e) {
    console.error('weather fetch failed:', e.message);
    if (!latest) {
      latest = { city: widget.city || '', temp: null, error: true, emoji: '🌡️', desc: '取得待ち', fetchedAt: Date.now() };
      emitter.emit('update', latest);
    }
    return latest;
  }
}

// 定期更新を(再)開始する。getWidget() で現在の天気ウィジェット設定を取り出す
function schedule(getWidget, intervalMin) {
  clearInterval(timer);
  const run = () => {
    const w = getWidget();
    if (w) refresh(w.options);
  };
  timer = setInterval(run, Math.max(5, intervalMin || 30) * 60 * 1000);
  run();
}

function getLatest() { return latest; }

module.exports = { searchCity, refresh, schedule, getLatest, on: (...a) => emitter.on(...a) };
