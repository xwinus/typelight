'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');

async function checkDocumentSession(window, runtime) {
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const pause = (milliseconds = 40) => new Promise(resolve => setTimeout(resolve, milliseconds));
  const state = () => evaluate(`(() => {
    const t = document.getElementById('ta');
    return { text: t.value, start: t.selectionStart, end: t.selectionEnd, direction: t.selectionDirection };
  })()`);
  const savedPosition = () => evaluate(`(async () => {
    await window.typelightDesktop.flush();
    window.typelightDesktop.unlock();
    return JSON.parse(window.typelightDesktop.get('typelight.document'));
  })()`);
  const select = async (start, end, direction = 'forward') => {
    await evaluate(`{
      const t = document.getElementById('ta'); t.focus();
      t.setSelectionRange(${start}, ${end}, ${JSON.stringify(direction)});
      t.dispatchEvent(new Event('select'));
    }`);
    await pause();
  };
  const create = async text => {
    await runtime.command('bNew');
    assert.equal((await state()).text, '', 'New text starts on an empty sheet');
    await window.webContents.insertText(text);
    await pause();
    assert.equal((await state()).text, text);
    return (await savedPosition()).id;
  };
  const switchTo = async id => {
    await runtime.command('bDrawer');
    assert.equal(await evaluate('document.documentElement.classList.contains("drawer-open")'), true);
    await evaluate(`(() => {
      const leaf = [...document.querySelectorAll('#pile .leaf')].find(item => item.dataset.id === ${JSON.stringify(id)});
      if (!leaf) throw new Error('The requested document is missing from the drawer.');
      leaf.click();
    })()`);
    await pause();
    assert.equal(await evaluate('document.documentElement.classList.contains("drawer-open")'), false);
    assert.equal((await savedPosition()).id, id, 'Switching preserves the document identity');
  };
  const expectSelection = async (start, end, direction) => {
    const current = await state();
    assert.deepEqual([current.start, current.end, current.direction], [start, end, direction]);
  };
  window.webContents.focus();

  const originalA = 'Session A: alpha beta\n' + Array.from({ length: 180 }, (_, i) => `Reading line ${i + 1}.`).join('\n');
  const changedA = originalA.replace('alpha', 'ALPHA');
  const originalB = 'Session B: gamma delta';
  const changedB = originalB.replace('gamma', 'GAMMA');
  const idA = await create(originalA);
  await select(11, 16, 'backward');
  await window.webContents.insertText('ALPHA');
  assert.equal((await state()).text, changedA);
  await select(17, 21, 'backward');

  const idB = await create(originalB);
  assert.notEqual(idA, idB, 'New documents receive independent identities');
  await select(11, 16);
  await window.webContents.insertText('GAMMA');
  await select(4, 9);
  const storedA = await evaluate(`JSON.parse(window.typelightDesktop.get('typelight.drawer')).pile.find(item => item.id === ${JSON.stringify(idA)})`);
  assert.equal(storedA.text, changedA);
  assert.deepEqual([storedA.position.anchor, storedA.position.caret], [21, 17],
    'Putting a document away preserves a backward selection');

  await switchTo(idA);
  assert.equal((await state()).text, changedA);
  await expectSelection(17, 21, 'backward');
  await runtime.command('undo');
  assert.equal((await state()).text, originalA, 'Undo on A restores A before its replacement');
  await expectSelection(11, 16, 'backward');

  await switchTo(idB);
  assert.equal((await state()).text, changedB, 'Undo on A must leave B unchanged');
  await expectSelection(4, 9, 'forward');
  await runtime.command('undo');
  assert.equal((await state()).text, originalB, 'B retains its own undo stack');
  await runtime.command('redo');
  assert.equal((await state()).text, changedB);

  await switchTo(idA);
  assert.equal((await state()).text, originalA);
  await runtime.command('redo');
  assert.equal((await state()).text, changedA, 'A retains redo while another document is edited');

  await select(changedA.length - 12, changedA.length - 3, 'backward');
  const beforeScroll = await savedPosition();
  await evaluate('document.getElementById("ta").focus()');
  for (let i = 0; i < 2; i++) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'PageUp' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'PageUp' });
    await pause();
  }
  const reading = await savedPosition();
  assert.ok(reading.view < beforeScroll.view, 'PageUp changes the saved reading position');
  assert.deepEqual([reading.anchor, reading.caret], [beforeScroll.anchor, beforeScroll.caret],
    'Reading earlier pages leaves the selection intact');
  await switchTo(idB);
  await switchTo(idA);
  assert.deepEqual(await savedPosition(), reading, 'Switching back restores both selection and reading position');

  // Capture the restored layout again, rather than only inspecting the old persisted metadata.
  const loaded = once(window.webContents, 'did-finish-load');
  window.webContents.reload();
  await loaded;
  await pause(150);
  assert.equal((await state()).text, changedA, 'Reload retains the active document text');
  await expectSelection(changedA.length - 12, changedA.length - 3, 'backward');
  assert.deepEqual(await savedPosition(), reading, 'Reload restores identity, selection and the reading position');
  await switchTo(idB);
  assert.equal((await state()).text, changedB, 'The second document also survives reload');
}

module.exports = { checkDocumentSession };
