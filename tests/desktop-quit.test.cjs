const assert = require('node:assert/strict');
const test = require('node:test');
const { quitApplications } = require('../tools/quit-desktop.js');

test('requests normal quit once and waits until pending saving completes', () => {
  let time = 0, requests = 0, saved = false;
  const app = { isTerminated: () => saved, requestQuit: () => { requests++; return true; } };
  quitApplications([app], () => time, () => { time += 100; saved = time >= 300; });
  assert.equal(requests, 1);
  assert.equal(saved, true);
  assert.equal(time, 300);
});

test('an absent or already stopped app does not receive a quit request', () => {
  const unexpected = () => assert.fail('No quit request or wait should be necessary');
  quitApplications([], Date.now, unexpected);
  quitApplications([{ isTerminated: () => true, requestQuit: unexpected }], Date.now, unexpected);
});

test('a canceled or blocked quit times out without forcibly killing the app', () => {
  let time = 0, requests = 0;
  const app = { isTerminated: () => false, requestQuit: () => { requests++; return true; } };
  assert.throws(() => quitApplications([app], () => time, () => { time += 100; }, 300), /still open/);
  assert.equal(time, 300);
  assert.equal(requests, 1);
});

test('a failed quit request stops installation unless the app has just exited', () => {
  const app = { isTerminated: () => false, requestQuit: () => false };
  assert.throws(() => quitApplications([app], Date.now, () => {}), /could not be asked to quit/);
  let exited = false;
  quitApplications([{ isTerminated: () => exited, requestQuit: () => false }], Date.now, () => { exited = true; });
  assert.equal(exited, true);
});

function selection(paths) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const requested = [];
  const apps = paths.map(path => ({ bundleURL: { URLByResolvingSymlinksInPath: { path } },
    terminated: false, get terminate() { requested.push(path); this.terminated = true; return true; } }));
  const context = {
    ObjC: { import() {}, unwrap: value => value },
    $: { NSURL: { fileURLWithPath: path => ({ URLByResolvingSymlinksInPath: { path } }) },
      NSRunningApplication: { runningApplicationsWithBundleIdentifier(id) {
        assert.equal(id, 'com.typelight.app');
        return { count: apps.length, objectAtIndex: i => apps[i] };
      } } },
  };
  vm.runInNewContext(fs.readFileSync('tools/quit-desktop.js', 'utf8'), context);
  return { run: context.run, requested };
}

test('default updates quit all registered Typelight copies regardless of location', () => {
  const paths = ['/Users/me/Applications/Typelight.app', '/Volumes/Typelight/Typelight.app'];
  const fixture = selection(paths);
  fixture.run(['--all']);
  assert.deepEqual(fixture.requested, paths);
});

test('custom-destination updates leave unrelated running copies untouched', () => {
  const fixture = selection(['/personal/Typelight.app', '/fixture/Typelight.app']);
  fixture.run(['/fixture/Typelight.app']);
  assert.deepEqual(fixture.requested, ['/fixture/Typelight.app']);
});

test('an invalid helper invocation fails before requesting any quit', () => {
  const fixture = selection(['/personal/Typelight.app']);
  assert.throws(() => fixture.run([]), /path is required/);
  assert.deepEqual(fixture.requested, []);
});
