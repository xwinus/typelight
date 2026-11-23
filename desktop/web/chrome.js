(() => {
  if (!window.typelightHost) return;
  const drag = document.createElement('div');
  drag.className = 'window-drag';
  drag.setAttribute('aria-hidden', 'true');
  document.body.append(drag);
  document.documentElement.dataset.platform = window.typelightHost.platform;
  const stamp = document.createElement('div');
  stamp.className = 'desk-mark';
  stamp.setAttribute('aria-hidden', 'true');
  document.getElementById('desk').append(stamp);
  const actions = document.createElement('div');
  actions.className = 'drawer-actions';
  const heading = document.createElement('span');
  heading.textContent = 'Your texts';
  const backup = document.getElementById('bBackup');
  backup.textContent = 'Back up library';
  backup.setAttribute('aria-label', 'Back up library');
  actions.append(heading, backup);
  document.getElementById('drawer').prepend(actions);
  const nav = document.getElementById('hud').querySelector('nav');
  for (const id of ['bDrawer', 'bPages', 'bNew', 'bOpen', 'bSave', 'bFind', 'bLamp', 'bSound']) {
    nav.append(document.getElementById(id));
  }
  const status = document.createElement('span');
  status.className = 'desktop-status';
  status.setAttribute('role', 'status');
  document.getElementById('hud').querySelector('.brand').prepend(status);
  window.addEventListener('typelight:state', ({ detail }) => {
    const count = document.getElementById('count');
    const exact = count.dataset.exactCount || count.textContent;
    if (count.title !== exact) count.title = exact;
    const summary = detail.librarySummary || 'Your texts';
    if (heading.textContent !== summary) heading.textContent = summary;
    const text = detail.error ? 'Not saved — export a copy' : detail.saving ? 'Saving…' : 'Saved on this device';
    const error = String(Boolean(detail.error));
    const title = detail.error || 'Your writing stays on this device.';
    if (status.textContent !== text) status.textContent = text;
    if (status.dataset.error !== error) status.dataset.error = error;
    const saving = String(Boolean(detail.saving));
    if (status.dataset.saving !== saving) status.dataset.saving = saving;
    if (status.title !== title) status.title = title;
    document.title = (detail.title || 'Untitled') + ' — Typelight';
  });
})();
