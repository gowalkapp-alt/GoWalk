/* ==========================================================================
   GOWALK — TELEFONI TERVISEANDMED (Android Health Connect / iPhone Apple Health)
   Loeb tänased sammud telefonist ja uuendab state.today.steps.
   Veebis (mitte-natiivses) versioonis ei tee see moodul midagi.
   ========================================================================== */

import { state, saveState } from '../state.js';

const HEALTH_READ = ['steps'];

// Iga plugina kõne saab ajapiirangu, et mõni "rippuma jäänud" kõne ei blokeeriks nuppu
// ja me näeksime, mis sammus asi seisma jäi.
function withTimeout(promise, ms, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(stage + ' ei vastanud ' + Math.round(ms / 1000) + ' s jooksul')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isNative() {
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

// Plugin laetakse alles natiivses äpis (dünaamiline import), et veebiversioon
// töötaks ka ilma ehitussammuta.
// NB! Capacitori plugin on Proxy, mis vastab ka `then`-ile. Seetõttu ei tohi pluginat
// kunagi Promise'ist/async-funktsioonist tagastada (see jääks igaveseks ootama).
// Tagastame mooduli ja võtame `Health` välja alles pärast ootamist.
function loadHealthModule() {
  return import('@capgo/capacitor-health');
}

/**
 * Loeb tänaste sammude summa. Ei muuda olekut.
 * @returns {Promise<{ok: true, steps: number} | {ok: false, reason: string, detail?: string}>}
 */
export async function readTodayStepsFromHealth({ askPermission = false } = {}) {
  if (!isNative()) return { ok: false, reason: 'web' };
  try {
    const healthModule = await withTimeout(loadHealthModule(), 15000, 'plugina laadimine');
    const Health = healthModule.Health;

    const avail = await withTimeout(Health.isAvailable(), 15000, 'isAvailable');
    if (!avail.available) {
      return { ok: false, reason: 'unavailable', detail: avail.reason };
    }

    let auth = await withTimeout(Health.checkAuthorization({ read: HEALTH_READ, write: [] }), 15000, 'checkAuthorization');
    if (!auth.readAuthorized.includes('steps')) {
      if (!askPermission) return { ok: false, reason: 'no-permission' };
      auth = await withTimeout(Health.requestAuthorization({ read: HEALTH_READ, write: [] }), 120000, 'requestAuthorization');
      if (!auth.readAuthorized.includes('steps')) return { ok: false, reason: 'denied' };
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const res = await withTimeout(
      Health.queryAggregated({
        dataType: 'steps',
        startDate: start.toISOString(),
        endDate: new Date().toISOString(),
        bucket: 'day',
        aggregation: 'sum'
      }),
      20000,
      'queryAggregated'
    );
    const total = (res.samples || []).reduce((sum, s) => sum + (Number(s.value) || 0), 0);
    // Diagnostika: kui kokku on 0, vaata toorkirjeid, et näha, kas Health Connectis on üldse andmeid.
    let note = '';
    if (total === 0) {
      try {
        const raw = await withTimeout(
          Health.readSamples({
            dataType: 'steps',
            startDate: start.toISOString(),
            endDate: new Date().toISOString(),
            limit: 20
          }),
          15000,
          'readSamples'
        );
        const list = raw.samples || [];
        note = list.length
          ? 'Health Connectis on ' + list.length + ' kirjet (allikas: ' + (list[0].sourceName || list[0].sourceId || '?') + ')'
          : 'Health Connectis pole täna ühtegi sammukirjet';
      } catch (e) {
        note = 'readSamples: ' + ((e && e.message) || e);
      }
    }
    return { ok: true, steps: Math.round(total), note };
  } catch (err) {
    return { ok: false, reason: 'error', detail: String((err && err.message) || err) };
  }
}

/** Avab Health Connecti (või viib selle paigaldamiseni). */
export async function openHealthConnect() {
  if (!isNative()) return false;
  try {
    const healthModule = await withTimeout(loadHealthModule(), 15000, 'plugina laadimine');
    await withTimeout(healthModule.Health.openHealthConnectSettings(), 10000, 'openHealthConnectSettings');
    return true;
  } catch (e) {
    return false;
  }
}

/** Küsib sammude lugemise luba. @returns {Promise<boolean>} true, kui luba anti */
export async function requestStepsPermission() {
  const res = await readTodayStepsFromHealth({ askPermission: true });
  return res.ok;
}

/**
 * Seadistuse kontroll tavakeeles.
 * state: 'web' | 'unavailable' | 'no-permission' | 'no-data' | 'ok' | 'error'
 * sources: rakendused, mis on viimase 24 h jooksul Health Connecti samme kirjutanud
 */
export async function inspectHealth() {
  if (!isNative()) return { state: 'web', steps: 0, sources: [] };
  const res = await readTodayStepsFromHealth({ askPermission: false });
  if (!res.ok) {
    if (res.reason === 'no-permission' || res.reason === 'denied') return { state: 'no-permission', steps: 0, sources: [] };
    if (res.reason === 'unavailable') return { state: 'unavailable', steps: 0, sources: [], detail: res.detail };
    return { state: 'error', steps: 0, sources: [], detail: res.detail || res.reason };
  }
  let sources = [];
  try {
    const healthModule = await withTimeout(loadHealthModule(), 15000, 'plugina laadimine');
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const raw = await withTimeout(
      healthModule.Health.readSamples({
        dataType: 'steps',
        startDate: since.toISOString(),
        endDate: new Date().toISOString(),
        limit: 100
      }),
      15000,
      'readSamples'
    );
    const names = (raw.samples || []).map(s => s.sourceName || s.sourceId).filter(Boolean);
    sources = Array.from(new Set(names));
  } catch (e) {
    /* allikate nimekiri on lisainfo, mitte kohustuslik */
  }
  return { state: res.steps > 0 ? 'ok' : 'no-data', steps: res.steps, sources };
}

/**
 * Loeb sammud ja kirjutab need olekusse, kui telefon teab rohkem kui äpp.
 * (Maksimum, mitte asendus: käsitsi sisestatud või äpi enda lugemit ei vähendata.)
 */
export async function syncStepsFromHealth(onStepsUpdated, options) {
  const res = await readTodayStepsFromHealth(options);
  if (!res.ok) return res;

  const current = state.today.steps || 0;
  const applied = res.steps > current;
  if (applied) {
    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.steps = res.steps;
    state.today.distanceKm = +((res.steps * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(res.steps * 0.04);
    saveState();
    if (onStepsUpdated) onStepsUpdated();
  }
  return { ok: true, steps: res.steps, applied, note: res.note || '' };
}

function injectHealthStyle() {
  if (document.getElementById('gw-health-style')) return;
  const style = document.createElement('style');
  style.id = 'gw-health-style';
  style.textContent = [
    '.gw-health-row { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }',
    '.gw-health-btn { width: 100%; height: 42px; border-radius: 13px; cursor: pointer;',
    '  border: 1px solid var(--border-highlight); background: var(--bg-card);',
    '  color: var(--text-primary); font-family: var(--font-display); font-size: 14px; font-weight: 700;',
    '  display: flex; align-items: center; justify-content: center; gap: 8px; }',
    '.gw-health-btn:active { transform: scale(0.98); }',
    '.gw-health-btn[disabled] { opacity: 0.6; }',
    '.gw-health-btn svg { width: 17px; height: 17px; stroke-width: 2.4px; }',
    '.gw-health-status { min-height: 16px; text-align: center; font-size: 12px; color: var(--text-secondary); }',
    '.gw-health-status.error { color: var(--danger); }',
    '.gw-health-link { background: none; border: 0; padding: 0; color: var(--accent-secondary, #c084fc); font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; }'
  ].join('\n');
  document.head.appendChild(style);
}

/**
 * Lisab avalehele nupu "Võta sammud telefonist" ja sünkroonib sammud ise
 * äpi avamisel ning iga kord, kui äpp uuesti nähtavale tuleb.
 * Veebiversioonis ei tee midagi.
 */
export function setupHealthSync(onStepsUpdated) {
  if (!isNative()) return;
  const row = document.querySelector('.hud-action-row');
  if (!row || document.getElementById('healthSyncBtn')) return;

  injectHealthStyle();
  const wrap = document.createElement('div');
  wrap.className = 'gw-health-row';
  wrap.innerHTML =
    '<button id="healthSyncBtn" class="gw-health-btn" type="button">' +
    '<i data-lucide="heart-pulse"></i><span>Võta sammud telefonist</span></button>' +
    '<div id="healthSyncStatus" class="gw-health-status" aria-live="polite"></div>';
  row.insertAdjacentElement('afterend', wrap);
  if (window.lucide) window.lucide.createIcons();

  const btn = wrap.querySelector('#healthSyncBtn');
  const status = wrap.querySelector('#healthSyncStatus');
  let busy = false;

  // Teade avalehel; tegevust vajava teate juurde tuleb nupp "Seadista"
  function show(text, isError, withSetupLink) {
    status.textContent = text;
    status.classList.toggle('error', !!isError);
    if (withSetupLink) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'gw-health-link';
      link.textContent = 'Seadista';
      link.addEventListener('click', () => document.dispatchEvent(new CustomEvent('gw:open-setup')));
      status.appendChild(document.createTextNode(' '));
      status.appendChild(link);
    }
  }

  async function run(askPermission) {
    if (busy) {
      if (askPermission) show('Töötan juba, oota hetk…', false);
      return;
    }
    busy = true;
    btn.disabled = true;
    if (askPermission) show('Loen samme…', false);
    try {
      const res = await syncStepsFromHealth(onStepsUpdated, { askPermission });
      if (res.ok) {
        if (res.steps === 0) {
          show('Health Connect ei näe täna ühtegi sammu.', true, true);
        } else {
          show((res.applied ? '✓ Sammud värskendatud: ' : '✓ Sammud on ajakohased: ') + res.steps, false);
        }
      } else if (res.reason === 'no-permission') {
        show('Luba sammude lugemine, et sammud tuleksid automaatselt.', false, true);
      } else if (res.reason === 'denied') {
        show('Sammude lugemine pole lubatud.', true, true);
      } else if (res.reason === 'unavailable') {
        show('Health Connect puudub sinu telefonis.', true, true);
      } else {
        show('Sammude lugemine ebaõnnestus.', true, true);
      }
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', () => run(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run(false);
  });
  run(false);
}
