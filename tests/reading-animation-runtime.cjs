const assert = require('node:assert/strict');

async function checkReadingAnimation(win, command) {
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const light = selector => evaluate(`(() => {
    const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
    return { opacity:Number(s.opacity), visibility:s.visibility, display:s.display };
  })()`);
  const toggle = () => command('readingMode');
  const debuggerApi = win.webContents.debugger;
  const motion = value => debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  });
  debuggerApi.attach('1.3');
  try {
    await motion('no-preference');
    // Expected: the lighting fades out before being hidden, then fades back in.
    await toggle(); await pause(180);
    const fading = await light('#gl');
    assert.ok(fading.opacity > 0 && fading.opacity < 1, 'Reading light gradually brightens');
    assert.equal(fading.visibility, 'visible', 'Shading remains visible during the fade');
    await pause(700);
    assert.equal((await light('#gl')).visibility, 'hidden');
    await toggle(); await pause(180);
    const returning = await light('#gl');
    assert.ok(returning.opacity > 0 && returning.opacity < 1, 'Atmospheric light gradually returns');
    await pause(700);
    assert.equal((await light('#gl')).opacity, 1);

    // Edge: repeated clicks reverse the current transition without getting stuck.
    await toggle(); await pause(180);
    const beforeReverse = (await light('#gl')).opacity;
    await toggle(); await pause(60);
    const afterReverse = (await light('#gl')).opacity;
    assert.ok(afterReverse >= beforeReverse && afterReverse < 1, 'Reversal resumes from the current brightness');
    await pause(700);
    assert.equal((await light('#gl')).opacity, 1);

    // Failure fallback: unavailable WebGL uses the same fade on gradient lighting.
    await evaluate("document.documentElement.classList.remove('has-gl')");
    await pause(60);
    assert.notEqual((await light('.light')).display, 'none');
    await toggle(); await pause(180);
    const fallback = await light('.light');
    assert.ok(fallback.opacity > 0 && fallback.opacity < 1, 'Gradient fallback also fades: ' + JSON.stringify(fallback));
    await pause(700);
    await motion('reduce');
    await toggle();
    assert.equal((await light('.light')).opacity, 1, 'Reduced motion switches off immediately');
    await toggle();
    assert.equal((await light('.light')).opacity, 0, 'Reduced motion switches on immediately');
    assert.equal((await light('.light')).visibility, 'hidden');
    await toggle();
  } finally {
    await evaluate("document.documentElement.classList.add('has-gl')");
    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    debuggerApi.detach();
  }
}

module.exports = { checkReadingAnimation };
