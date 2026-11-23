const assert = require('node:assert/strict');

async function checkMetal(win) {
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = () => evaluate("document.querySelector('.rail').classList.contains('metal-ready')");
  const waitFor = async (check, message) => {
    for (let i = 0; i < 60; i++) { if (await check()) return; await pause(50); }
    throw new Error(message);
  };
  await waitFor(ready, 'Metal shader did not initialize');
  const dimensions = await evaluate(`(() => {
    const canvas=document.getElementById('metalRail'), r=canvas.getBoundingClientRect();
    const gl=canvas.getContext('webgl');
    return { width:canvas.width, height:canvas.height, cssWidth:r.width,
      error:gl.getError(), hidden:canvas.getAttribute('aria-hidden'),
      pointer:getComputedStyle(canvas).pointerEvents,
      stage:canvas.closest('.stage')?.id,
      stageLayer:Number(getComputedStyle(document.getElementById('stage')).zIndex),
      lightLayer:Number(getComputedStyle(document.getElementById('gl')).zIndex) };
  })()`);
  assert.equal(dimensions.error, 0);
  assert.ok(dimensions.width >= dimensions.cssWidth && dimensions.height <= 12, 'Rail retains its slender profile');
  assert.equal(dimensions.stage, 'stage', 'Metal belongs to the paper stage');
  assert.ok(dimensions.stageLayer < dimensions.lightLayer, 'The shared scene shader shades the entire rail and mounts');
  assert.equal(dimensions.hidden, 'true'); assert.equal(dimensions.pointer, 'none');
  const uniform = name => evaluate(`(() => { const gl=document.getElementById('metalRail').getContext('webgl');
    return gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),${JSON.stringify(name)})); })()`);
  await evaluate("document.getElementById('ta').focus()");
  await win.webContents.insertText('Metal carriage fixture');
  await pause(500);
  const headBefore = await uniform('uHead');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
  await pause(500);
  assert.notEqual(await uniform('uHead'), headBefore, 'Metal reflection follows the moving carriage');
  await evaluate("document.getElementById('bRead').click()"); await pause(950);
  assert.ok(await uniform('uReading') > .99, 'Even lighting reaches the metal without flattening its material');
  await evaluate("document.getElementById('bRead').click()"); await pause(950);
  assert.ok(await uniform('uReading') < .01);
  await evaluate(`window.metalLoss = document.getElementById('metalRail').getContext('webgl').getExtension('WEBGL_lose_context');
    window.metalLoss.loseContext();`);
  await waitFor(async () => !(await ready()), 'Metal did not fall back after context loss');
  assert.match(await evaluate("getComputedStyle(document.querySelector('.rail')).backgroundImage"), /linear-gradient/);
  await evaluate('window.metalLoss.restoreContext()');
  await waitFor(ready, 'Metal did not recover after context restoration');
  assert.equal(await evaluate("document.getElementById('metalRail').getContext('webgl').getError()"), 0);
  await evaluate('delete window.metalLoss');
}

module.exports = { checkMetal };
