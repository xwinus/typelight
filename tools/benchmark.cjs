'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { CASES } = require('../tests/performance-fixtures.cjs');

async function run() {
  const selected = process.argv.slice(2);
  const names = selected.length ? selected : Object.keys(CASES);
  if (names.some(name => !Object.hasOwn(CASES, name))) throw new Error('Use small, novel, stress or paragraph.');
  const directory = path.resolve('build/performance', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(directory, { recursive: true });
  console.log('Performance reports: ' + directory);
  for (const name of names) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), ['tests/performance-runtime.cjs'], {
        stdio: 'inherit', env: { ...process.env, TYPELIGHT_PERF_CASE: name,
          TYPELIGHT_PERF_REPORT: path.join(directory, name + '.json') },
      });
      child.once('error', reject);
      child.once('exit', code => resolve(code));
    });
    if (code !== 0) throw new Error('Performance case failed: ' + name);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
