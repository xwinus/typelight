const assert = require('node:assert/strict');

async function checkToolbarStability(window, command) {
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const bounds = () => evaluate(`(() => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return Object.fromEntries(['hud', 'bDrawer', 'bPages', 'bNew', 'bOpen', 'bSave', 'bFind', 'bLamp', 'bSound']
      .map(id => [id, box(document.getElementById(id))]));
  })()`);
  const baseline = await bounds();
  const counts = await evaluate(`(() => {
    const text = document.getElementById('ta').value;
    const pile = JSON.parse(window.typelightDesktop.get('typelight.drawer') || '{"pile":[]}').pile;
    const words = text => (text.match(/\\S+/g) || []).length;
    return { words: words(text), texts: pile.length + (text.trim() ? 1 : 0),
      libraryWords: pile.reduce((total, sheet) => total + words(sheet.text), words(text)) };
  })()`);
  const editorCount = await evaluate('document.getElementById("count").textContent');
  assert.equal(editorCount, counts.words + (counts.words === 1 ? ' word' : ' words'));
  const tools = ['bDrawer', 'bPages', 'bNew', 'bOpen', 'bSave', 'bFind', 'bLamp', 'bSound'];
  const visibleTools = () => evaluate(`Array.from(document.querySelectorAll('#hud nav button'))
    .filter(b => !b.hidden).sort((a,b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x).map(b => b.id)`);
  assert.deepEqual(await visibleTools(), tools, 'Every primary action has a visible icon, with no reserved holes');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#hud nav button'), b => b.id)"), tools,
    'Keyboard and accessibility order must match the visual order');
  for (let i = 1; i < tools.length; i++) {
    assert.equal(baseline[tools[i]].x - baseline[tools[i - 1]].x, 40, 'Every icon has the same spacing');
  }
  assert.equal(await evaluate('document.getElementById("bPages").disabled'), true,
    'Single-page documents keep a visible, disabled page overview');
  await command('bPages');
  assert.equal(await evaluate('document.documentElement.classList.contains("pages-open")'), false,
    'An unavailable page overview must not open');

  await command('bDrawer');
  const countState = await evaluate(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    const count = document.getElementById('count');
    return { label: count.textContent, title: count.title,
      heading: document.querySelector('.drawer-actions > span').textContent };
  })()`);
  const textCount = counts.texts.toLocaleString('en-US') + (counts.texts === 1 ? ' text' : ' texts');
  const librarySummary = textCount + ' · ' + counts.libraryWords.toLocaleString('en-US') +
    (counts.libraryWords === 1 ? ' word' : ' words');
  assert.equal(countState.label, textCount, 'Drawer shows a complete short text count');
  assert.equal(countState.heading, librarySummary, 'The exact summary belongs in the drawer header');
  assert.equal(countState.title, librarySummary, 'The full count remains available on hover');
  assert.deepEqual(await bounds(), baseline, 'Opening Drawer must not move controls or resize the panel');
  assert.deepEqual(await visibleTools(), tools, 'Opening Drawer cannot hide or replace primary actions');
  assert.equal(await evaluate(`Boolean(document.querySelector('#drawer .drawer-actions #bBackup:not([hidden])'))`), true,
    'Library backup belongs to the drawer, separate from current-text export');
  assert.equal(await evaluate(`(() => {
    const header = document.querySelector('.drawer-actions').getBoundingClientRect();
    const well = document.getElementById('well').getBoundingClientRect();
    const actionsAboveLight = Number(getComputedStyle(document.querySelector('.drawer-actions')).zIndex) >
      Number(getComputedStyle(document.querySelector('.drawer-gl')).zIndex);
    return header.height > 0 && well.top >= header.bottom - 1 && actionsAboveLight;
  })()`), true, 'Drawer actions must not cover the documents');
  await command('bDrawer');
  assert.deepEqual(await bounds(), baseline, 'Closing Drawer must keep the same targets');
  assert.equal(await evaluate('document.getElementById("count").textContent'), editorCount);

  const fit = await evaluate(`(() => {
    const count = document.getElementById('count'), previous = count.textContent;
    const results = [0, 1, 999, 1000, 12400, 999999, 12345678, 1000000000].map(value => {
      count.textContent = window.typelightCounts.countLabel(value, 'word', true);
      return { label: count.textContent, fits: count.scrollWidth <= count.clientWidth };
    });
    count.textContent = previous;
    return results;
  })()`);
  assert.ok(fit.every(result => result.fits), 'Compact counts must fit completely: ' + JSON.stringify(fit));

  const previous = await evaluate(`(() => {
    const count = document.getElementById('count'), pages = document.getElementById('bPages');
    const previous = { text: count.textContent, disabled: pages.disabled };
    count.textContent = '999 texts, 999,999 words in all — a very long status';
    pages.disabled = !pages.disabled;
    return previous;
  })()`);
  assert.deepEqual(await bounds(), baseline, 'Long counts and page availability must not move controls');
  await evaluate(`document.getElementById('count').textContent = ${JSON.stringify(previous.text)};
    document.getElementById('bPages').disabled = ${previous.disabled};`);

  await evaluate(`window.dispatchEvent(new CustomEvent('typelight:state', {
    detail: { error: 'Disk full', saving: false, title: 'Test' }
  }))`);
  assert.deepEqual(await bounds(), baseline, 'A save error must not displace the recovery controls');
  await evaluate(`window.dispatchEvent(new CustomEvent('typelight:state', {
    detail: { error: '', saving: false, title: 'Test' }
  }))`);
}

module.exports = { checkToolbarStability };
