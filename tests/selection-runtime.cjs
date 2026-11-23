const assert = require('node:assert/strict');

async function checkSelection(window, command) {
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const pause = () => new Promise(resolve => setTimeout(resolve, 30));
  const state = () => evaluate(`(() => {
    const t = document.getElementById('ta');
    return { text: t.value, start: t.selectionStart, end: t.selectionEnd,
      direction: t.selectionDirection, highlighted: document.querySelectorAll('.ln.selected').length };
  })()`);
  const setText = async text => {
    await evaluate(`{
      const t = document.getElementById('ta'); t.focus(); t.value = ${JSON.stringify(text)};
      t.setSelectionRange(t.value.length, t.value.length);
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await pause();
  };
  const select = async (start, end, direction = 'forward') => {
    await evaluate(`{
      const t = document.getElementById('ta'); t.focus();
      t.setSelectionRange(${start}, ${end}, '${direction}'); t.dispatchEvent(new Event('select'));
    }`);
    await pause();
  };
  const key = async (keyCode, modifiers = []) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause();
  };
  const clipboard = type => evaluate(`(() => {
    const data = new DataTransfer(), t = document.getElementById('ta');
    t.dispatchEvent(new ClipboardEvent('${type}', { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData('text/plain');
  })()`);
  window.webContents.focus();

  await setText('One two\nPříliš žluťoučký kůň.');
  await select(4, 7);
  assert.equal((await state()).highlighted, 1, 'The native selection must appear on the paper');
  assert.equal(await clipboard('copy'), 'two');
  assert.equal((await state()).text, 'One two\nPříliš žluťoučký kůň.');
  await window.webContents.insertText('three');
  assert.equal((await state()).text, 'One three\nPříliš žluťoučký kůň.');
  await command('undo');
  let current = await state();
  assert.equal(current.text, 'One two\nPříliš žluťoučký kůň.');
  assert.deepEqual([current.start, current.end], [4, 7], 'Undo restores the replaced range');
  await command('redo');
  assert.equal((await state()).text, 'One three\nPříliš žluťoučký kůň.');

  await select(4, 9, 'backward');
  assert.equal(await clipboard('cut'), 'three');
  assert.equal((await state()).text, 'One \nPříliš žluťoučký kůň.');
  await command('undo');
  current = await state();
  assert.equal(current.direction, 'backward');
  assert.deepEqual([current.start, current.end], [4, 9]);
  await key('Right');
  current = await state();
  assert.deepEqual([current.start, current.end], [9, 9], 'An unmodified arrow collapses the selection');
  await key('Left', ['shift']);
  assert.deepEqual([(await state()).start, (await state()).end], [8, 9]);
  await key('Left', ['shift']);
  assert.deepEqual([(await state()).start, (await state()).end], [7, 9]);
  await key('Right', ['shift']);
  assert.deepEqual([(await state()).start, (await state()).end], [8, 9], 'Reversing Shift+Arrow shrinks the range');
  await key('Escape');
  assert.deepEqual([(await state()).start, (await state()).end], [8, 8]);

  await key('A', [process.platform === 'darwin' ? 'meta' : 'control']);
  current = await state();
  assert.deepEqual([current.start, current.end], [0, current.text.length]);
  assert.ok(current.highlighted >= 2, 'Select All highlights every visible selected line');
  await key('Left');
  window.webContents.selectAll();
  await pause();
  assert.deepEqual([(await state()).start, (await state()).end], [0, current.text.length],
    'Native Edit menu Select All is mirrored on the paper');
  await key('Backspace');
  assert.equal((await state()).text, '');
  await command('undo');
  assert.equal((await state()).text, current.text);

  await setText('Ahoj svete');
  await select(5, 10, 'backward');
  await evaluate(`{
    const t = document.getElementById('ta');
    t.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    t.setRangeText('s', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 's', isComposing: true }));
    t.setRangeText('š', 5, 6, 'end');
    t.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'š', isComposing: true }));
    t.dispatchEvent(new CompositionEvent('compositionend', { data: 'š', bubbles: true }));
  }`);
  assert.equal((await state()).text, 'Ahoj š');
  await command('undo');
  assert.equal((await state()).text, 'Ahoj svete', 'Composition replacement is one undo step');
  assert.equal((await state()).direction, 'backward');

  await select(5, 10);
  await window.webContents.insertText('světe\nnový\třádek');
  assert.equal((await state()).text, 'Ahoj světe\nnový    řádek', 'Multiline paste replaces the selection and normalizes tabs');
  await command('undo');
  assert.equal((await state()).text, 'Ahoj svete');
  await key(']', [process.platform === 'darwin' ? 'meta' : 'control']);
  assert.equal((await state()).text, 'Ahoj     ', 'Indent replaces the selected range');
  await command('undo');

  // Real pointer events exercise capture and the rendered hit-testing geometry.
  await setText('Alpha beta gamma\nSecond line\nThird line');
  await select(0, 0);
  await new Promise(resolve => setTimeout(resolve, 400));
  const geometry = await evaluate(`(() => {
    const lines = [...document.querySelectorAll('#lines .ln')];
    const r = lines[0].getBoundingClientRect();
    return { x: r.x, y: r.y + r.height / 2,
      width: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chw')),
      height: r.height, transform: getComputedStyle(document.getElementById('lines')).transform };
  })()`);
  const mouse = (type, x, y, extra = {}) => window.webContents.sendInputEvent({
    type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra,
  });
  mouse('mouseDown', geometry.x + geometry.width * 6, geometry.y);
  mouse('mouseMove', geometry.x + geometry.width * 10, geometry.y, { modifiers: ['leftButtonDown'] });
  await pause();
  assert.equal(await evaluate("getComputedStyle(document.getElementById('lines')).transform"), geometry.transform,
    'Dragging must not move the paper beneath the pointer');
  mouse('mouseUp', geometry.x + geometry.width * 10, geometry.y);
  await pause();
  assert.equal(await clipboard('copy'), 'beta');

  mouse('mouseDown', geometry.x + geometry.width * 10, geometry.y);
  mouse('mouseMove', geometry.x + geometry.width * 2, geometry.y, { modifiers: ['leftButtonDown'] });
  mouse('mouseUp', geometry.x + geometry.width * 2, geometry.y);
  await pause();
  current = await state();
  assert.deepEqual([current.start, current.end, current.direction], [2, 10, 'backward']);

  mouse('mouseDown', geometry.x + geometry.width * 7, geometry.y);
  mouse('mouseUp', geometry.x + geometry.width * 7, geometry.y);
  mouse('mouseDown', geometry.x + geometry.width * 7, geometry.y, { clickCount: 2 });
  mouse('mouseUp', geometry.x + geometry.width * 7, geometry.y, { clickCount: 2 });
  await pause();
  assert.equal(await clipboard('copy'), 'beta', 'Double-click selects a word');

  mouse('mouseDown', geometry.x + geometry.width * 6, geometry.y);
  mouse('mouseMove', geometry.x + geometry.width * 6, geometry.y + geometry.height,
    { modifiers: ['leftButtonDown'] });
  mouse('mouseUp', geometry.x + geometry.width * 6, geometry.y + geometry.height);
  await pause();
  assert.equal(await clipboard('copy'), 'beta gamma\nSecond', 'Dragging across lines includes the newline');

  await select(0, 0);
  await key('Down', ['shift']);
  assert.equal(await clipboard('copy'), 'Alpha beta gamma\n');
  await key('End', ['shift']);
  assert.equal(await clipboard('copy'), 'Alpha beta gamma\nSecond line');

  await setText('A line of text.\n'.repeat(100));
  await select(0, 0);
  await key('PageDown', ['shift']);
  current = await state();
  assert.ok(current.end > 16 && current.start === 0, 'Shift+PageDown extends through visible lines');
  window.webContents.selectAll();
  await pause();
  assert.equal((await state()).end, 1600, 'Select All includes offscreen pages');
  assert.equal(await clipboard('copy'), 'A line of text.\n'.repeat(100));
  await key('Delete');
  assert.equal((await state()).text, '');
  await command('undo');
  assert.equal((await state()).text.length, 1600, 'Undo restores a selection spanning pages');

  await setText('abc');
  await select(3, 3);
  await window.webContents.insertText('d');
  await window.webContents.insertText('e');
  await evaluate(`{
    const t = document.getElementById('ta');
    t.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true }));
    t.setRangeText('P', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
  }`);
  await window.webContents.insertText('q');
  await command('undo');
  assert.equal((await state()).text, 'abcdeP', 'Typing after a paste starts its own undo step');
  await command('undo');
  assert.equal((await state()).text, 'abcde', 'Paste is a separate undo step');
  await command('undo');
  assert.equal((await state()).text, 'abc', 'A continuous typing run still undoes together');

  await setText('');
  await key('A', [process.platform === 'darwin' ? 'meta' : 'control']);
  assert.equal(await clipboard('cut'), '');
  assert.equal((await state()).text, '');
}

module.exports = { checkSelection };
