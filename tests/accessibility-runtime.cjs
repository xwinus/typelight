const assert = require('node:assert/strict');
const { app, Menu } = require('electron');
const { once } = require('node:events');

async function checkAccessibility(window, runtime, watchErrors) {
  let win = window;
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  const pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
  const focus = id => evaluate(`document.getElementById('${id}').focus()`);
  const active = () => evaluate('document.activeElement.id');
  const text = () => evaluate('document.getElementById("ta").value');
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Return' || keyCode === 'Space') {
      win.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Return' ? '\r' : ' ', modifiers });
    }
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause();
  };
  const setText = async value => {
    await evaluate(`{ const t=document.getElementById('ta'); t.value=${JSON.stringify(value)};
      t.setSelectionRange(t.value.length,t.value.length); t.dispatchEvent(new Event('input')); }`);
    await pause(400);
  };
  win.webContents.focus();
  await setText('Keyboard review fixture.');
  await focus('ta');
  await key('Tab');
  assert.equal(await active(), 'bDrawer', 'Tab leaves the editor without changing text');
  await key('Tab');
  assert.equal(await active(), 'bNew', 'Tab skips disabled pages and advances through tools');
  await key('Tab', ['shift']);
  assert.equal(await active(), 'bDrawer');
  await key('Tab', ['shift']);
  assert.equal(await active(), 'ta');
  assert.equal(await text(), 'Keyboard review fixture.');

  await focus('bSound');
  const sound = await evaluate("document.getElementById('bSound').getAttribute('aria-label')");
  await key('Return');
  assert.notEqual(await evaluate("document.getElementById('bSound').getAttribute('aria-label')"), sound);
  assert.equal(await active(), 'bSound', 'Activating a toggle retains its focus');
  await key('Space');
  assert.equal(await evaluate("document.getElementById('bSound').getAttribute('aria-label')"), sound);

  await focus('ta'); await key('F6'); assert.equal(await active(), 'bDrawer');
  await key('F6'); assert.equal(await active(), 'ta');
  await runtime.command('bDrawer');
  assert.equal(await evaluate("document.activeElement.matches('.leaf')"), true);
  assert.equal(await evaluate("document.getElementById('desk').inert"), true);
  const descriptions = await evaluate(`Array.from(document.querySelectorAll('.leaf[data-id]'), b => ({
    name:b.getAttribute('aria-label'), description:document.getElementById(b.getAttribute('aria-describedby'))?.textContent,
    hidden:b.querySelector('.body').getAttribute('aria-hidden')
  }))`);
  assert.ok(descriptions.length > 0);
  assert.ok(descriptions.every(b => b.name.length <= 64 && b.description && b.hidden === 'true'));
  await key('Escape');
  assert.equal(await active(), 'ta');
  assert.equal(await evaluate("document.getElementById('desk').inert"), false);

  await setText('A line on the page.\n'.repeat(100));
  const original = await text();
  await runtime.command('bPages');
  assert.equal(await evaluate("document.activeElement.matches('.mini')"), true);
  await key('Tab');
  assert.equal(await evaluate("document.documentElement.classList.contains('pages-open')"), true);
  assert.equal(await text(), original, 'Tab in page overview must never edit a document');
  await evaluate("document.querySelector('.mini').focus()");
  await key('Right');
  assert.equal(await evaluate('document.activeElement.dataset.page'), '1');
  await key('Escape');
  assert.equal(await active(), 'ta');
  assert.equal(await text(), original);

  await focus('bHelp'); await key('Return');
  assert.equal(await evaluate("document.getElementById('readingHelp').open"), true);
  assert.equal(await active(), 'closeHelp');
  await key('Tab'); assert.equal(await active(), 'readingMode');
  for (let i = 0; i < 12; i++) {
    await key('Tab');
    assert.equal(await evaluate("Boolean(document.activeElement.closest('#readingHelp'))"), true, 'Focus stays in the modal help');
  }
  await key('Escape');
  assert.equal(await evaluate("document.getElementById('readingHelp').open"), false);
  assert.equal(await active(), 'bHelp');
  assert.equal(await text(), original);

  // Help is window chrome, centred on the row of the traffic lights and as far from the right edge
  // as they are from the left, at any interface size; nothing drags the window from under it.
  const checkHelp = async zoom => {
    const spot = await evaluate(`(() => { const r=document.getElementById('bHelp').getBoundingClientRect();
      const x=r.left+r.width/2, y=r.top+r.height/2;
      return { right:innerWidth-x, top:y, hit:document.elementFromPoint(x,y)?.id }; })()`);
    assert.equal(spot.hit, 'bHelp', 'Help is not under the window drag area');
    if (process.platform === 'darwin') {
      assert.ok(Math.abs(spot.top * zoom - 22.5) < 0.6 && Math.abs(spot.right * zoom - 24.75) < 0.6,
        'Help mirrors the traffic lights: ' + JSON.stringify(spot));
    }
  };
  await checkHelp(1);

  // The toolbar switches the even reading light too, and the native menu follows it.
  await evaluate("document.getElementById('bRead').click()");
  await pause(120);
  assert.equal(await evaluate("document.documentElement.classList.contains('reading-mode')"), true);
  assert.equal(await evaluate("document.getElementById('bRead').getAttribute('aria-label')"), 'Reading: on');
  assert.equal(Menu.getApplicationMenu().getMenuItemById('readingMode').checked, true);
  await evaluate("document.getElementById('bRead').click()");
  await pause(120);
  assert.equal(await evaluate("document.getElementById('bRead').getAttribute('aria-label')"), 'Reading: off');
  assert.equal(Menu.getApplicationMenu().getMenuItemById('readingMode').checked, false);

  await runtime.command('readingMode');
  await pause(120);
  assert.equal(Menu.getApplicationMenu().getMenuItemById('readingMode').checked, true);
  const reading = await evaluate(`(() => {
    const first=document.querySelector('#lines .ln'), sheet=document.querySelector('.sheet');
    return { mode:document.documentElement.classList.contains('reading-mode'),
      light:getComputedStyle(document.getElementById('gl')).visibility,
      ink:getComputedStyle(first).color, paper:getComputedStyle(sheet).backgroundColor,
      texture:getComputedStyle(sheet).backgroundImage,
      characterOpacity:getComputedStyle(first.querySelector('.c')).opacity };
  })()`);
  assert.equal(reading.mode, true); assert.equal(reading.light, 'hidden');
  assert.equal(reading.texture, 'none'); assert.equal(reading.characterOpacity, '1');
  const rgb = color => color.match(/[\d.]+/g).slice(0,3).map(Number);
  const luminance = color => color.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
    .reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i],0);
  const contrast = (ink,paper) => (luminance(paper)+.05)/(luminance(ink)+.05);
  const tint = color => color.map((v,i) => v * .75 + [48,115,155][i] * .25);
  assert.ok(contrast(rgb(reading.ink),rgb(reading.paper)) >= 4.5, 'Reading mode has adequate text contrast');
  assert.ok(contrast(tint(rgb(reading.ink)),tint(rgb(reading.paper))) >= 4.5, 'Selected text retains adequate contrast');

  for(let i=0;i<5;i++) await runtime.command('zoomIn');
  assert.equal(win.webContents.getZoomFactor(),2);
  win.setSize(900,580); await pause(300);
  const fits = await evaluate(`Array.from(document.querySelectorAll('#hud nav button'), b => {
    const r=b.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;
  }).every(Boolean)`);
  assert.equal(fits,true,'All tools remain available at 200% in the smallest desktop window');
  await checkHelp(2);
  await runtime.command('help');
  assert.equal(await evaluate(`(() => { const r=document.getElementById('readingHelp').getBoundingClientRect();
    return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight; })()`),true);
  await key('Escape');

  const closed = once(win,'closed'); win.close(); await closed;
  app.emit('activate'); win=runtime.getWindow(); watchErrors(win);
  if(win.webContents.isLoadingMainFrame()) await once(win.webContents,'did-finish-load');
  await pause(350);
  assert.equal(win.webContents.getZoomFactor(),2,'Zoom survives reopening');
  assert.equal(await evaluate("document.documentElement.classList.contains('reading-mode')"),true);
  assert.equal(await text(),original,'Reading preferences never change the document');
  await runtime.command('zoomReset'); await runtime.command('readingMode');
  win.setSize(1180,820); await pause(200);
  win.webContents.focus();

  // A real hover path crosses the gap onto the tooltip; Escape dismisses it without moving focus.
  const button = await evaluate(`(() => {const r=document.getElementById('bSave').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await focus('ta');
  win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(button.x),y:Math.round(button.y)});
  await pause(80);
  const tip=await evaluate(`(() => {const t=document.getElementById('toolHelp'),r=t.getBoundingClientRect();return {hidden:t.hidden,text:t.textContent,x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.equal(tip.hidden,false); assert.match(tip.text,/Export/);
  win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(tip.x),y:Math.round(tip.y)});
  await pause(250);
  assert.equal(await evaluate("document.getElementById('toolHelp').hidden"),false,'Tooltip remains while hovered');
  const selection=await evaluate("[document.getElementById('ta').selectionStart,document.getElementById('ta').selectionEnd]");
  await key('Escape');
  assert.equal(await evaluate("document.getElementById('toolHelp').hidden"),true);
  assert.equal(await active(),'ta');
  assert.deepEqual(await evaluate("[document.getElementById('ta').selectionStart,document.getElementById('ta').selectionEnd]"),selection);
  await evaluate("document.getElementById('bSave').focus()"); await pause();
  assert.equal(await evaluate("document.getElementById('toolHelp').hidden"),false,'Keyboard focus reveals the same help');

  const announcement = detail => evaluate(`window.dispatchEvent(new CustomEvent('typelight:state',{detail:${JSON.stringify(detail)}}))`);
  await announcement({saving:true,error:''});
  assert.equal(await evaluate("document.querySelector('.desktop-status').getAttribute('aria-live')"),'off');
  await announcement({saving:false,error:'Review disk error'});
  assert.match(await evaluate("document.getElementById('saveAlert').textContent"),/Review disk error/);
  await announcement({saving:false,error:''});
  assert.equal(await evaluate("document.getElementById('saveRecovery').textContent"),'Your writing is saved again.');
  assert.match(await evaluate("document.getElementById('bSave').getAttribute('aria-label')"),/Export text/);
}

module.exports = { checkAccessibility };
