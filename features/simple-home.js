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
    // Androidi süsteemi navigatsiooniriba (kolm nuppu all) ei tohi katta alumist menüüd
    ':root { --gw-inset-bottom: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)); }',
    '.gw-bottom-navbar { height: calc(64px + var(--gw-inset-bottom)) !important; padding-bottom: var(--gw-inset-bottom) !important; box-sizing: border-box; }',
    '.hud-card, .bottom-hud, #bottomHud { bottom: calc(74px + var(--gw-inset-bottom)) !important; }',
    '.subview-modal { padding-bottom: calc(76px + var(--gw-inset-bottom)) !important; }',
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

/* ==========================================================================
   LIHTSAM MENÜÜ: külgmenüü kaob, kõik asub ühes kohas — Seadetes.
   Olemasolevad elemendid (profiil, sisselogimine, menüüpunktid) TÕSTETAKSE
   ümber, mitte ei looda uuesti, nii et nende sündmuskuulajad jäävad alles.
   ========================================================================== */

export function setupSimpleSettings() {
  const body = document.querySelector('#settingsModal .subview-body');
  const drawer = document.getElementById('sidebarDrawer');
  if (!body || !drawer || body.dataset.simplified) return;
  body.dataset.simplified = '1';

  const style = document.createElement('style');
  style.id = 'gw-simple-settings-style';
  style.textContent = [
    '#sidebarDrawer, #drawerOverlay, #openDrawerBtn, #closeDrawerBtn { display: none !important; }',
    '.floating-topbar { justify-content: center; }',
    '#quickSyncBtn { display: none !important; }',
    '.gw-account-block { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }',
    '.gw-account-block .drawer-profile { padding: 0; border: 0; background: none; }',
    '.gw-more-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }',
    '.gw-more-list .nav-item { width: 100%; }',
    '.gw-settings-footer { margin-top: 20px; padding-bottom: 12px; }'
  ].join('\n');
  document.head.appendChild(style);

  // Päis: ainult pealkiri
  const title = document.querySelector('#settingsModal .subview-title-group h2');
  if (title) title.textContent = 'Seaded';

  // 1) Konto (profiil + sisselogimine) lehe algusesse
  const account = document.createElement('div');
  account.className = 'gw-account-block';
  const profile = drawer.querySelector('.drawer-profile');
  const auth = drawer.querySelector('.drawer-auth-bar');
  if (profile) account.appendChild(profile);
  if (auth) account.appendChild(auth);
  body.prepend(account);

  // 2) Sooduskood eesmärgi ja sammupikkuse alla
  const promo = body.querySelector('.promo-redeem-box');
  const firstGroup = body.querySelector('.settings-group');
  if (promo && firstGroup) firstGroup.insertAdjacentElement('afterend', promo);

  // 3) Kaardistiili vaikeväärtus on avalehel ikooni taga; siin seda enam ei näita
  const styleSel = document.getElementById('settingMapStyle');
  const styleItem = styleSel && styleSel.closest('.setting-item');
  if (styleItem) styleItem.style.display = 'none';

  // 4) Menüüpunktid (Sammud ja import, Paigalda äpp, Abi, Admin) "Rohkem" lõiku
  const items = Array.from(drawer.querySelectorAll('.drawer-nav .nav-item'));
  if (items.length) {
    const more = document.createElement('div');
    more.className = 'gw-more-list';
    items.forEach(it => more.appendChild(it));
    const exportHeading = Array.from(body.querySelectorAll('.section-subtitle')).pop();
    if (exportHeading) exportHeading.insertAdjacentElement('beforebegin', more);
    else body.appendChild(more);
  }

  // 5) Versioon ja andmekaitse rida lõppu
  const footer = drawer.querySelector('.drawer-footer');
  if (footer) {
    footer.classList.add('gw-settings-footer');
    body.appendChild(footer);
  }

  if (window.lucide) window.lucide.createIcons();
}
