'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');

async function checkWritingControls(window, runtime) {
  const evaluate = script => window.webContents.executeJavaScript(script, true);
  const waitFor = async (check, message) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(message);
  };
  const current = () => evaluate(`({ text: document.getElementById('ta').value,
    start: document.getElementById('ta').selectionStart, end: document.getElementById('ta').selectionEnd })`);
  await runtime.command('focus');
  const before = await current();
  await evaluate(`{
    const input = document.getElementById('ta');
    input.value = 'The current writing remains intact.';
    input.setSelectionRange(4, 11);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }`);
  const original = await current();
  await runtime.command('renameCurrent');
  assert.equal(await evaluate('document.activeElement.id'), 'currentTitleInput');
  await evaluate(`{
    document.getElementById('currentTitleInput').value = '  Příběh   na večer 🐎  ';
    document.querySelector('#renameTextDialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }`);
  await waitFor(() => evaluate('!document.getElementById("renameTextDialog").open'), 'Rename did not finish');
  assert.equal(await evaluate('window.typelightDesktop.get("typelight.title")'), 'Příběh na večer 🐎');
  assert.deepEqual(await current(), original, 'Renaming must not edit the text or its selection');
  assert.equal(await evaluate('document.activeElement.id'), 'ta');
  await runtime.command('undo');
  assert.equal((await current()).text, before.text, 'Renaming must preserve the existing undo history');
  await runtime.command('redo');
  assert.equal((await current()).text, original.text);
  assert.equal(await evaluate('window.typelightDesktop.get("typelight.title")'), 'Příběh na večer 🐎');

  await runtime.command('renameCurrent');
  await evaluate(`document.getElementById('currentTitleInput').value = 'Canceled title';
    document.getElementById('cancelCurrentTitle').click();`);
  await waitFor(() => evaluate('!document.getElementById("renameTextDialog").open'), 'Cancel did not close rename');
  assert.equal(await evaluate('window.typelightDesktop.get("typelight.title")'), 'Příběh na večer 🐎');
  await runtime.command('renameCurrent');
  window.webContents.focus();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(() => evaluate('!document.getElementById("renameTextDialog").open'), 'Escape did not cancel rename');

  await runtime.command('renameCurrent');
  await evaluate(`document.getElementById('currentTitleInput').value = 'x'.repeat(121);
    document.querySelector('#renameTextDialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));`);
  assert.equal(await evaluate('document.getElementById("renameTextDialog").open'), true);
  assert.match(await evaluate('document.getElementById("renameTextError").textContent'), /120 characters/);
  assert.equal(await evaluate('window.typelightDesktop.get("typelight.title")'), 'Příběh na večer 🐎');
  await evaluate('document.getElementById("cancelCurrentTitle").click()');
  await waitFor(() => evaluate('!document.getElementById("renameTextDialog").open'), 'Invalid rename did not cancel');

  window.webContents.focus();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F2' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F2' });
  await waitFor(() => evaluate('document.getElementById("renameTextDialog").open'), 'F2 did not open rename');
  await evaluate('document.getElementById("cancelCurrentTitle").click()');
  await waitFor(() => evaluate('!document.getElementById("renameTextDialog").open'), 'Keyboard rename did not cancel');

  await runtime.command('help');
  assert.equal(await evaluate('document.getElementById("currentTextName").textContent'), 'Příběh na večer 🐎');
  await evaluate(`{
    const volume = document.getElementById('writingVolume');
    volume.value = '35'; volume.dispatchEvent(new Event('input', { bubbles: true }));
    const sound = document.getElementById('writingSoundEnabled');
    sound.checked = false; sound.dispatchEvent(new Event('change', { bubbles: true }));
  }`);
  assert.equal(await evaluate('document.getElementById("writingVolumeValue").textContent'), '35%');
  await waitFor(() => {
    const prefs = JSON.parse(runtime.library.values['typelight.prefs'] || '{}');
    return prefs.volume === .35 && prefs.sound === false;
  }, 'Volume and mute were not saved');

  await evaluate('document.getElementById("closeHelp").click()');
  const loaded = once(window.webContents, 'did-finish-load');
  window.reload();
  await loaded;
  await waitFor(() => evaluate('Boolean(window.typelightDesktop && document.getElementById("writingVolume"))'),
    'Writing controls did not reload');
  await runtime.command('help');
  assert.equal(await evaluate('document.getElementById("writingVolume").value'), '35');
  assert.equal(await evaluate('document.getElementById("writingSoundEnabled").checked'), false);
  assert.equal(await evaluate('document.getElementById("currentTextName").textContent'), 'Příběh na večer 🐎');
  assert.equal((await current()).text, original.text);
  await evaluate(`{
    const volume = document.getElementById('writingVolume');
    volume.value = '0'; volume.dispatchEvent(new Event('input', { bubbles: true }));
    const sound = document.getElementById('writingSoundEnabled');
    sound.checked = true; sound.dispatchEvent(new Event('change', { bubbles: true }));
  }`);
  assert.equal(await evaluate('JSON.parse(window.typelightDesktop.get("typelight.prefs")).volume'), 0);
  await evaluate('document.getElementById("closeHelp").click()');
}

module.exports = { checkWritingControls };
