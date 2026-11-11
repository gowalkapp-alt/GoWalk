/* ==========================================================================
   GOWALK — TAUSTAL GPS (Android: foreground service + püsiv teavitus)
   Kõndimise ajal jätkab asukoha jälgimist ka siis, kui ekraan kustub või
   äpp läheb taustale. Veebis (mitte-natiivses) versioonis ei tee midagi.

   NB! Capacitori plugin on Proxy, mis vastab ka `then`-ile. Seetõttu ei tohi
   pluginat kunagi Promise'ist/async-funktsioonist tagastada. Hoiame viidet
   mooduli sees ja tagastame ainult tavalisi väärtusi.
   ========================================================================== */

let plugin = null;
let active = false;

function isNative() {
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

function withTimeout(promise, ms, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(stage + ' ei vastanud ' + Math.round(ms / 1000) + ' s jooksul')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function loadModule() {
  return import('@capgo/background-geolocation');
}

export function isBackgroundGpsActive() {
  return active;
}

/**
 * Käivitab taustal GPS-i. `onPosition` saab objekti, mis näeb välja nagu
 * navigator.geolocation tulemus: { coords: {latitude, longitude, accuracy, speed}, timestamp }.
 * `onProblem(kind, detail)` kutsutakse, kui luba puudub või GPS annab vea.
 * @returns {Promise<boolean>} true, kui taustal GPS käivitus; false -> kasuta tavalist geolocationit
 */
export async function startBackgroundGps(onPosition, onProblem) {
  if (!isNative()) return false;
  if (active) return true;
  try {
    const mod = await withTimeout(loadModule(), 15000, 'plugina laadimine');
    plugin = mod.BackgroundGeolocation;

    // Asukoha ja teavituse luba (Android 13+ vajab teavituse luba püsiva "kõnd käib" märgi jaoks)
    try {
      await withTimeout(plugin.requestPermissions({ permissions: ['location', 'notification'] }), 120000, 'load');
    } catch (e) {
      /* start() küsib vajadusel ise uuesti */
    }

    await withTimeout(
      plugin.start(
        {
          backgroundTitle: 'GoWalk — kõnd käib',
          backgroundMessage: 'Salvestan sinu rada ja sammud',
          requestPermissions: true,
          stale: false,
          distanceFilter: 5,
          minIntervalMs: 1000
        },
        (location, error) => {
          if (error) {
            if (onProblem) onProblem(error.code === 'NOT_AUTHORIZED' ? 'no-permission' : 'error', error.message);
            return;
          }
          if (!location) return;
          onPosition({
            coords: {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: typeof location.accuracy === 'number' ? location.accuracy : 999,
              speed: typeof location.speed === 'number' ? location.speed : null
            },
            timestamp: location.time || Date.now()
          });
        }
      ),
      20000,
      'taustal GPS käivitus'
    );
    active = true;
    return true;
  } catch (err) {
    active = false;
    if (onProblem) onProblem('error', String((err && err.message) || err));
    return false;
  }
}

export async function stopBackgroundGps() {
  if (!active || !plugin) {
    active = false;
    return;
  }
  active = false;
  try {
    await withTimeout(plugin.stop(), 10000, 'taustal GPS peatamine');
  } catch (e) {
    /* peatamise viga ei tohi kõndi salvestamist takistada */
  }
}
