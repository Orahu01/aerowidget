// 設定の読み書き (%APPDATA%/widgetwall/config.json)
'use strict';

const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const emitter = new EventEmitter();

function defaults() {
  return {
    version: 1,
    wallpaper: {
      type: 'preset',      // 'preset' | 'image' | 'video' | 'color'
      value: 'aurora',     // プリセット名 / ファイルパス / カラーコード
      dim: 12,             // 暗くする (0-70 %)
      blur: 0,             // ぼかし (0-30 px)
    },
    widgets: [
      {
        id: 'w-clock', type: 'clock', x: 50, y: 40,
        font: 'Segoe UI', size: 128, weight: 200, color: '#ffffff',
        opacity: 1, shadow: 'soft', letterSpacing: 4,
        options: { showSeconds: false, hour12: false, showAmPm: false },
      },
      {
        id: 'w-date', type: 'date', x: 50, y: 53,
        font: 'Segoe UI', size: 26, weight: 300, color: '#ffffff',
        opacity: 0.85, shadow: 'soft', letterSpacing: 6,
        options: { style: 'ja-long' },
      },
    ],
    settings: {
      weatherIntervalMin: 30,
    },
  };
}

let cfg = null;
let saveTimer = null;

function filePath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    cfg = Object.assign(defaults(), parsed);
    cfg.wallpaper = Object.assign(defaults().wallpaper, parsed.wallpaper || {});
    cfg.settings = Object.assign(defaults().settings, parsed.settings || {});
    if (!Array.isArray(cfg.widgets)) cfg.widgets = defaults().widgets;
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

let seq = 0;
function newWidget(type) {
  const id = 'w' + Date.now().toString(36) + (seq++).toString(36);
  const base = {
    id, type, x: 50, y: 70,
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
      return { ...base, size: 20, font: 'Consolas', options: { showCpu: true, showMem: true } };
    default:
      return base;
  }
}

module.exports = { get, load, update, newWidget, defaults, on: (...a) => emitter.on(...a) };
