'use strict';

const assert = require('node:assert/strict');

async function checkFind(window, command) {
  const evaluate = script => window.webContents.executeJavaScript(script, true);
  const text = () => evaluate('document.getElementById("ta").value');
  const seed = 'Život and z\u030civot. A second život.';
  await evaluate(`{
    const input = document.getElementById('ta');
    input.value = ${JSON.stringify(seed)};
    input.setSelectionRange(0, 0);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await command('replace');
  await evaluate(`{
    document.getElementById('findIn').value = 'zivot';
    document.getElementById('findIn').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('replaceIn').value = '$&';
  }`);
  assert.equal(await evaluate('document.getElementById("findN").textContent'), '1 of 3');
  assert.equal(await evaluate('document.getElementById("replaceRow").hidden'), false);
  await evaluate('document.getElementById("replaceAll").click()');
  assert.equal(await text(), '$& and $&. A second $&.');
  assert.match(await evaluate('document.getElementById("replaceStatus").textContent'), /3 occurrences/);
  await command('undo');
  assert.equal(await text(), seed, 'One undo must restore all replacements');
  await command('redo');
  assert.equal(await text(), '$& and $&. A second $&.');
  await command('undo');

  await command('replace');
  await evaluate('document.getElementById("replaceIn").value = "story"; document.getElementById("replaceOne").click()');
  assert.equal(await text(), 'story and z\u030civot. A second život.');
  await command('undo');
  assert.equal(await text(), seed, 'Replace one must also be a separate undo step');

  await command('replace');
  await command('bDrawer');
  assert.equal(await evaluate('document.getElementById("replaceAll").disabled'), true);
  await evaluate('document.getElementById("replaceAll").click()');
  assert.equal(await text(), seed, 'Finding in the drawer cannot replace other documents');
  await command('bDrawer');

  await evaluate(`{
    document.getElementById('findIn').value = '';
    document.getElementById('findIn').dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  assert.equal(await evaluate('document.getElementById("replaceOne").disabled'), true);
  assert.equal(await text(), seed);
  window.setSize(900, 580);
  window.webContents.setZoomFactor(2);
  await new Promise(resolve => setTimeout(resolve, 100));
  const bounds = await evaluate(`(() => {
    const r = document.getElementById('find').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight };
  })()`);
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1,
    'Find and replace stays within the viewport at 200% zoom');
  window.webContents.setZoomFactor(1);
  window.setSize(1180, 820);
  await evaluate('document.getElementById("findClose").click()');
  assert.equal(await evaluate('document.activeElement.id'), 'ta');
}

module.exports = { checkFind };
