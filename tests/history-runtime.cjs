'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function checkHistory(window, runtime) {
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const waitFor = async (check, message) => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(message);
  };
  const current = await evaluate('document.getElementById("ta").value');
  const before = JSON.parse(runtime.library.values['typelight.drawer'] || '{"pile":[],"bin":[]}');
  const copiesBefore = before.pile.filter(item => item.text === current).length;
  const id = `library-${Date.now()}-history-test.json`;
  const invalidId = `library-${Date.now()}-history-invalid.json`;
  const file = path.join(runtime.library.backupsDirectory, id);
  const invalid = path.join(runtime.library.backupsDirectory, invalidId);
  fs.mkdirSync(runtime.library.backupsDirectory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, values: {
    'typelight.text': current, 'typelight.title': '<em>A past title</em>', 'typelight.edited': '1234',
  } }));
  fs.writeFileSync(invalid, '{incomplete');
  try {
    await runtime.command('history');
    assert.equal(await evaluate('document.getElementById("versionHistory").open'), true);
    await evaluate(`{
      const versions = document.getElementById('historySnapshots');
      versions.value = ${JSON.stringify(invalidId)};
      versions.dispatchEvent(new Event('change'));
    }`);
    await waitFor(() => evaluate('Boolean(document.getElementById("historyError").textContent)'),
      'An unreadable snapshot must report an error');
    assert.equal(await evaluate('document.getElementById("historyRestore").disabled'), true);
    assert.equal(await evaluate('document.getElementById("ta").value'), current);

    await evaluate(`{
      const versions = document.getElementById('historySnapshots');
      versions.value = ${JSON.stringify(id)};
      versions.dispatchEvent(new Event('change'));
    }`);
    await waitFor(() => evaluate('!document.getElementById("historyRestore").disabled'),
      'A valid snapshot must show a restorable preview');
    assert.equal(await evaluate('document.getElementById("historyPreview").textContent'), current || '(Empty text)');
    assert.equal(await evaluate('document.getElementById("historyDocuments").options[0].textContent'), '<em>A past title</em> · Writing desk');
    assert.equal(await evaluate('document.querySelector("#versionHistory em")'), null);
    await evaluate('document.getElementById("historyRestore").click()');
    await waitFor(() => evaluate('document.getElementById("historyStatus").textContent.includes("A new copy is saved")'),
      'Restoration must await a saved independent copy');
    const after = JSON.parse(runtime.library.values['typelight.drawer']);
    assert.equal(after.pile.length, before.pile.length + 1);
    assert.equal(after.pile.filter(item => item.text === current).length, copiesBefore + 1);
    assert.equal(new Set([...after.pile, ...after.bin].map(item => item.id)).size, after.pile.length + after.bin.length);
    assert.equal(await evaluate('document.getElementById("ta").value'), current);
    assert.equal(await evaluate('document.getElementById("historyRestore").disabled'), true);
    await evaluate('document.getElementById("historyClose").click()');
    assert.equal(await evaluate('document.getElementById("versionHistory").open'), false);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(invalid, { force: true });
  }
}

module.exports = { checkHistory };
