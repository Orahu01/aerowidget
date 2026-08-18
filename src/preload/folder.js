// フォルダウィジェットウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const wid = new URLSearchParams(location.search).get('wid');

contextBridge.exposeInMainWorld('fw', {
  id: wid,
  getState: () => ipcRenderer.invoke('folder:state', wid),
  getIcon: (p) => ipcRenderer.invoke('icon:get', p),
  launch: (p) => ipcRenderer.send('folder:launch', wid, p),
  onWidget: (cb) => ipcRenderer.on('fw', (_e, w) => cb(w)),
  onConfig: (cb) => ipcRenderer.on('config', (_e, env) => cb(env)),
  onFontsChanged: (cb) => ipcRenderer.on('fonts-changed', () => cb()),
  getFontsCss: () => ipcRenderer.invoke('fonts:css'),
});
