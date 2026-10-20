const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
const on = (c) => (cb) => ipcRenderer.on(c, (_e, d) => cb(d));
contextBridge.exposeInMainWorld('tv', {
  library: inv('library:get'), addFolder: inv('library:addFolder'), removeFolder: inv('library:removeFolder'),
  info: inv('media:info'), devices: inv('cast:devices'), play: inv('cast:play'), pause: inv('cast:pause'),
  resume: inv('cast:resume'), stop: inv('cast:stop'), seek: inv('cast:seek'), volume: inv('cast:volume'),
  subtitle: inv('cast:subtitle'),
  onDevices: on('devices'), onStatus: on('status'), onError: on('error'),
});
