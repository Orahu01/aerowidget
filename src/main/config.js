// 設定の読み書き (%APPDATA%/aerowidget/config.json)  — スキーマ v2 (マルチモニタ対応)
'use strict';

const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const backup = require('./backup');

const emitter = new EventEmitter();

// app.getVersion() は起動直後でも読めるが、テストや異常時に備えて包んでおく
function appVersion() {
  try { return app.getVersion(); } catch (_) { return ''; }
}

function defaultWallpaper() {
  return { type: 'preset', value: 'aurora', dim: 12, bright: 0, blur: 0, animate: false };
}

function defaults() {
  return {
    version: 2,
    appVersion: appVersion(),    // 最後にこの設定を書いたアプリの版 (更新の検知に使う)
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
      showDesktopIcons: true,      // 通常時にデスクトップアイコンを表示するか
      language: 'auto',            // 'auto' | 'ja' | 'en'
      onboarded: false,            // 初回ウィザードを完了したか
      artAccent: false,            // 再生中の曲の色をアクセントに反映
      allowPrerelease: false,      // 先行版 (奇数マイナー) を受け取るか
      hotkeys: {
        enabled: false,
        overlay: 'Ctrl+Alt+A',   // 呼び出せるダッシュボード
        toggleWidgets: 'Ctrl+Alt+W',
        toggleIcons: 'Ctrl+Alt+D',
        nextLayout: 'Ctrl+Alt+L',
        pomoToggle: 'Ctrl+Alt+P',
      },
      // 呼び出せるダッシュボード。壁紙は作業中は見えないので、
      // 同じ配置を最前面に呼び出せるようにする。
      overlay: {
        dim: 55,             // 壁紙をどれだけ暗くするか (%)
        hideIcons: true,     // 表示中はデスクトップアイコンを隠す
        allDisplays: false,  // false = カーソルのあるモニタだけ
        closeOnBlur: true,   // 他をクリックしたら閉じる
      },
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

// 版が変わったときの退避は 1 プロセスにつき 1 回だけ (replace() 経由の再読込で重複させない)
let versionChecked = false;

// 設定に書き込む前に、版が変わっていれば退避する。
// ここを通しておけば更新だけでなく「版を下げたとき」も守られる。
function backupIfVersionChanged(parsed) {
  if (versionChecked) return;
  versionChecked = true;
  try {
    const now = appVersion();
    const was = String((parsed && parsed.appVersion) || '');
    if (was === now) return;
    // was が空 = appVersion を記録していなかった頃 (v5.1 以前) からの更新
    backup.create(was ? `${was} から ${now} へ更新` : `${now} へ更新`, was || 'unknown');
  } catch (e) {
    console.error('version backup failed:', e.message);   // 退避に失敗しても起動は続ける
  }
}

function load() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsedRaw = JSON.parse(raw);
    backupIfVersionChanged(parsedRaw);
    const parsed = migrate(parsedRaw);
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
    cfg.settings.hotkeys = Object.assign(
      { enabled: false, overlay: 'Ctrl+Alt+A', toggleWidgets: 'Ctrl+Alt+W', toggleIcons: 'Ctrl+Alt+D', nextLayout: 'Ctrl+Alt+L', pomoToggle: 'Ctrl+Alt+P' },
      (parsed.settings || {}).hotkeys || {},
    );
    cfg.settings.overlay = Object.assign(
      { dim: 55, hideIcons: true, allDisplays: false, closeOnBlur: true },
      (parsed.settings || {}).overlay || {},
    );
    if (!Array.isArray(cfg.widgets)) cfg.widgets = d.widgets;
    for (const w of cfg.widgets) {
      if (typeof w.display !== 'number') w.display = 0;
      if (!w.options) w.options = {};
    }
    delete cfg.backupReason;                    // バックアップ側の目印は持ち歩かない
    const running = appVersion();
    if (cfg.appVersion !== running) {
      cfg.appVersion = running;
      save();
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
function replace(parsed, reason = '設定の読み込み前') {
  backup.create(reason, (cfg && cfg.appVersion) || appVersion());
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
        ...base, x: 50, y: 82, size: 16, weight: 400, letterSpacing: 0, shadow: 'none',
        options: {
          showArt: true, showArtist: true, showControls: true,
          hideWhenStopped: false, w: 320, h: 96, bgOpacity: 0.55,
        },
      };
    case 'volume':
      return {
        ...base, x: 88, y: 92, size: 15, color: '#e6e7ea', shadow: 'none',
        options: { showDevices: true, w: 260, h: 120, bgOpacity: 0.6 },
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
    case 'ics':
      return {
        ...base, x: 84, y: 40, size: 17, weight: 400, letterSpacing: 0, shadow: 'soft',
        options: { url: '', count: 5, daysAhead: 7, showTime: true },
      };
    case 'forecast':
      return {
        ...base, x: 86, y: 28, size: 17, weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { city: '東京', lat: 35.6895, lon: 139.6917, mode: 'weekly', count: 5, showIcons: true },
      };
    case 'worldclock':
      return {
        ...base, x: 14, y: 30, size: 20, weight: 300, letterSpacing: 2, shadow: 'soft',
        options: { zones: '東京=Asia/Tokyo\nニューヨーク=America/New_York\nロンドン=Europe/London', showDate: false, hour12: false },
      };
    case 'todo':
      return {
        ...base, x: 82, y: 60, size: 14, color: '#e6e7ea', shadow: 'none',
        options: { title: 'ToDo', items: [], w: 250, h: 220, bgOpacity: 0.6 },
      };
    case 'battery':
      return {
        ...base, x: 92, y: 95, size: 18, weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { showBar: true, warnAt: 20 },
      };
    case 'disk':
      return {
        ...base, x: 12, y: 70, size: 16, font: 'Consolas', weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { drives: '', showBar: true },
      };
    case 'netinfo':
      return {
        ...base, x: 12, y: 55, size: 16, font: 'Consolas', weight: 400, letterSpacing: 1, shadow: 'soft',
        options: { showIp: true, showSsid: true, showPing: true, showGraph: false },
      };
    case 'visualizer':
      return {
        ...base, x: 50, y: 92, size: 14, opacity: 0.85, shadow: 'none',
        options: { bars: 48, wPct: 40, hPx: 90, mirror: true },
      };
    default:
      return base;
  }
}

module.exports = { get, load, update, replace, newWidget, defaults, wallpaperFor, filePath, on: (...a) => emitter.on(...a) };
