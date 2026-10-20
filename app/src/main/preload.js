const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
const on = (c) => (cb) => ipcRenderer.on(c, (_e, d) => cb(d));
contextBridge.exposeInMainWorld('tv', {
  library: inv('library:get'), addFolder: inv('library:addFolder'), removeFolder: inv('library:removeFolder'),
  rescan: inv('library:rescan'), markWatched: inv('library:markWatched'),
  setKeep: inv('library:setKeep'), setCleanup: inv('settings:setCleanup'), cleanupRun: inv('cleanup:run'),
  search: inv('discover:search'), providers: inv('discover:providers'), archiveDownload: inv('discover:download'),
  setTmdb: inv('settings:setTmdb'), chooseDownloadDir: inv('settings:chooseDownloadDir'),
  info: inv('media:info'), devices: inv('cast:devices'), play: inv('cast:play'), pause: inv('cast:pause'),
  resume: inv('cast:resume'), stop: inv('cast:stop'), seek: inv('cast:seek'), volume: inv('cast:volume'),
  subtitle: inv('cast:subtitle'), next: inv('cast:next'),
  dlAdd: inv('dl:add'), dlAddFile: inv('dl:addFile'), dlAddData: inv('dl:addData'), dlList: inv('dl:list'),
  dlPause: inv('dl:pause'), dlResume: inv('dl:resume'), dlRemove: inv('dl:remove'), dlReveal: inv('dl:reveal'),
  onDevices: on('devices'), onStatus: on('status'), onError: on('error'), onToast: on('toast'), onMeta: on('meta'),
  onDownloads: on('downloads'), onLibrary: on('library'), onProgress: on('progress'), onNowPlaying: on('nowplaying'), onEnded: on('ended'),
});
