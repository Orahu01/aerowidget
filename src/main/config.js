// 設定の読み書き (%APPDATA%/widgetwall/config.json)  — スキーマ v2 (マルチモニタ対応)
'use strict';

const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const emitter = new EventEmitter();

function defaultWallpaper() {
  return { type: 'preset', value: 'aurora', dim: 12, bright: 0, blur: 0, animate: false };
}

function defaults() {
  return {
    version: 2,
    wallpapers: {
      default: defaultWallpaper(),
      byDisplay: {},          // { "1": {type,value,dim,blur,animate} } キーはモニタ index
    },
    widgets: [
      {
        id: 'w-clock', type: 'clock', display: 0, x: 50, y: 40,
        font: 'Segoe UI', size: 128, weight: 200, color: '#ffffff',
        opacity: 1, shadow: 'soft', letterSpacing: 4,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      },
      {
        id: 'w-date', type: 'date', display: 0, x: 50, y: 53,
        font: 'Segoe UI', size: 26, weight: 300, color: '#ffffff',
        opacity: 0.85, shadow: 'soft', letterSpacing: 6,
        options: { style: 'ja-long' },
      },
    ],
    settings: {
      weatherIntervalMin: 30,
      pauseOnFullscreen: true,     // フルスクリーンアプリ実行中は描画を止める (省電力)
      customPresets: [],           // 保存したカスタム壁紙 [{kind,colors,angle}]
      googleFonts: [],             // [{family, cssFile}]
      lhmUrl: 'http://127.0.0.1:8085/data.json',
      schedule: {                  // 時間帯・曜日による壁紙の自動切替
        enabled: false,
        mode: 'daynight',          // 'daynight' | 'weekly'
        dayStart: '07:00',
        nightStart: '19:00',
        day: null,                 // 壁紙スナップショット {type,value,dim,bright,blur,animate}
        night: null,
        weekly: {},                // { "0".."6": スナップショット } 日曜=0
      },
      layouts: [],                 // レイアウトプリセット [{name, wallpapers, widgets}]
    },
  };
}

let cfg = null;
let saveTimer = null;

function filePath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// v1 → v2 マイグレーション
function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return defaults();
  if (parsed.version >= 2) return parsed;
  const d = defaults();
  if (parsed.wallpaper) {
    d.wallpapers.default = Object.assign(defaultWallpaper(), parsed.wallpaper);
  }
  if (Array.isArray(parsed.widgets)) {
    d.widgets = parsed.widgets.map(w => ({ display: 0, ...w }));
  }
  if (parsed.settings) Object.assign(d.settings, parsed.settings);
  return d;
}

function load() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = migrate(JSON.parse(raw));
    const d = defaults();
    cfg = Object.assign(d, parsed);
    cfg.wallpapers = {
      default: Object.assign(defaultWallpaper(), (parsed.wallpapers || {}).default || {}),
      byDisplay: (parsed.wallpapers || {}).byDisplay || {},
    };
    cfg.settings = Object.assign(d.settings, parsed.settings || {});
    cfg.settings.schedule = Object.assign(
      { enabled: false, mode: 'daynight', dayStart: '07:00', nightStart: '19:00', day: null, night: null, weekly: {} },
      (parsed.settings || {}).schedule || {},
    );
    if (!Array.isArray(cfg.settings.layouts)) cfg.settings.layouts = [];
    if (!Array.isArray(cfg.widgets)) cfg.widgets = d.widgets;
    for (const w of cfg.widgets) {
      if (typeof w.display !== 'number') w.display = 0;
      if (!w.options) w.options = {};
    }
  } catch (_) {
    cfg = defaults();
  }
  return cfg;
}

function get() {
  if (!cfg) load();
  return cfg;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const fp = filePath();
      const tmp = fp + '.tmp';
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
      fs.renameSync(tmp, fp);
    } catch (e) {
      console.error('config save failed:', e.message);
    }
  }, 250);
}

// mutator(cfg) で変更 → 保存 & 'change' イベント
function update(mutator) {
  const c = get();
  mutator(c);
  save();
  emitter.emit('change', c);
  return c;
}

// 設定全体を置き換える (インポート用)。現行設定はバックアップしてから適用する
function replace(parsed) {
  try {
    const fp = filePath();
    if (fs.existsSync(fp)) {
      fs.copyFileSync(fp, path.join(path.dirname(fp), `config.backup-${Date.now()}.json`));
    }
  } catch (_) { /* バックアップは best-effort */ }
  cfg = null;
  const tmp = migrate(parsed);
  // load() と同じ正規化を通すため、一旦ファイルに書いて読み直す
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(tmp, null, 2), 'utf8');
  load();
  emitter.emit('change', cfg);
  return cfg;
}

// 指定モニタの壁紙設定を解決
function wallpaperFor(displayIndex) {
  const c = get();
  return c.wallpapers.byDisplay[String(displayIndex)] || c.wallpapers.default;
}

let seq = 0;
function newWidget(type) {
  const id = 'w' + Date.now().toString(36) + (seq++).toString(36);
  const base = {
    id, type, display: 0, x: 50, y: 70,
    font: 'Segoe UI', size: 32, weight: 400, color: '#ffffff',
    opacity: 1, shadow: 'soft', letterSpacing: 1, options: {},
  };
  switch (type) {
    case 'clock':
      return { ...base, size: 96, weight: 200, letterSpacing: 3, options: { showSeconds: false, hour12: false, showAmPm: false } };
    case 'date':
      return { ...base, size: 24, weight: 300, letterSpacing: 4, options: { style: 'ja-long' } };
    case 'weather':
      return { ...base, size: 28, options: { city: '東京', lat: 35.6895, lon: 139.6917, showIcon: true, showCity: true, showDesc: true, showHiLow: false } };
    case 'text':
      return { ...base, size: 28, weight: 300, options: { text: 'Stay hungry, stay foolish.' } };
    case 'stats':
      return {
        ...base, size: 18, font: 'Consolas', shadow: 'soft', options: {
          source: 'auto', showCpu: true, showGpu: true, showMem: true,
          showDrives: false, showNet: false, showTemps: true, compact: false,
        },
      };
    case 'zone':
      return {
        ...base, x: 25, y: 35, size: 16, weight: 500, letterSpacing: 2, color: '#9ec5ff', opacity: 1, shadow: 'none',
        options: {
          w: 22, h: 34, radius: 16,
          fill: '#4f8cff', fillOpacity: 0.08,
          borderColor: '#7db4ff', borderWidth: 1.5, borderStyle: 'dashed', borderOpacity: 0.55,
          label: 'ゲーム', labelPos: 'tl',
        },
      };
    case 'line':
      return {
        ...base, x: 50, y: 60, size: 12, color: '#8fb8ff', opacity: 0.65, shadow: 'none',
        options: { orient: 'h', len: 26, thick: 2, style: 'solid' },
      };
    case 'folder':
      return {
        ...base, x: 18, y: 78, size: 12, color: '#e8ecf4', opacity: 1, shadow: 'none',
        options: { items: [], columns: 0, iconSize: 34, showLabels: true, title: 'アプリ', bgOpacity: 0.55 },
      };
    case 'image':
      return {
        ...base, x: 22, y: 30, size: 12, shadow: 'soft',
        options: { path: '', w: 18, radius: 12 },
      };
    case 'analog':
      return {
        ...base, x: 50, y: 40, size: 220, weight: 400, color: '#ffffff', shadow: 'soft',
        options: { showSeconds: true, showTicks: true, face: 'dark', faceOpacity: 0.25 },
      };
    case 'calendar':
      return {
        ...base, x: 85, y: 62, size: 15, weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { accent: '#e3a94f', showWeekdays: true, sundayColor: true, bg: true, bgOpacity: 0.3 },
      };
    case 'countdown':
      return {
        ...base, x: 82, y: 30, size: 42, weight: 300, letterSpacing: 2, shadow: 'soft',
        options: { title: '夏休みまで', date: '', showPast: true },
      };
    case 'rss':
      return {
        ...base, x: 30, y: 88, size: 16, weight: 400, letterSpacing: 0, opacity: 0.9, shadow: 'soft',
        options: { url: 'https://www.nhk.or.jp/rss/news/cat0.xml', count: 3, rotateSec: 0, showSource: false },
      };
    case 'ticker':
      return {
        ...base, x: 14, y: 12, size: 18, font: 'Consolas', weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { symbols: 'AAPL, 7203.T, USDJPY=X, BTC-USD', showChange: true },
      };
    case 'nowplaying':
      return {
        ...base, x: 50, y: 82, size: 22, weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { showArt: true, showArtist: true, hideWhenStopped: true },
      };
    case 'note':
      return {
        ...base, x: 82, y: 82, size: 14, color: '#e6e7ea', shadow: 'none',
        options: { title: 'メモ', text: '', w: 240, h: 180, bgOpacity: 0.6 },
      };
    case 'pomo':
      return {
        ...base, x: 50, y: 14, size: 14, color: '#e6e7ea', shadow: 'none',
        options: { workMin: 25, breakMin: 5, w: 210, h: 150, bgOpacity: 0.6 },
      };
    default:
      return base;
  }
}

module.exports = { get, load, update, newWidget, defaults, wallpaperFor, on: (...a) => emitter.on(...a) };
