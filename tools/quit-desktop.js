/* Run with macOS JavaScript for Automation, not Node, when installing. */
function quitApplications(apps, clock, pump, timeoutMs = 30000) {
  for (const app of apps) {
    if (!app.isTerminated() && !app.requestQuit()) {
      pump();
      if (!app.isTerminated()) throw new Error('Typelight could not be asked to quit. The installed app has not been replaced.');
    }
  }
  const deadline = clock() + timeoutMs;
  while (apps.some(app => !app.isTerminated())) {
    if (clock() >= deadline) {
      throw new Error('Typelight is still open. Finish any dialog or resolve the save error, then run ./install.sh again. The installed app has not been replaced.');
    }
    pump();
  }
}

function run(paths) {
  if (!paths.length) throw new Error('An application path is required.');
  ObjC.import('AppKit');
  const canonical = path => ObjC.unwrap($.NSURL.fileURLWithPath(path).URLByResolvingSymlinksInPath.path);
  const targets = paths.length === 1 && paths[0] === '--all' ? null : paths.map(canonical);
  const running = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.typelight.app');
  const apps = [];
  for (let i = 0; i < running.count; i++) {
    const app = running.objectAtIndex(i);
    const path = ObjC.unwrap(app.bundleURL.URLByResolvingSymlinksInPath.path);
    if (targets && targets.indexOf(path) === -1) continue;
    apps.push({ isTerminated: () => app.terminated, requestQuit: () => app.terminate });
  }
  quitApplications(apps, Date.now, () => {
    // AppKit refreshes running-application state when its run loop runs.
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
  });
  return apps.length ? 'Typelight quit normally.' : '';
}

if (typeof module !== 'undefined') module.exports = { quitApplications };
