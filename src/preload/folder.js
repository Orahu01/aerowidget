// フォルダウィジェットウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const wid = new URLSearchParams(location.search).get('wid');

contextBridge.exposeInMainWorld('fw', {
  id: wid,
  getState: () => ipcRenderer.invoke('folder:state', wid),
  getIcon: (p) => ipcRenderer.invoke('icon:get', p),
  getUrlIcon: (u) => ipcRenderer.invoke('icon:forUrl', u),
  launch: (p) => ipcRenderer.send('folder:launch', wid, p),
  droppedPaths: (files) => {
    const out = [];
    for (const f of files) {
      try { const p = webUtils.getPathForFile(f); if (p) out.push(p); } catch (_) {}
    }
    return out;
  },
  addItems: (paths) => ipcRenderer.invoke('folder:addItems', wid, paths),
  save: (options) => ipcRenderer.send('inter:save', wid, options),
  onWidget: (cb) => ipcRenderer.on('fw', (_e, w) => cb(w)),
  onConfig: (cb) => ipcRenderer.on('config', (_e, env) => cb(env)),
  onFontsChanged: (cb) => ipcRenderer.on('fonts-changed', () => cb()),
  getFontsCss: () => ipcRenderer.invoke('fonts:css'),

  // 音量 / 出力デバイス
  onAudio: (cb) => ipcRenderer.on('audio', (_e, d) => cb(d)),
  setVolume: (v) => ipcRenderer.send('audio:volume', v),
  setMute: (m) => ipcRenderer.send('audio:mute', m),
  setDevice: (id) => ipcRenderer.send('audio:device', id),
  refreshAudio: () => ipcRenderer.send('audio:refresh'),

  // 再生中の曲
  onMedia: (cb) => ipcRenderer.on('media', (_e, d) => cb(d)),
  mediaKey: (which) => ipcRenderer.send('media:key', which),

  // ポモドーロのホットキー操作
  listLayouts: () => ipcRenderer.invoke('switcher:layouts'),
  currentLayout: () => ipcRenderer.invoke('switcher:current'),
  applyLayout: (name) => ipcRenderer.invoke('switcher:apply', name),
  listIconModes: () => ipcRenderer.invoke('switcher:iconModes'),
  currentIconMode: () => ipcRenderer.invoke('switcher:currentIcons'),
  applyIconMode: (name) => ipcRenderer.invoke('switcher:applyIcons', name),
  onPomoToggle: (cb) => ipcRenderer.on('pomo-toggle', () => cb()),
});
