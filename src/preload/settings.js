// 設定ウィンドウ用 preload
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  setMica: (on) => ipcRenderer.invoke('ui:setMica', on),
  onMica: (cb) => ipcRenderer.on('mica', (_e, v) => cb(v)),
  saveCustomPreset: (v) => ipcRenderer.invoke('custompreset:save', v),
  removeCustomPreset: (i) => ipcRenderer.invoke('custompreset:remove', i),

  addWidget: (type) => ipcRenderer.invoke('widget:add', type),
  showAllWidgets: () => ipcRenderer.invoke('widgets:showAll'),
  parkedWidgets: () => ipcRenderer.invoke('widgets:parked'),
  removeWidget: (id) => ipcRenderer.invoke('widget:remove', id),
  updateWidget: (id, patch) => ipcRenderer.invoke('widget:update', id, patch),

  pickFile: () => ipcRenderer.invoke('file:pick'),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  pickImages: () => ipcRenderer.invoke('file:pickImages'),
  pickDir: () => ipcRenderer.invoke('dir:pick'),
  listThemes: () => ipcRenderer.invoke('theme:list'),
  applyTheme: (id) => ipcRenderer.invoke('theme:apply', id),

  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  saveLayout: (name) => ipcRenderer.invoke('layout:save', name),
  applyLayout: (i) => ipcRenderer.invoke('layout:apply', i),
  overwriteLayout: (i) => ipcRenderer.invoke('layout:overwrite', i),
  removeLayout: (i) => ipcRenderer.invoke('layout:remove', i),

  repair: () => ipcRenderer.invoke('app:repair'),
  uninstall: () => ipcRenderer.invoke('app:uninstall'),
  getUpdateStatus: () => ipcRenderer.invoke('update:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  failedHotkeys: () => ipcRenderer.invoke('hotkeys:failed'),
  captureForegroundApp: () => ipcRenderer.invoke('scene:foreground'),
  iconsAvailable: () => ipcRenderer.invoke('icons:available'),
  iconsCurrent: () => ipcRenderer.invoke('icons:current'),
  iconSnapshots: () => ipcRenderer.invoke('icons:snapshots'),
  saveIcons: (name, hidden) => ipcRenderer.invoke('icons:save', name, hidden),
  iconCapacity: () => ipcRenderer.invoke('icons:capacity'),
  iconAutoArrange: () => ipcRenderer.invoke('icons:autoArrange'),
  iconNames: () => ipcRenderer.invoke('icons:names'),
  strandedIcons: () => ipcRenderer.invoke('icons:stranded'),
  iconImage: (name) => ipcRenderer.invoke('icons:image', name),
  flushIconImages: () => ipcRenderer.invoke('icons:flushImages'),
  audioDevices: () => ipcRenderer.invoke('audio:devices'),
  getUrlIcon: (u) => ipcRenderer.invoke('icon:forUrl', u),
  showAllIcons: () => ipcRenderer.invoke('icons:showAll'),
  restoreIcons: (name) => ipcRenderer.invoke('icons:restore', name),
  setIconHidden: (name, hidden) => ipcRenderer.invoke('icons:setHidden', name, hidden),
  updateIconMode: (name, patch) => ipcRenderer.invoke('icons:updateMode', name, patch),
  setIconWallpaper: (name, on) => ipcRenderer.invoke('icons:setWallpaper', name, on),
  setIconTrigger: (name, trigger) => ipcRenderer.invoke('icons:setTrigger', name, trigger),
  setIconModeOn: (name, on) => ipcRenderer.invoke('icons:setOn', name, on),
  renameIconMode: (from, to) => ipcRenderer.invoke('icons:rename', from, to),
  reorderIconModes: (names) => ipcRenderer.invoke('icons:reorder', names),
  setIconWidgets: (name, link, ids) => ipcRenderer.invoke('icons:setWidgets', name, link, ids),
  setIconAlias: (name, label) => ipcRenderer.invoke('icons:setAlias', name, label),
  iconAliases: () => ipcRenderer.invoke('icons:aliases'),
  removeIconSnapshot: (name) => ipcRenderer.invoke('icons:remove', name),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (file) => ipcRenderer.invoke('backup:restore', file),
  removeBackup: (file) => ipcRenderer.invoke('backup:remove', file),
  revealBackups: () => ipcRenderer.invoke('backup:reveal'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  pickFolderItems: () => ipcRenderer.invoke('folder:pick'),
  // ドロップされた File 群を絶対パスへ (webUtils は preload でしか使えない)
  droppedPaths: (files) => {
    const out = [];
    for (const f of files) {
      try { const p = webUtils.getPathForFile(f); if (p) out.push(p); } catch (_) {}
    }
    return out;
  },
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
