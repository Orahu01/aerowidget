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
  onEditMode: (cb) => ipcRenderer.on('edit-mode', (_e, v) => cb(v)),
  onPower: (cb) => ipcRenderer.on('power', (_e, d) => cb(d)),
  onFontsChanged: (cb) => ipcRenderer.on('fonts-changed', () => cb()),
  editLive: (id, partial) => ipcRenderer.send('edit:live', id, partial),
  finishEdit: () => ipcRenderer.send('edit:finish'),
});
