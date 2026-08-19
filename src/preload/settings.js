// 設定ウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfig: (cb) => ipcRenderer.on('config', (_e, env) => cb(env)),
  onWeather: (cb) => ipcRenderer.on('weather', (_e, d) => cb(d)),
  onHw: (cb) => ipcRenderer.on('hw', (_e, d) => cb(d)),
  onLhmStatus: (cb) => ipcRenderer.on('lhm-status', (_e, v) => cb(v)),
  onFontsChanged: (cb) => ipcRenderer.on('fonts-changed', () => cb()),

  listDisplays: () => ipcRenderer.invoke('displays:list'),
  setWallpaper: (patch, displayIndex) => ipcRenderer.invoke('wallpaper:set', patch, displayIndex),
  clearWallpaperOverride: (displayIndex) => ipcRenderer.invoke('wallpaper:clearOverride', displayIndex),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  saveCustomPreset: (v) => ipcRenderer.invoke('custompreset:save', v),
  removeCustomPreset: (i) => ipcRenderer.invoke('custompreset:remove', i),

  addWidget: (type) => ipcRenderer.invoke('widget:add', type),
  removeWidget: (id) => ipcRenderer.invoke('widget:remove', id),
  updateWidget: (id, patch) => ipcRenderer.invoke('widget:update', id, patch),

  pickFile: () => ipcRenderer.invoke('file:pick'),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  pickFolderItems: () => ipcRenderer.invoke('folder:pick'),
  getIcon: (p) => ipcRenderer.invoke('icon:get', p),
  searchCity: (q) => ipcRenderer.invoke('city:search', q),
  getWeather: () => ipcRenderer.invoke('weather:get'),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),
  getHw: () => ipcRenderer.invoke('hw:get'),

  addGoogleFont: (family) => ipcRenderer.invoke('gfont:add', family),
  removeGoogleFont: (family) => ipcRenderer.invoke('gfont:remove', family),
  getFontsCss: () => ipcRenderer.invoke('fonts:css'),

  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (v) => ipcRenderer.invoke('autostart:set', v),

  enterEditMode: () => ipcRenderer.invoke('edit:enter'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  quitApp: () => ipcRenderer.send('app:quit'),
});
