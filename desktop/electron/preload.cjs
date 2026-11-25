const { contextBridge, ipcRenderer } = require('electron');

let seed = ipcRenderer.sendSync('typelight:seed');
contextBridge.exposeInMainWorld('typelightHost', {
  takeSeed() { const values = seed; seed = null; return values; },
  saveChanges: true,
  platform: process.platform,
  postMessage: message => ipcRenderer.invoke('typelight:request', message),
});
