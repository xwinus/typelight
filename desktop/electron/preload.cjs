const { contextBridge, ipcRenderer } = require('electron');

const seed = ipcRenderer.sendSync('typelight:seed');
contextBridge.exposeInMainWorld('typelightHost', {
  seed,
  platform: process.platform,
  postMessage: message => ipcRenderer.invoke('typelight:request', message),
});
