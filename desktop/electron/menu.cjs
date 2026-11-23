const { Menu } = require('electron');

function installMenu(command) {
  const item = (label, action, accelerator) => ({ label, accelerator, click: () => command(action) });
  const separator = { type: 'separator' };
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      item('New Text', 'bNew', 'CmdOrCtrl+N'), item('Open…', 'bOpen', 'CmdOrCtrl+O'),
      item('Export Text…', 'bSave', 'CmdOrCtrl+S'), item('Back Up Library…', 'bBackup', 'CmdOrCtrl+Shift+S'),
      separator, item('Show Automatic Backups', 'backups'), item('Recover from Snapshot…', 'restore'),
      separator, item('Print…', 'print', 'CmdOrCtrl+P'), separator,
      { role: process.platform === 'darwin' ? 'close' : 'quit' },
    ] },
    { label: 'Edit', submenu: [
      item('Undo', 'undo', 'CmdOrCtrl+Z'), item('Redo', 'redo', 'CmdOrCtrl+Shift+Z'), separator,
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      item('Copy Entire Text', 'copyText', 'CmdOrCtrl+Shift+C'), separator,
      item('Find…', 'bFind', 'CmdOrCtrl+F'),
    ] },
    { label: 'View', submenu: [
      item('Drawer', 'bDrawer', 'CmdOrCtrl+Shift+D'), item('Page Overview', 'bPages', 'CmdOrCtrl+Shift+P'),
      item('Return to Writing', 'focus', 'CmdOrCtrl+1'), separator,
      item('Adjust Lamplight', 'bLamp', 'CmdOrCtrl+Shift+L'),
      item('Toggle Typewriter Sound', 'bSound', 'CmdOrCtrl+Shift+M'), separator,
      { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installMenu };
