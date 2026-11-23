const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');

function chrome() {
  const elements = [], listeners = {};
  const brand = { prepend(element) { this.status = element; } };
  const count = { textContent: '999 texts', dataset: { exactCount: '999 texts · 999,999 words' } };
  const backup = { setAttribute(key, value) { this[key] = value; } };
  const drawer = { prepend(element) { this.actions = element; } };
  const desk = { append(element) { this.stamp = element; } };
  const nav = { children: [], append(element) { this.children.push(element); } };
  const document = {
    body: { append() {} }, documentElement: { dataset: {} },
    createElement() {
      const element = { dataset: {}, append(...children) { this.children = children; },
        setAttribute(key, value) { this[key] = value; } };
      elements.push(element);
      return element;
    },
    getElementById(id) {
      return { count, bBackup: backup, drawer, desk }[id] || (id === 'hud' ?
        { querySelector: selector => selector === 'nav' ? nav : brand } : { id });
    },
  };
  const window = { typelightHost: { platform: 'darwin' }, addEventListener(name, callback) { listeners[name] = callback; } };
  vm.runInNewContext(fs.readFileSync('desktop/web/chrome.js', 'utf8'), { window, document });
  return { document, status: brand.status, report: detail => listeners['typelight:state']({ detail }) };
}

test('saved state keeps an accessible description beside the word count', () => {
  const ui = chrome();
  ui.report({ title: 'My text', saving: false, error: '', librarySummary: '999 texts · 999,999 words' });
  assert.equal(ui.status.role, 'status');
  assert.equal(ui.document.getElementById('desk').stamp.className, 'desk-mark');
  assert.equal(ui.document.getElementById('desk').stamp['aria-hidden'], 'true');
  assert.equal(ui.status.textContent, 'Saved on this device');
  assert.equal(ui.status.dataset.error, 'false');
  assert.equal(ui.document.title, 'My text — Typelight');
  assert.equal(ui.document.getElementById('count').title, '999 texts · 999,999 words');
  assert.equal(ui.document.getElementById('drawer').actions.children[0].textContent, '999 texts · 999,999 words');
  assert.equal(ui.document.getElementById('drawer').actions.children[1], ui.document.getElementById('bBackup'));
  assert.equal(ui.document.getElementById('bBackup')['aria-label'], 'Back up library');
  assert.deepEqual(ui.document.getElementById('hud').querySelector('nav').children.map(b => b.id),
    ['bDrawer', 'bPages', 'bNew', 'bOpen', 'bSave', 'bFind', 'bLamp', 'bSound']);
});

test('an unnamed text can show pending save status without a permanent second line', () => {
  const ui = chrome();
  ui.report({ saving: true });
  assert.equal(ui.status.dataset.saving, 'true');
  assert.equal(ui.status.textContent, 'Saving…');
  assert.equal(ui.document.title, 'Untitled — Typelight');
});

test('save errors stay explicit and clear after a successful retry', () => {
  const ui = chrome();
  ui.report({ error: 'Disk full', saving: false });
  assert.equal(ui.status.dataset.error, 'true');
  assert.equal(ui.status.title, 'Disk full');
  assert.equal(ui.status.textContent, 'Not saved — export a copy');
  ui.report({ error: '', saving: false });
  assert.equal(ui.status.dataset.error, 'false');
  assert.equal(ui.status.textContent, 'Saved on this device');
});
