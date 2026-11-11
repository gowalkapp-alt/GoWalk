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
    '.gw-settings-footer { margin-top: 20px; padding-bottom: 12px; }',
    '.gw-auth-intro { display: none; background: linear-gradient(160deg, rgba(26, 31, 66, 0.9), rgba(15, 20, 42, 0.95)); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 18px; padding: 14px 16px; color: #cbd5e1; font-size: 0.92rem; line-height: 1.5; }',
    '.gw-auth-intro strong { display: block; color: #fff; font-size: 1.05rem; margin-bottom: 4px; }',
    '.gw-account-block[data-auth="out"] .drawer-profile { display: none; }',
    '.gw-account-block[data-auth="out"] .gw-auth-intro { display: block; }',
    '.gw-more-fold { margin: 6px 0 18px; border: 1px solid rgba(168, 85, 247, 0.22); border-radius: 18px; padding: 0 14px; }',
    '.gw-more-fold > summary { padding: 14px 2px; font-weight: 800; color: #e9d5ff; cursor: pointer; }',
    '.gw-more-fold[open] > summary { border-bottom: 1px solid rgba(168, 85, 247, 0.18); margin-bottom: 14px; }',
    '.gw-more-fold .promo-redeem-box { margin-bottom: 16px; }'
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
  const intro = document.createElement('div');
  intro.className = 'gw-auth-intro';
  intro.innerHTML = '<strong>Logi sisse</strong>Google\'iga sisse logides jäävad sinu sammud ja rajad alles ning on olemas ka teises seadmes.';
  account.appendChild(intro);
  if (profile) account.appendChild(profile);
  if (auth) account.appendChild(auth);
  body.prepend(account);
  // Sisselogitud? Nupu tekst muutub "Logi välja (…)" – jälgime seda
  const syncAuthState = () => {
    const t = document.getElementById('googleAuthText');
    const loggedIn = !!t && /välja/i.test(t.textContent || '');
    account.dataset.auth = loggedIn ? 'in' : 'out';
  };
  syncAuthState();
  if (auth) new MutationObserver(syncAuthState).observe(auth, { subtree: true, childList: true, characterData: true });
  document.addEventListener('visibilitychange', syncAuthState);

  // 2) Sooduskood eesmärgi ja sammupikkuse alla
  const promo = body.querySelector('.promo-redeem-box');
  const firstGroup = body.querySelector('.settings-group');
  const mkHeading = txt => { const h = document.createElement('h3'); h.className = 'section-subtitle'; h.textContent = txt; return h; };
  if (firstGroup) firstGroup.insertAdjacentElement('beforebegin', mkHeading('Minu sammud'));

  // 3) Kaardistiili vaikeväärtus on avalehel ikooni taga; siin seda enam ei näita
  const styleSel = document.getElementById('settingMapStyle');
  const styleItem = styleSel && styleSel.closest('.setting-item');
  if (styleItem) styleItem.style.display = 'none';

  // 4) Äpp-nimekiri (Seadistus, Sammud ja import, Abi, Admin) + kokkuvolditud "Rohkem"
  const items = Array.from(drawer.querySelectorAll('.drawer-nav .nav-item'));
  const exportHeading = Array.from(body.querySelectorAll('.section-subtitle')).filter(h => /varundamine/i.test(h.textContent)).pop();
  const exportGroup = exportHeading && exportHeading.nextElementSibling;
  const anchor = exportHeading || null;
  if (items.length) {
    const more = document.createElement('div');
    more.className = 'gw-more-list';
    items.forEach(it => more.appendChild(it));
    const head = mkHeading('Äpp');
    if (anchor) { anchor.insertAdjacentElement('beforebegin', head); head.insertAdjacentElement('afterend', more); }
    else { body.appendChild(head); body.appendChild(more); }
  }
  const fold = document.createElement('details');
  fold.className = 'gw-more-fold';
  fold.innerHTML = '<summary>Rohkem</summary>';
  if (promo) fold.appendChild(promo);
  if (exportHeading) fold.appendChild(exportHeading);
  if (exportGroup) fold.appendChild(exportGroup);
  body.appendChild(fold);

  // 5) Versioon ja andmekaitse rida lõppu
  const footer = drawer.querySelector('.drawer-footer');
  if (footer) {
    footer.classList.add('gw-settings-footer');
    body.appendChild(footer);
  }

  if (window.lucide) window.lucide.createIcons();
}
