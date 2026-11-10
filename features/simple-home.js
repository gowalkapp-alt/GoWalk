/* ==========================================================================
   GOWALK — LIHTSAM AVALEHT
   - Kaardistiilide valik on peidus ühe ikooni taga.
   - "Võta tagasi" ja "Puhasta" nupud on nähtaval ainult siis, kui rada on olemas.
   ========================================================================== */

export function setupSimpleHome() {
  if (document.getElementById('gw-simple-home-style')) return;

  const style = document.createElement('style');
  style.id = 'gw-simple-home-style';
  style.textContent = [
    '.map-layer-bar { display: none; }',
    '.map-layer-bar.open { display: flex; flex-wrap: wrap; }',
    '.map-floating-tools #undoWaypointBtn, .map-floating-tools #clearRouteBtn { display: none; }',
    '.map-floating-tools.has-route #undoWaypointBtn, .map-floating-tools.has-route #clearRouteBtn { display: flex; }'
  ].join('\n');
  document.head.appendChild(style);

  const bar = document.querySelector('.map-layer-bar');
  const tools = document.querySelector('.map-floating-tools');
  if (!bar || !tools) return;

  // Kaardistiili ikoon
  const toggle = document.createElement('button');
  toggle.id = 'layerToggleBtn';
  toggle.className = 'tool-fab';
  toggle.title = 'Kaardi stiil';
  toggle.innerHTML = '<i data-lucide="layers"></i>';
  tools.appendChild(toggle);
  if (window.lucide) window.lucide.createIcons();

  toggle.addEventListener('click', () => bar.classList.toggle('open'));
  bar.addEventListener('click', e => {
    if (e.target.closest('.layer-chip')) bar.classList.remove('open');
  });

  // Tagasivõtmine/puhastus ainult siis, kui rada on (algpunkt + vähemalt üks peatus)
  document.addEventListener('gw:route-changed', e => {
    const count = (e.detail && e.detail.count) || 0;
    tools.classList.toggle('has-route', count > 1);
  });
}
