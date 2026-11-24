'use strict';

const fs = require('node:fs');

function desktopMatrix(event, platform = 'all') {
  if (!['push', 'workflow_dispatch'].includes(event)) throw new Error('Unsupported desktop build event.');
  const selected = event === 'push' ? 'all' : platform;
  if (!['all', 'mac', 'win', 'linux'].includes(selected)) throw new Error('Unsupported desktop platform.');
  const targets = [
    { os: 'macos-latest', target: 'mac', arch: 'arm64' },
    { os: 'macos-15-intel', target: 'mac', arch: 'x64' },
    { os: 'windows-latest', target: 'win', arch: 'x64' },
    { os: 'ubuntu-latest', target: 'linux', arch: 'x64' },
  ];
  return { include: targets.filter(target => selected === 'all' || target.target === selected) };
}

if (require.main === module) {
  const matrix = desktopMatrix(process.env.TYPELIGHT_BUILD_EVENT, process.env.TYPELIGHT_BUILD_PLATFORM || 'all');
  if (!process.env.GITHUB_OUTPUT) throw new Error('The GitHub Actions output path is required.');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
}

module.exports = { desktopMatrix };
