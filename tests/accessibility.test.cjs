const test = require('node:test');
const assert = require('node:assert/strict');
const { preferences, nextZoom, documentName, saveAnnouncements } = require('../editor/accessibility.js');
const { position } = require('../editor/tooltips.js');
const { validateMessage } = require('../desktop/electron/policy.cjs');

test('reading and zoom preferences preserve supported values', () => {
  assert.deepEqual(preferences({ reading: true, zoom: 1.5 }), { reading: true, zoom: 1.5 });
  assert.equal(nextZoom(1.5, 'zoomIn'), 1.75);
  assert.equal(nextZoom(1.5, 'zoomOut'), 1.25);
  assert.equal(nextZoom(2, 'zoomReset'), 1);
});
test('zoom stops at the supported bounds and old preferences retain defaults', () => {
  assert.equal(nextZoom(2, 'zoomIn'), 2);
  assert.equal(nextZoom(.75, 'zoomOut'), .75);
  assert.deepEqual(preferences({ sound: false }), { reading: false, zoom: 1 });
});
test('malformed preferences cannot inject unusable zoom or reading values', () => {
  for (const p of [null, undefined, 'invalid', { reading: 'true', zoom: NaN }, { zoom: -1 }, { zoom: Infinity }]) {
    assert.deepEqual(preferences(p), { reading: false, zoom: 1 });
  }
  assert.throws(() => nextZoom(1, 'execute'), /Unknown zoom/);
});

test('zoom requests accept the supported desktop magnification levels', () => {
  for (const factor of [.75, 1, 1.25, 1.5, 1.75, 2]) assert.equal(validateMessage({ type: 'zoom', factor }).factor, factor);
});
test('zoom requests reject invalid and missing factors before the window API', () => {
  for (const factor of [0, -1, 20, NaN, Infinity, '2', undefined]) {
    assert.throws(() => validateMessage({ type: 'zoom', factor }), /Invalid zoom/);
  }
});
test('zoom validation leaves a valid request unchanged', () => {
  const request = Object.freeze({ type: 'zoom', factor: 2 });
  assert.equal(validateMessage(request), request);
});

test('document names prefer the title without repeating the body', () => {
  assert.equal(documentName({ title: '  My   draft ', text: 'Private paragraph '.repeat(100) }), 'My draft');
});
test('unnamed and long documents get a short useful label', () => {
  assert.equal(documentName({ text: 'First line\nSecond line' }), 'First line Second line');
  const result = documentName({ text: 'a'.repeat(900) });
  assert.ok(result.length <= 64);
  assert.ok(result.endsWith('…'));
});
test('missing or malformed document names have a safe fallback', () => {
  for (const sheet of [null, {}, { title: {}, text: 42 }, { title: '  ', text: '\n' }]) {
    assert.equal(documentName(sheet), 'Untitled text');
  }
});

test('routine saves do not generate live announcements', () => {
  const report = saveAnnouncements();
  for (const saving of [false, true, false, true, false]) assert.deepEqual(report('', saving), { alert: '', status: '' });
});
test('a persistent failure is announced once and recovery waits for a completed save', () => {
  const report = saveAnnouncements();
  assert.match(report('Disk full', false).alert, /Disk full/);
  assert.equal(report('Disk full', true).alert, '');
  assert.equal(report('', true).status, '');
  assert.match(report('', false).status, /saved again/);
  assert.equal(report('', false).status, '');
});
test('a changed error is announced and malformed reports do not announce success', () => {
  const report = saveAnnouncements();
  report('Disk full', false);
  assert.match(report('Permission denied', false).alert, /Permission denied/);
  assert.equal(report(null, true).status, '');
});

test('tooltip placement sits above the target when space is available', () => {
  assert.deepEqual(position({ left: 100, top: 100, bottom: 136, width: 36 },
    { width: 100, height: 30 }, { width: 900, height: 580 }), { left: 68, top: 62 });
});
test('tooltips stay inside the viewport at top and side edges', () => {
  assert.deepEqual(position({ left: 0, top: 0, bottom: 36, width: 36 },
    { width: 100, height: 30 }, { width: 450, height: 290 }), { left: 8, top: 44 });
  assert.equal(position({ left: 440, top: 100, bottom: 136, width: 36 },
    { width: 100, height: 30 }, { width: 450, height: 290 }).left, 342);
});
test('invalid tooltip geometry fails explicitly', () => {
  assert.throws(() => position({ left: NaN, top: 0, bottom: 36, width: 36 },
    { width: 100, height: 30 }, { width: 900, height: 580 }), /Invalid tooltip/);
});
