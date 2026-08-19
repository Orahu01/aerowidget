// 同梱デスクテーマ集。壁紙 + ウィジェット構成の完成品をワンクリックで適用する。
// widgets の id は固定 (同じテーマの再適用でウィンドウを作り直しすぎないため)。
'use strict';

const W = (id, type, x, y, over = {}) => ({
  id, type, display: 0, x, y,
  font: 'Segoe UI', size: 24, weight: 400, color: '#ffffff',
  opacity: 1, shadow: 'soft', letterSpacing: 1, options: {},
  ...over,
});

const THEMES = [
  {
    id: 'minimal',
    name: 'ミニマル',
    nameEn: 'Minimal',
    desc: '時計と日付だけ。静かなモノトーン。',
    descEn: 'Just a clock and the date. Quiet monochrome.',
    wallpapers: { default: { type: 'preset', value: 'mono', dim: 0, bright: 0, blur: 0, animate: false }, byDisplay: {} },
    widgets: [
      W('th-min-clock', 'clock', 50, 44, {
        size: 150, weight: 100, letterSpacing: 6,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      }),
      W('th-min-date', 'date', 50, 57, {
        size: 21, weight: 300, letterSpacing: 9, opacity: 0.65,
        options: { style: 'ja-md' },
      }),
    ],
  },
  {
    id: 'cyber',
    name: 'サイバー',
    nameEn: 'Cyber',
    desc: 'ネオン発光の時計とモニタ類。ゲーミングデスクに。',
    descEn: 'Neon clock with system monitors. Built for battlestations.',
    wallpapers: {
      default: {
        type: 'custom',
        value: { kind: 'linear', angle: 150, colors: ['#05060f', '#0c1230', '#1a0b2e'] },
        dim: 0, bright: 0, blur: 0, animate: true,
      },
      byDisplay: {},
    },
    widgets: [
      W('th-cyb-clock', 'clock', 50, 36, {
        size: 140, weight: 200, letterSpacing: 5, color: '#7df9ff', shadow: 'glow',
        options: { showSeconds: true, hour12: false, showAmPm: false },
      }),
      W('th-cyb-date', 'date', 50, 50, {
        size: 19, weight: 400, letterSpacing: 6, color: '#7df9ff', shadow: 'glow', opacity: 0.8,
        options: { style: 'en-long' },
      }),
      W('th-cyb-stats', 'stats', 87, 13, {
        font: 'Consolas', size: 17, color: '#9ffcff', shadow: 'glow', opacity: 0.9,
        options: { source: 'auto', showCpu: true, showGpu: true, showMem: true, showDrives: false, showNet: true, showTemps: true, compact: false, showGraph: true, tempWarn: 85 },
      }),
      W('th-cyb-ticker', 'ticker', 12, 12, {
        font: 'Consolas', size: 16, color: '#9ffcff', shadow: 'glow', opacity: 0.9,
        options: { symbols: 'BTC-USD, ETH-USD, NVDA', showChange: true },
      }),
      W('th-cyb-line', 'line', 50, 58, {
        color: '#7df9ff', opacity: 0.45, shadow: 'none', size: 12,
        options: { orient: 'h', len: 22, thick: 2, style: 'solid' },
      }),
    ],
  },
  {
    id: 'wa',
    name: '和',
    nameEn: 'Zen',
    desc: '明朝体と桜色。落ち着いた和の設え。',
    descEn: 'Serif type and sakura tones. Calm and Japanese.',
    wallpapers: { default: { type: 'preset', value: 'sakura', dim: 8, bright: 0, blur: 0, animate: false }, byDisplay: {} },
    widgets: [
      W('th-wa-clock', 'clock', 50, 40, {
        font: 'Yu Mincho', size: 130, weight: 300, letterSpacing: 10,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      }),
      W('th-wa-date', 'date', 50, 54, {
        font: 'Yu Mincho', size: 23, weight: 300, letterSpacing: 12, opacity: 0.85,
        options: { style: 'ja-long' },
      }),
      W('th-wa-cal', 'calendar', 87, 72, {
        font: 'Yu Mincho', size: 15, opacity: 0.95,
        options: { accent: '#d98c9a', showWeekdays: true, sundayColor: true, bg: true, bgOpacity: 0.25 },
      }),
      W('th-wa-text', 'text', 12, 88, {
        font: 'Yu Mincho', size: 28, weight: 300, letterSpacing: 16, opacity: 0.55,
        options: { text: '一期一会' },
      }),
    ],
  },
  {
    id: 'dashboard',
    name: '情報ダッシュボード',
    nameEn: 'Dashboard',
    desc: '天気・予報・PC・ニュース・株価を一望。',
    descEn: 'Weather, forecast, PC stats, news and tickers at a glance.',
    wallpapers: { default: { type: 'preset', value: 'midnight', dim: 10, bright: 0, blur: 0, animate: false }, byDisplay: {} },
    widgets: [
      W('th-dash-clock', 'clock', 50, 15, {
        size: 96, weight: 200, letterSpacing: 4,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      }),
      W('th-dash-date', 'date', 50, 25, {
        size: 19, weight: 300, letterSpacing: 5, opacity: 0.85,
        options: { style: 'ja-long' },
      }),
      W('th-dash-weather', 'weather', 12, 14, {
        size: 30, weight: 300,
        options: { city: '東京', lat: 35.6895, lon: 139.6917, showIcon: true, showCity: true, showDesc: true, showHiLow: true },
      }),
      W('th-dash-forecast', 'forecast', 12, 40, {
        size: 16, weight: 400, opacity: 0.95,
        options: { city: '東京', lat: 35.6895, lon: 139.6917, mode: 'weekly', count: 5, showIcons: true },
      }),
      W('th-dash-stats', 'stats', 88, 15, {
        font: 'Consolas', size: 16, opacity: 0.95,
        options: { source: 'auto', showCpu: true, showGpu: true, showMem: true, showDrives: true, showNet: true, showTemps: true, compact: false, showGraph: true, tempWarn: 85 },
      }),
      W('th-dash-cal', 'calendar', 88, 60, {
        size: 14,
        options: { accent: '#e3a94f', showWeekdays: true, sundayColor: true, bg: true, bgOpacity: 0.3 },
      }),
      W('th-dash-ticker', 'ticker', 12, 68, {
        font: 'Consolas', size: 15, opacity: 0.9,
        options: { symbols: 'AAPL, 7203.T, USDJPY=X, BTC-USD', showChange: true },
      }),
      W('th-dash-rss', 'rss', 35, 91, {
        size: 15, opacity: 0.85,
        options: { url: 'https://www.nhk.or.jp/rss/news/cat0.xml', count: 3, rotateSec: 0 },
      }),
    ],
  },
  {
    id: 'focus',
    name: 'フォーカス',
    nameEn: 'Focus',
    desc: 'ポモドーロと ToDo で作業に集中。',
    descEn: 'Pomodoro and a to-do list. Get things done.',
    wallpapers: { default: { type: 'preset', value: 'forest', dim: 15, bright: 0, blur: 0, animate: false }, byDisplay: {} },
    widgets: [
      W('th-foc-clock', 'clock', 50, 28, {
        size: 120, weight: 200, letterSpacing: 4,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      }),
      W('th-foc-date', 'date', 50, 40, {
        size: 19, weight: 300, letterSpacing: 5, opacity: 0.8,
        options: { style: 'ja-md' },
      }),
      W('th-foc-pomo', 'pomo', 50, 62, {
        size: 15, color: '#e6e7ea', shadow: 'none',
        options: { workMin: 25, breakMin: 5, w: 230, h: 160, bgOpacity: 0.55 },
      }),
      W('th-foc-todo', 'todo', 85, 66, {
        size: 14, color: '#e6e7ea', shadow: 'none',
        options: { title: 'ToDo', items: [], w: 260, h: 250, bgOpacity: 0.55 },
      }),
      W('th-foc-text', 'text', 50, 90, {
        size: 17, weight: 300, letterSpacing: 11, opacity: 0.45,
        options: { text: 'DEEP WORK' },
      }),
    ],
  },
  {
    id: 'music',
    name: 'ミュージック',
    nameEn: 'Music',
    desc: 'アルバムアート壁紙と再生操作、ビジュアライザー。',
    descEn: 'Album-art wallpaper, playback controls and a visualizer.',
    wallpapers: { default: { type: 'nowplaying', value: '', dim: 18, bright: 0, blur: 0, animate: false }, byDisplay: {} },
    widgets: [
      W('th-mus-clock', 'clock', 50, 18, {
        size: 110, weight: 100, letterSpacing: 7,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      }),
      W('th-mus-np', 'nowplaying', 50, 76, {
        size: 17, color: '#e6e7ea', shadow: 'none',
        options: { showArt: true, showArtist: true, showControls: true, hideWhenStopped: false, w: 400, h: 110, bgOpacity: 0.5 },
      }),
      W('th-mus-vol', 'volume', 88, 92, {
        size: 15, color: '#e6e7ea', shadow: 'none',
        options: { showDevices: true, w: 260, h: 120, bgOpacity: 0.5 },
      }),
      W('th-mus-vis', 'visualizer', 50, 93, {
        size: 14, opacity: 0.8, shadow: 'none',
        options: { bars: 56, wPct: 44, hPx: 80, mirror: true },
      }),
    ],
  },
];

module.exports = { THEMES };
