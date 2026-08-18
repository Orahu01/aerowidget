// 設定ウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfig: (cb) => ipcRenderer.on('config', (_e, c) => cb(c)),
  onWeather: (cb) => ipcRenderer.on('weather', (_e, d) => cb(d)),

  setWallpaper: (patch) => ipcRenderer.invoke('wallpaper:set', patch),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  addWidget: (type) => ipcRenderer.invoke('widget:add', type),
  removeWidget: (id) => ipcRenderer.invoke('widget:remove', id),
  updateWidget: (id, patch) => ipcRenderer.invoke('widget:update', id, patch),

  pickFile: () => ipcRenderer.invoke('file:pick'),
  searchCity: (q) => ipcRenderer.invoke('city:search', q),
  getWeather: () => ipcRenderer.invoke('weather:get'),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),

  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (v) => ipcRenderer.invoke('autostart:set', v),

  enterEditMode: () => ipcRenderer.invoke('edit:enter'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  quitApp: () => ipcRenderer.send('app:quit'),
});
