// 壁紙ウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wall', {
  requestState: () => ipcRenderer.invoke('state:request'),
  getFontsCss: () => ipcRenderer.invoke('fonts:css'),
  getIcon: (p) => ipcRenderer.invoke('icon:get', p),
  onConfig: (cb) => ipcRenderer.on('config', (_e, env) => cb(env)),
  onWeather: (cb) => ipcRenderer.on('weather', (_e, d) => cb(d)),
  onHw: (cb) => ipcRenderer.on('hw', (_e, d) => cb(d)),
  onMedia: (cb) => ipcRenderer.on('media', (_e, d) => cb(d)),
  onRss: (cb) => ipcRenderer.on('rss', (_e, d) => cb(d)),
  onTicker: (cb) => ipcRenderer.on('ticker', (_e, d) => cb(d)),
  onDisks: (cb) => ipcRenderer.on('disks', (_e, d) => cb(d)),
  onNetinfo: (cb) => ipcRenderer.on('netinfo', (_e, d) => cb(d)),
  onIcs: (cb) => ipcRenderer.on('ics', (_e, d) => cb(d)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, d) => cb(d)),
  onWidgetsHidden: (cb) => ipcRenderer.on('widgets-hidden', (_e, v) => cb(v)),
  listSlides: (dir) => ipcRenderer.invoke('slides:list', dir),
  duplicateWidget: (id) => ipcRenderer.invoke('widget:duplicate', id),
  onEditMode: (cb) => ipcRenderer.on('edit-mode', (_e, v) => cb(v)),
  onPower: (cb) => ipcRenderer.on('power', (_e, d) => cb(d)),
  onFontsChanged: (cb) => ipcRenderer.on('fonts-changed', () => cb()),
  editLive: (id, partial) => ipcRenderer.send('edit:live', id, partial),
  finishEdit: () => ipcRenderer.send('edit:finish'),
  getIconsVisible: () => ipcRenderer.invoke('icons:get'),
  setIconsVisible: (v) => ipcRenderer.invoke('icons:toggle', v),
  onIconsState: (cb) => ipcRenderer.on('icons-state', (_e, v) => cb(v)),
});
