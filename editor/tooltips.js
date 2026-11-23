(() => {
  function position(anchor, tooltip, viewport) {
    const numbers = [anchor.left, anchor.top, anchor.bottom, anchor.width, tooltip.width, tooltip.height, viewport.width, viewport.height];
    if (!numbers.every(Number.isFinite) || tooltip.width < 0 || tooltip.height < 0) throw new Error('Invalid tooltip geometry.');
    return {
      left: Math.max(8, Math.min(viewport.width - tooltip.width - 8, anchor.left + (anchor.width - tooltip.width) / 2)),
      top: Math.max(8, Math.min(viewport.height - tooltip.height - 8,
        anchor.top >= tooltip.height + 16 ? anchor.top - tooltip.height - 8 : anchor.bottom + 8)),
    };
  }
  function install() {
    const tooltip = document.createElement('div');
    tooltip.id = 'toolHelp'; tooltip.className = 'tool-help'; tooltip.hidden = true;
    tooltip.setAttribute('role', 'tooltip');
    document.body.append(tooltip);
    let current = null, timer = null, dismissed = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    function hide() {
      cancel();
      if (current) {
        const ids = (current.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltip.id);
        if (ids.length) current.setAttribute('aria-describedby', ids.join(' '));
        else current.removeAttribute('aria-describedby');
      }
      tooltip.hidden = true; current = null;
    }
    function show(button) {
      cancel();
      if (button === dismissed || document.querySelector('dialog[open]')) return;
      if (current !== button) hide();
      current = button;
      tooltip.textContent = button.dataset.help || button.getAttribute('aria-label') || button.textContent;
      tooltip.hidden = false;
      const box = position(button.getBoundingClientRect(), tooltip.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
      tooltip.style.left = box.left + 'px'; tooltip.style.top = box.top + 'px';
      const ids = new Set((button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(tooltip.id); button.setAttribute('aria-describedby', [...ids].join(' '));
    }
    function leave() {
      cancel();
      timer = setTimeout(() => {
        if (current && (current.matches(':hover') || current === document.activeElement || tooltip.matches(':hover'))) return;
        hide();
      }, 180);
    }
    for (const button of document.querySelectorAll('#hud nav button, #bHelp')) {
      button.addEventListener('pointerenter', () => show(button));
      button.addEventListener('pointerleave', () => { dismissed = null; leave(); });
      button.addEventListener('focus', () => { dismissed = null; show(button); });
      button.addEventListener('blur', () => {
        dismissed = null;
        if (current === button && !button.matches(':hover') && !tooltip.matches(':hover')) hide();
        else leave();
      });
      button.addEventListener('click', hide);
    }
    tooltip.addEventListener('pointerenter', cancel);
    tooltip.addEventListener('pointerleave', leave);
    document.addEventListener('focusin', event => { if (event.target.closest('dialog')) hide(); });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !tooltip.hidden && !document.querySelector('dialog[open]')) {
        event.preventDefault(); event.stopImmediatePropagation();
        dismissed = current; hide();
      }
    }, true);
    window.addEventListener('resize', hide);
    return { hide };
  }
  if (typeof module !== 'undefined') module.exports = { position, install };
  else window.TypelightTooltips = { position, install };
})();
