const { SNAPSHOT_ID } = require('./history.cjs');
const CHANNEL_TYPES = new Set(['ready', 'state', 'save', 'save-changes', 'open', 'export', 'zoom',
  'history-list', 'history-contents', 'history-document']);

function trustedFrame(event, window, seed = false) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      !event.senderFrame || event.senderFrame !== window.webContents.mainFrame) return false;
  const url = event.senderFrame.url;
  return url === 'typelight://app/index.html' || (seed && (!url || url === 'about:blank'));
}

function validateMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || !CHANNEL_TYPES.has(message.type)) {
    throw new Error('Unsupported desktop request.');
  }
  if (message.type === 'export' && (typeof message.name !== 'string' ||
      typeof message.content !== 'string' || !message.name || message.name.includes('\0'))) {
    throw new Error('Invalid export.');
  }
  if (message.type === 'zoom' && ![.75, 1, 1.25, 1.5, 1.75, 2].includes(message.factor)) {
    throw new Error('Invalid zoom factor.');
  }
  if (['history-contents', 'history-document'].includes(message.type) &&
      (typeof message.id !== 'string' || !SNAPSHOT_ID.test(message.id))) {
    throw new Error('Invalid snapshot identifier.');
  }
  if (message.type === 'history-document' && (!Number.isSafeInteger(message.index) || message.index < 0 ||
      typeof message.revision !== 'string' || !/^[a-f0-9]{64}$/.test(message.revision))) {
    throw new Error('Invalid snapshot document.');
  }
  return message;
}

module.exports = { trustedFrame, validateMessage };
