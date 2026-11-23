const CHANNEL_TYPES = new Set(['ready', 'state', 'save', 'open', 'export']);

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
  return message;
}

module.exports = { trustedFrame, validateMessage };
