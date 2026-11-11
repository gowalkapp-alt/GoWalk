// Seadistuse viisard (ainult Androidi äpis): sammud, asukoht ja taustal töötamine.
// Iga samm: olek + üks suur nupp. Kontrollitakse uuesti, kui kasutaja seadetest tagasi tuleb.
import { isNativeApp } from './native-mode.js';
import { inspectHealth, openHealthConnect, requestStepsPermission } from './health.js';
import { requestTrackingPermissions } from './background-gps.js';

const DONE_KEY = 'gw_setup_done';
const SEEN_KEY = 'gw_setup_seen';
let modal = null;
let statusCache = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

async function batteryApi() {
  const mod = await import('@capawesome-team/capacitor-android-battery-optimization');
  return mod.BatteryOptimization;
}

async function checkBattery() {
  try {
    const B = await batteryApi();
    const r = await B.isBatteryOptimizationEnabled();
    return r.enabled ? 'limited' : 'ok';
  } catch (e) {
    return 'unknown';
  }
}

async function checkLocation() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'granted') return 'ok';
      if (p.state === 'denied') return 'denied';
      return 'ask';
    }
  } catch (e) { /* ignore */ }
  return lsGet('gw_loc_asked') ? 'ok' : 'ask';
}

export async function checkSetup() {
  const [health, loc, battery] = await Promise.all([inspectHealth(), checkLocation(), checkBattery()]);
  const complete = health.state === 'ok' && loc === 'ok' && battery !== 'limited';
  // "no-data" (0 sammu) ei blokeeri valmisolekut, kui luba on olemas
  const ready = (health.state === 'ok' || health.state === 'no-data') && loc === 'ok' && battery !== 'limited';
  statusCache = { health, loc, battery, complete, ready };
  if (ready) lsSet(DONE_KEY, '1');
  return statusCache;
}

function card(icon, title, state, text, btnHtml, extra) {
  const cls = state === 'ok' ? 'ok' : (state === 'warn' ? 'warn' : '');
  const mark = state === 'ok' ? '✓' : (state === 'warn' ? '!' : '•');
  return '<div class="gw-sg-card ' + cls + '">' +
    '<div class="gw-sg-head"><span class="gw-sg-mark">' + mark + '</span><h4><i data-lucide="' + icon + '"></i> ' + title + '</h4></div>' +
    '<p>' + text + '</p>' + (btnHtml || '') + (extra || '') + '</div>';
}

function healthCard(h) {
  const btn = (id, label) => '<button type="button" class="gw-sg-btn" data-act="' + id + '">' + label + '</button>';
  if (h.state === 'ok') {
    const src = h.sources.length ? ' Allikas: ' + h.sources.join(', ') + '.' : '';
    return card('footprints', '1. Sammud', 'ok', 'Töötab! Täna on telefonist loetud <strong>' + h.steps + '</strong> sammu.' + src);
  }
  if (h.state === 'no-data') {
    const src = h.sources.length
      ? 'Health Connectis on kirjeid allikatest: ' + h.sources.join(', ') + ', aga täna samme veel pole. Kõnni veidi ja vajuta „Kontrolli uuesti“.'
      : 'Luba on olemas, aga Health Connect ei saa samme ühestki rakendusest. Ava Health Connect → <strong>Rakenduste juurdepääs</strong> → <strong>Samsung Health</strong> (või Google Fit) → lülita <strong>Sammud</strong> sisse.';
    return card('footprints', '1. Sammud', 'warn', src, btn('hc-open', 'Ava Health Connect') + btn('recheck', 'Kontrolli uuesti'));
  }
  if (h.state === 'unavailable') {
    return card('footprints', '1. Sammud', 'warn', 'Telefonis pole Health Connecti. Paigalda see Play poest (Android 14+ puhul on see seadete sees) ja tule tagasi.', btn('hc-open', 'Ava Health Connect'));
  }
  if (h.state === 'no-permission') {
    return card('footprints', '1. Sammud', 'warn', 'Luba GoWalkil sinu samme lugeda – siis tulevad need avalehele ise.', btn('hc-perm', 'Luba sammud'));
  }
  return card('footprints', '1. Sammud', 'warn', 'Sammude lugemine ei õnnestunud. Proovi uuesti.', btn('recheck', 'Proovi uuesti'));
}

function render() {
  const s = statusCache;
  const body = modal.querySelector('.gw-sg-body');
  const btn = (id, label) => '<button type="button" class="gw-sg-btn" data-act="' + id + '">' + label + '</button>';

  const locCard = s.loc === 'ok'
    ? card('map-pin', '2. Asukoht ja teavitus', 'ok', 'Lubatud. Kõnni ajal näed telefonis märguannet „GoWalk — kõnd käib“ – see hoiab salvestuse käimas.')
    : card('map-pin', '2. Asukoht ja teavitus', 'warn',
        s.loc === 'denied'
          ? 'Asukoht on keelatud. Ava telefoni seaded → Rakendused → GoWalk → Load → Asukoht → „Luba rakenduse kasutamise ajal“.'
          : 'Vaja, et näha kaardil sind ja salvestada kõnd. Vali küsimisel „Täpne“ ja „Rakenduse kasutamise ajal“ ning luba teavitused.',
        s.loc === 'denied' ? '' : btn('loc', 'Luba asukoht'));

  const batText = s.battery === 'ok'
    ? 'Korras – Android ei peata GoWalki taustal.'
    : 'Et salvestus ei katkeks, kui ekraan kustub, lase GoWalkil taustal töötada.';
  const sam = '<details class="gw-sg-more"><summary>Samsungi telefon? Kolm lisasammu</summary><ol>' +
    '<li>Seaded → <strong>Aku</strong> → <strong>Taustakasutuse piirangud</strong>.</li>' +
    '<li>Lülita välja <strong>„Pane kasutamata rakendused magama“</strong>.</li>' +
    '<li>Ava <strong>„Magavad rakendused“</strong> ja <strong>„Sügavalt magavad rakendused“</strong> – kui GoWalk on seal, eemalda see.</li></ol></details>';
  const batCard = card('battery-charging', '3. Taustal töötamine', s.battery === 'ok' ? 'ok' : (s.battery === 'unknown' ? '' : 'warn'),
    batText, s.battery === 'ok' ? '' : btn('bat', 'Luba taustal töötada'), sam);

  const allOk = s.ready;
  body.innerHTML =
    '<p class="gw-sg-intro">' + (allOk ? '🎉 Kõik on valmis! GoWalk töötab nii nagu peab.' : 'Kolm kiiret sammu, et GoWalk töötaks sujuvalt. Vajuta nuppu, tee seadetes, mida palutakse, ja tule tagasi – kontrollin ise.') + '</p>' +
    healthCard(s.health) + locCard + batCard +
    '<button type="button" class="gw-sg-done" data-act="close">' + (allOk ? 'Valmis' : 'Teen hiljem') + '</button>';
  if (window.lucide) window.lucide.createIcons();
  updateBadge();
}

async function refresh() {
  if (!modal || !modal.classList.contains('open')) return;
  await checkSetup();
  render();
}

async function onAction(act) {
  if (act === 'close') { modal.classList.remove('open'); return; }
  if (act === 'hc-open') await openHealthConnect();
  else if (act === 'hc-perm') { await requestStepsPermission(); }
  else if (act === 'loc') {
    await requestTrackingPermissions();
    try {
      await new Promise(res => navigator.geolocation.getCurrentPosition(res, res, { timeout: 8000 }));
    } catch (e) { /* ignore */ }
    lsSet('gw_loc_asked', '1');
  } else if (act === 'bat') {
    try { const B = await batteryApi(); await B.openBatteryOptimizationSettings(); } catch (e) { /* ignore */ }
  }
  await refresh();
}

function updateBadge() {
  const b = document.getElementById('gwSetupBadge');
  if (!b || !statusCache) return;
  b.hidden = !!statusCache.ready;
}

function injectCss() {
  if (document.getElementById('gw-setup-css')) return;
  const st = document.createElement('style');
  st.id = 'gw-setup-css';
  st.textContent = [
    '.gw-sg-intro { color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; margin: 0 0 14px; }',
    '.gw-sg-card { background: rgba(26, 31, 66, 0.85); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 18px; padding: 14px 16px; margin-bottom: 12px; }',
    '.gw-sg-card.ok { border-color: rgba(52, 211, 153, 0.55); }',
    '.gw-sg-card.warn { border-color: rgba(251, 191, 36, 0.6); }',
    '.gw-sg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }',
    '.gw-sg-head h4 { margin: 0; font-size: 1rem; color: #fff; display: flex; align-items: center; gap: 6px; }',
    '.gw-sg-mark { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; background: rgba(148, 163, 184, 0.25); color: #e2e8f0; flex: none; }',
    '.gw-sg-card.ok .gw-sg-mark { background: #34d399; color: #04261a; }',
    '.gw-sg-card.warn .gw-sg-mark { background: #fbbf24; color: #3a2a00; }',
    '.gw-sg-card p { margin: 0 0 10px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; }',
    '.gw-sg-btn { display: block; width: 100%; padding: 13px; margin-top: 8px; border: 0; border-radius: 14px; font-weight: 800; font-size: 0.95rem; color: #fff; cursor: pointer; background: linear-gradient(135deg, #a855f7, #ec4899); }',
    '.gw-sg-more { margin-top: 10px; font-size: 0.86rem; color: #cbd5e1; }',
    '.gw-sg-more summary { cursor: pointer; font-weight: 700; color: #e9d5ff; }',
    '.gw-sg-more ol { margin: 8px 0 0; padding-left: 20px; line-height: 1.55; }',
    '.gw-sg-done { width: 100%; padding: 14px; margin: 6px 0 24px; border-radius: 14px; border: 1px solid rgba(168, 85, 247, 0.4); background: transparent; color: #e9d5ff; font-weight: 800; cursor: pointer; }',
    '.gw-sg-badge { margin-left: 8px; background: #fbbf24; color: #3a2a00; border-radius: 10px; padding: 1px 7px; font-size: 0.72rem; font-weight: 800; }'
  ].join('\n');
  document.head.appendChild(st);
}

function openSetup() {
  if (!modal) return;
  document.querySelectorAll('.subview-modal').forEach(m => m.classList.remove('open'));
  modal.classList.add('open');
  modal.querySelector('.gw-sg-body').innerHTML = '<p class="gw-sg-intro">Kontrollin…</p>';
  refresh();
}

export function setupSetupGuide() {
  if (!isNativeApp() || document.getElementById('gwSetupModal')) return;
  injectCss();

  modal = document.createElement('div');
  modal.id = 'gwSetupModal';
  modal.className = 'subview-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML =
    '<div class="subview-header"><div class="subview-title-group"><i data-lucide="wand-2" class="subview-header-icon"></i><h2>Seadistus</h2></div>' +
    '<button class="icon-btn close-subview"><i data-lucide="x"></i></button></div>' +
    '<div class="subview-body gw-sg-body"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target.closest('.close-subview')) { modal.classList.remove('open'); return; }
    const b = e.target.closest('[data-act]');
    if (b) onAction(b.dataset.act);
  });

  // Rida Seadete "rohkem" nimekirja ülaosas
  const list = document.querySelector('.gw-more-list');
  if (list) {
    const row = document.createElement('button');
    row.className = 'nav-item';
    row.type = 'button';
    row.innerHTML =
      '<span class="nav-icon"><i data-lucide="wand-2"></i></span>' +
      '<div class="nav-text"><span class="nav-title">Seadistus <span class="gw-sg-badge" id="gwSetupBadge" hidden>vaata üle</span></span>' +
      '<span class="nav-sub">Sammud, asukoht, taustal töötamine</span></div>' +
      '<i data-lucide="chevron-right" class="nav-arrow"></i>';
    row.addEventListener('click', e => { e.stopPropagation(); openSetup(); });
    list.insertBefore(row, list.firstChild);
  }

  document.addEventListener('gw:open-setup', openSetup);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  // Esimesel käivitusel avame ise; hiljem ainult märk Seadetes
  setTimeout(async () => {
    const s = await checkSetup();
    if (!s.ready && !lsGet(SEEN_KEY)) {
      lsSet(SEEN_KEY, '1');
      openSetup();
    } else updateBadge();
  }, 1500);
  if (window.lucide) window.lucide.createIcons();
}
