// 壁紙ウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wall', {
  requestState: () => ipcRenderer.invoke('state:request'),
  onConfig: (cb) => ipcRenderer.on('config', (_e, c) => cb(c)),
  onWeather: (cb) => ipcRenderer.on('weather', (_e, d) => cb(d)),
  onStats: (cb) => ipcRenderer.on('stats', (_e, d) => cb(d)),
  onEditMode: (cb) => ipcRenderer.on('edit-mode', (_e, v) => cb(v)),
  finishEdit: (layout) => ipcRenderer.send('edit:finish', layout),
});
