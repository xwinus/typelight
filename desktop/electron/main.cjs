const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, protocol, ipcMain, dialog, clipboard, session, Menu } = require('electron');
const { LibraryStore } = require('./library-store.cjs');
const { assetResponse } = require('./assets.cjs');
const { trustedFrame, validateMessage } = require('./policy.cjs');
const files = require('./files.cjs');
const { installMenu } = require('./menu.cjs');

app.setName('Typelight');
protocol.registerSchemesAsPrivileged([{ scheme: 'typelight', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);

function checkLegacyApp() {
  if (process.platform !== 'darwin') return;
  let pids = '';
  try { pids = execFileSync('/usr/bin/pgrep', ['-x', 'Typelight'], { encoding: 'utf8' }); }
  catch (error) { if (error.status === 1) return; throw error; }
  if (pids.trim().split(/\s+/).some(pid => Number(pid) !== process.pid)) {
    throw new Error('Quit the earlier Typelight app before opening this version. Your texts have not been changed.');
  }
}

// Where the window's own buttons sit. desktop/web/electron.css mirrors them for the help button.
const TRAFFIC_LIGHTS = { x: 18, y: 16 };

async function start({ dataDirectory = process.env.TYPELIGHT_DATA_DIR, show = true } = {}) {
  const directory = path.resolve(dataDirectory || path.join(app.getPath('appData'), 'Typelight'));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  app.setPath('userData', directory);
  if (!app.requestSingleInstanceLock()) { app.quit(); return null; }
  let window = null, ready = false, closing = false, quitting = false, mayClose = false;
  let library;
  const fail = error => dialog.showErrorBox('Your writing needs attention', error.message || String(error));
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  await app.whenReady();
  if (!dataDirectory) checkLegacyApp();
  library = new LibraryStore(directory);
  const root = path.resolve(__dirname, '../..');
  protocol.handle('typelight', request => assetResponse(request, root));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', event => event.preventDefault());

  ipcMain.on('typelight:seed', event => {
    event.returnValue = trustedFrame(event, window, true) ? library.values : {};
  });
  ipcMain.handle('typelight:request', async (event, message) => {
    if (!trustedFrame(event, window)) throw new Error('Untrusted desktop request.');
    validateMessage(message);
    switch (message.type) {
      case 'ready': ready = true; return true;
      case 'state': {
        const reading = Menu.getApplicationMenu()?.getMenuItemById('readingMode');
        if (reading) reading.checked = message.state?.reading === true;
        return true;
      }
      case 'save': library.replace(message.values); return true;
      case 'open': return files.openFiles(window);
      case 'export': return files.exportFile(window, message);
      case 'zoom': window.webContents.setZoomFactor(message.factor); return window.webContents.getZoomFactor();
    }
  });

  async function command(action) {
    if (!ready || closing || !window) return;
    try {
      if (action === 'backups') return await files.showBackups(library);
      if (action === 'restore') return await files.recoverSnapshot(window, library);
      if (action === 'print') return await files.printDocument(window);
      const value = await window.webContents.executeJavaScript(`window.typelightDesktop.command(${JSON.stringify(action)})`, true);
      if (action === 'copyText' && typeof value === 'string') clipboard.writeText(value);
    } catch (error) { fail(error); }
  }

  function createWindow() {
    ready = false; closing = false; mayClose = false;
    window = new BrowserWindow({ title: 'Typelight', width: 1180, height: 820, minWidth: 900, minHeight: 580,
      show: false, backgroundColor: '#14110f', titleBarStyle: 'hidden',
      ...(process.platform === 'darwin' ? { trafficLightPosition: TRAFFIC_LIGHTS } : {
        titleBarOverlay: { color: '#14110f', symbolColor: '#e8d9c3', height: 36 }, autoHideMenuBar: true,
      }),
      icon: path.join(root, 'icons/icon-512.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
        sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false,
        autoplayPolicy: 'no-user-gesture-required' },
    });
    // macOS can put the window buttons back in their default place (after tiling or a change
    // of size, for one); the help button in the page is placed opposite where they are set.
    if (process.platform === 'darwin') {
      const own = window;
      const keep = () => { if (!own.isDestroyed() && !own.isFullScreen()) own.setWindowButtonPosition(TRAFFIC_LIGHTS); };
      for (const event of ['resize', 'leave-full-screen', 'focus', 'show']) own.on(event, keep);
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('zoom-changed', (_event, direction) => command(direction === 'in' ? 'zoomIn' : 'zoomOut'));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('render-process-gone', () => {
      ready = false;
      fail(new Error('The writing surface stopped. Reopen Typelight to recover the last saved state. Automatic backups remain in your library folder.'));
    });
    window.once('ready-to-show', () => { if (show) window.show(); });
    window.on('close', event => {
      if (mayClose || !ready) return;
      event.preventDefault();
      if (closing) return;
      closing = true;
      let deadline;
      const timeout = new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Saving took too long. Keep the window open and export a copy.')), 15000);
      });
      Promise.race([window.webContents.executeJavaScript('window.typelightDesktop.flush()'), timeout])
        .then(() => { mayClose = true; window.close(); })
        .catch(error => {
          closing = false; quitting = false;
          window.webContents.executeJavaScript('window.typelightDesktop.unlock()').catch(() => {});
          fail(error);
        }).finally(() => clearTimeout(deadline));
    });
    window.on('closed', () => { window = null; ready = false; });
    window.loadURL('typelight://app/index.html').catch(fail);
    return window;
  }

  app.on('before-quit', event => {
    quitting = true;
    if (window && !mayClose && ready) { event.preventDefault(); window.close(); }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' || quitting) app.quit(); });
  app.on('activate', () => { if (!window) createWindow(); else window.show(); });
  installMenu(command);
  createWindow();
  return { getWindow: () => window, library, command };
}

module.exports = { start };
if (require.main === module) start().catch(error => {
  dialog.showErrorBox('Typelight could not open your library', error.message);
  app.exit(1);
});
