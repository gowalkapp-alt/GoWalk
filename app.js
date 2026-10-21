/* ==========================================================================
   GOWALK PRO — 6. MAIN ENTRY POINT, ANTI-DRIFT PEDOMETER & ACTIVITY DASHBOARD
   ========================================================================== */

import {
  state,
  supabaseClient,
  saveState,
  getMissingSteps,
  getTierConfig,
  initSupabase,
  switchUserContext,
  performFullLogout
} from './state.js';

import {
  map,
  initMapAndRouting,
  switchMapLayer,
  invalidateMapSize,
  generateLoopRouteForSteps
} from './map.js';

import { setupStepDialModal } from './dial.js';
import { checkAdminAccess, loadAdminDashboard, initAdminAndPromos } from './admin.js';

function bootGoWalkApp() {
  // Eemalda vanad kellaühenduste ja "+" nupu elemendid
  const syncNavBtn = document.querySelector('.nav-item[data-target="syncModal"]');
  if (syncNavBtn) syncNavBtn.remove();
  const syncModalEl = document.getElementById('syncModal');
  if (syncModalEl) syncModalEl.remove();
  const quickAddBtn = document.getElementById('quickAddStepsBtn');
  if (quickAddBtn) quickAddBtn.remove();

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // ==========================================================================
  // KASUTAJAPROFIIL, REGISTREERUMISE TEKST JA PRO / LITE / STANDARD TASEMED
  // ==========================================================================

  function renderProfile() {
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userAvatar = document.getElementById('userAvatar');
    const userPlanBadge = document.getElementById('userPlanBadge');
    const googleAuthText = document.getElementById('googleAuthText');
    const headerProTag = document.querySelector('.pro-tag');

    if (userNameDisplay) userNameDisplay.textContent = state.profile.name;
    if (userAvatar) userAvatar.src = state.profile.avatar;
    if (userPlanBadge) userPlanBadge.textContent = state.profile.plan || 'Standard konto';

    if (googleAuthText) {
      googleAuthText.textContent = state.profile.email
        ? `Logi välja (${state.profile.email})`
        : 'Registreeru või logi sisse';
    }

    if (headerProTag) {
      const tierCfg = getTierConfig(state.profile.tier);
      headerProTag.textContent = tierCfg.headerTag;
      headerProTag.classList.remove('tier-pro', 'tier-lite', 'tier-standard');
      headerProTag.classList.add(`tier-${tierCfg.id}`);
    }
  }

  const editNameBtn = document.getElementById('editNameBtn');
  if (editNameBtn) {
    editNameBtn.addEventListener('click', () => {
      const newName = prompt('Sisesta oma kasutajanimi:', state.profile.name);
      if (newName && newName.trim().length > 0) {
        state.profile.name = newName.trim();
        saveState();
        renderProfile();
      }
    });
  }

  const editAvatarBtn = document.getElementById('editAvatarBtn');
  if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', () => {
      const randomSeed = 'GoWalk_' + Math.floor(Math.random() * 9999);
      state.profile.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomSeed}`;
      saveState();
      renderProfile();
    });
  }

  const googleAuthBtn = document.getElementById('googleAuthBtn');
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
      if (!supabaseClient) {
        alert('Pilveühendus luuakse, proovi hetke pärast uuesti.');
        return;
      }

      if (state.profile.email) {
        const confirmLogout = confirm(
          `Oled sisse logitud kui ${state.profile.email}.\n\nKas soovid välja logida?`
        );
        if (confirmLogout) {
          await performFullLogout();
        }
        return;
      }

      try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
      } catch (err) {
        const manualEmail = prompt(
          'Registreeru või logi sisse oma e-posti aadressiga:',
          ''
        );
        if (manualEmail && manualEmail.includes('@')) {
          const cleanEmail = manualEmail.trim().toLowerCase();
          await switchUserContext(
            'email_' + cleanEmail,
            cleanEmail,
            cleanEmail.split('@')[0],
            null,
            refreshAllUI
          );
        }
      }
    });
  }

  // ==========================================================================
  // LIUGMENÜÜ (DRAWER) & ALAMVAADETE NAVIGATSIOON
  // ==========================================================================

  const sidebarDrawer = document.getElementById('sidebarDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const navItems = document.querySelectorAll('.nav-item');
  const subviewModals = document.querySelectorAll('.subview-modal');

  function openDrawer() {
    if (sidebarDrawer) sidebarDrawer.classList.add('open');
    if (drawerOverlay) drawerOverlay.classList.add('open');
  }

  function closeDrawer() {
    if (sidebarDrawer) sidebarDrawer.classList.remove('open');
    if (drawerOverlay) drawerOverlay.classList.remove('open');
  }

  if (openDrawerBtn) openDrawerBtn.addEventListener('click', openDrawer);
  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      closeDrawer();

      subviewModals.forEach(m => m.classList.remove('open'));

      if (targetId !== 'home') {
        const modal = document.getElementById(targetId);
        if (modal) {
          if (targetId === 'statsModal') renderStatsAndHistory();
          if (targetId === 'adminModal') loadAdminDashboard();
          modal.classList.add('open');
        }
      } else {
        invalidateMapSize();
      }
    });
  });

  document.querySelectorAll('.close-subview').forEach(btn => {
    btn.addEventListener('click', () => {
      subviewModals.forEach(m => m.classList.remove('open'));
      navItems.forEach(n => n.classList.remove('active'));
      const homeNav = document.querySelector('.nav-item[data-target="home"]');
      if (homeNav) homeNav.classList.add('active');
    });
  });

  // ==========================================================================
  // KUUPÄEVADE NORMALISEERIMINE & TOPELTRIDADE PUHASTUS AJALOOS
  // ==========================================================================

  function normalizeDateKey(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') {
      return new Date().toISOString().slice(0, 10);
    }
    const clean = rawStr.trim();

    // 1. ISO formaat YYYY-MM-DD
    const isoMatch = clean.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // 2. Eesti formaat DD.MM.YYYY (nt "21.10.2026, 07:19:29")
    const eeMatch = clean.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (eeMatch) {
      const dd = String(eeMatch[1]).padStart(2, '0');
      const mm = String(eeMatch[2]).padStart(2, '0');
      const yyyy = eeMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    return state.today.date || new Date().toISOString().slice(0, 10);
  }

  function cleanAndMergeHistoryRecords() {
    const strideMeters = (state.settings.strideCm || 76) / 100;
    const todayKey = state.today.date || new Date().toISOString().slice(0, 10);
    const byDate = new Map();

    if (Array.isArray(state.history)) {
      state.history.forEach(item => {
        if (!item) return;
        const key = normalizeDateKey(item.date);
        const steps = Math.max(0, Number(item.steps) || 0);
        const existing = byDate.get(key);

        if (!existing || steps > existing.steps) {
          byDate.set(key, {
            date: key,
            steps,
            distanceKm: +((steps * strideMeters) / 1000).toFixed(2),
            calories: Math.round(steps * 0.04)
          });
        }
      });
    }

    // Kui ajaloos oli tänase kuupäeva kirje suurem kui state.today.steps, sünkrooni
    const todayFromHist = byDate.get(todayKey);
    if (todayFromHist && todayFromHist.steps > (state.today.steps || 0)) {
      state.today.steps = todayFromHist.steps;
    }

    // Hoia state.history sees ainult varasemad päevad (1 puhas rida iga kuupäeva kohta)
    byDate.delete(todayKey);
    const cleanedPast = Array.from(byDate.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    const needsCleanupSave =
      !Array.isArray(state.history) ||
      state.history.length !== cleanedPast.length ||
      state.history.some((r, idx) => r.date !== cleanedPast[idx]?.date);

    state.history = cleanedPast;
    if (needsCleanupSave) {
      saveState();
    }

    // Koosta kõigi päevade map (koos tänasega)
    const allDaysMap = new Map();
    cleanedPast.forEach(rec => allDaysMap.set(rec.date, rec));

    const todaySteps = Math.max(0, Number(state.today.steps) || 0);
    allDaysMap.set(todayKey, {
      date: todayKey,
      steps: todaySteps,
      distanceKm: +((todaySteps * strideMeters) / 1000).toFixed(2),
      calories: Math.round(todaySteps * 0.04),
      durationSec: state.today.durationSec || 0
    });

    return allDaysMap;
  }

  // ==========================================================================
  // ALUMINE HUD & TÄPNE SAMMULOENDUR (6-SAMMU PUHVER + GPS DRIFT FILTER)
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;
  let isWalking = false;
  let walkTimer = null;
  let lastTimerCheckMs = 0;

  let gpsWatchId = null;
  let lastGpsLatLng = null;
  let lastGpsTimestampMs = 0;
  let gpsRemainderMeters = 0;
  let sensorStepsSinceLastGps = 0;
  let livePositionDot = null;

  const STEP_MIN_INTERVAL_MS = 320;
  const STEP_MAX_INTERVAL_MS = 1200;
  const STEP_CONFIRM_COUNT = 6;
  const STEP_IMPULSE_THRESHOLD = 1.65;
  const STEP_REARM_THRESHOLD = -0.55;

  let motionListenerActive = false;
  let gravityMagEMA = 9.81;
  let stepArmed = true;
  let lastStepTimestamp = 0;
  let pendingStepBuffer = 0;
  let isCadenceActive = false;
  let wakeLockSentinel = null;

  function formatDuration(sec) {
    const totalSec = Math.max(0, Math.floor(sec || 0));
    const hrs = Math.floor(totalSec / 3600);
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${m}:${s}` : `${m}:${s}`;
  }

  function updateHudUI() {
    const steps = state.today.steps || 0;
    const goal = state.settings.stepGoal || 10000;
    const missing = getMissingSteps();
    const pct = Math.min(100, Math.round((steps / goal) * 100));

    const liveStepsEl = document.getElementById('liveSteps');
    if (liveStepsEl) liveStepsEl.textContent = steps.toLocaleString('et-EE');

    const goalLabelEl = document.getElementById('goalStepsLabel');
    if (goalLabelEl) goalLabelEl.textContent = goal.toLocaleString('et-EE');

    const hintBadge = document.getElementById('hudMissingHintBadge');
    if (hintBadge) {
      hintBadge.textContent =
        missing > 0 ? `Puudu ${missing.toLocaleString('et-EE')}` : 'Täidetud ✓';
    }

    const pctEl = document.getElementById('stepPercentText');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    const ringEl = document.getElementById('stepRingProgress');
    if (ringEl) ringEl.style.strokeDashoffset = offset;

    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.distanceKm = +((steps * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(steps * 0.04);

    const distEl = document.getElementById('liveDistance');
    const calEl = document.getElementById('liveCalories');
    const durEl = document.getElementById('liveDuration');

    if (distEl) distEl.textContent = state.today.distanceKm.toFixed(2);
    if (calEl) calEl.textContent = state.today.calories;
    if (durEl) durEl.textContent = formatDuration(state.today.durationSec || 0);
  }

  async function requestPocketWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
      } catch (e) {}
    }
  }

  async function releasePocketWakeLock() {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
      } catch (e) {}
      wakeLockSentinel = null;
    }
  }

  function handleDeviceMotion(event) {
    if (!isWalking) return;

    const accG = event.accelerationIncludingGravity;
    const accLinear = event.acceleration;
    let linearImpulse = 0;

    if (
      accG &&
      typeof accG.x === 'number' &&
      typeof accG.y === 'number' &&
      typeof accG.z === 'number'
    ) {
      const mag = Math.sqrt(accG.x * accG.x + accG.y * accG.y + accG.z * accG.z);
      gravityMagEMA = 0.9 * gravityMagEMA + 0.1 * mag;
      linearImpulse = mag - gravityMagEMA;
    } else if (
      accLinear &&
      typeof accLinear.x === 'number' &&
      typeof accLinear.y === 'number' &&
      typeof accLinear.z === 'number'
    ) {
      linearImpulse = Math.sqrt(
        accLinear.x * accLinear.x +
          accLinear.y * accLinear.y +
          accLinear.z * accLinear.z
      );
    } else {
      return;
    }

    const now = performance.now();

    if (lastStepTimestamp > 0 && now - lastStepTimestamp > STEP_MAX_INTERVAL_MS) {
      pendingStepBuffer = 0;
      isCadenceActive = false;
    }

    if (linearImpulse > STEP_IMPULSE_THRESHOLD && stepArmed) {
      const deltaMs = now - lastStepTimestamp;

      if (lastStepTimestamp > 0 && deltaMs < STEP_MIN_INTERVAL_MS) {
        return;
      }

      stepArmed = false;

      if (lastStepTimestamp > 0 && deltaMs >= STEP_MIN_INTERVAL_MS && deltaMs <= STEP_MAX_INTERVAL_MS) {
        if (isCadenceActive) {
          state.today.steps = (state.today.steps || 0) + 1;
          sensorStepsSinceLastGps += 1;
          updateHudUI();
          saveState();
        } else {
          pendingStepBuffer += 1;
          if (pendingStepBuffer >= STEP_CONFIRM_COUNT) {
            isCadenceActive = true;
            state.today.steps = (state.today.steps || 0) + pendingStepBuffer;
            sensorStepsSinceLastGps += pendingStepBuffer;
            pendingStepBuffer = 0;
            updateHudUI();
            saveState();
          }
        }
      } else {
        isCadenceActive = false;
        pendingStepBuffer = 1;
      }

      lastStepTimestamp = now;
    } else if (linearImpulse < STEP_REARM_THRESHOLD) {
      stepArmed = true;
    }
  }

  async function startMotionStepSensor() {
    if (typeof window.DeviceMotionEvent === 'undefined') return;

    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') return;
      }
    } catch (e) {}

    if (!motionListenerActive) {
      gravityMagEMA = 9.81;
      stepArmed = true;
      lastStepTimestamp = 0;
      pendingStepBuffer = 0;
      isCadenceActive = false;
      window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
      motionListenerActive = true;
    }
  }

  function stopMotionStepSensor() {
    if (motionListenerActive) {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      motionListenerActive = false;
    }
    pendingStepBuffer = 0;
    isCadenceActive = false;
  }

  function handleGpsPosition(pos) {
    if (!isWalking || !window.L || !map) return;

    const accuracy = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : 999;
    const currentLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);

    if (accuracy <= 50) {
      if (!livePositionDot) {
        livePositionDot = L.circleMarker(currentLatLng, {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 1
        }).addTo(map);
      } else {
        livePositionDot.setLatLng(currentLatLng);
      }
    }

    if (accuracy > 16) return;

    const nowMs = Date.now();

    if (!lastGpsLatLng || !lastGpsTimestampMs) {
      lastGpsLatLng = currentLatLng;
      lastGpsTimestampMs = nowMs;
      return;
    }

    const movedMeters = map.distance(lastGpsLatLng, currentLatLng);
    const deltaSec = (nowMs - lastGpsTimestampMs) / 1000;

    if (deltaSec <= 0.5) return;

    const minRequiredMeters = Math.max(8, accuracy * 0.7);

    if (movedMeters < minRequiredMeters) {
      if (deltaSec > 30) {
        lastGpsLatLng = currentLatLng;
        lastGpsTimestampMs = nowMs;
      }
      return;
    }

    const speedMps = movedMeters / deltaSec;
    const reportedSpeed = pos.coords.speed;

    if (typeof reportedSpeed === 'number' && !Number.isNaN(reportedSpeed) && reportedSpeed < 0.45) {
      lastGpsLatLng = currentLatLng;
      lastGpsTimestampMs = nowMs;
      return;
    }

    if (speedMps < 0.6 || speedMps > 3.2) {
      lastGpsLatLng = currentLatLng;
      lastGpsTimestampMs = nowMs;
      return;
    }

    lastGpsLatLng = currentLatLng;
    lastGpsTimestampMs = nowMs;
    gpsRemainderMeters += movedMeters;

    const strideMeters = (state.settings.strideCm || 76) / 100;
    const gpsCalculatedSteps = Math.floor(gpsRemainderMeters / strideMeters);

    if (gpsCalculatedSteps > 0) {
      gpsRemainderMeters -= gpsCalculatedSteps * strideMeters;

      const missingGpsSteps = Math.max(0, gpsCalculatedSteps - sensorStepsSinceLastGps);
      sensorStepsSinceLastGps = Math.max(0, sensorStepsSinceLastGps - gpsCalculatedSteps);

      if (missingGpsSteps > 0) {
        state.today.steps = (state.today.steps || 0) + missingGpsSteps;
        saveState();
        updateHudUI();
      }
    }
  }

  function syncWalkElapsedTime() {
    if (!isWalking || !lastTimerCheckMs) return;
    const nowMs = Date.now();
    const deltaSec = Math.floor((nowMs - lastTimerCheckMs) / 1000);
    if (deltaSec >= 1) {
      state.today.durationSec = (state.today.durationSec || 0) + deltaSec;
      lastTimerCheckMs += deltaSec * 1000;
      updateHudUI();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!isWalking) return;
    syncWalkElapsedTime();
    if (document.visibilityState === 'visible') {
      requestPocketWakeLock();
    }
  });

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');

  if (startWalkBtn) {
    startWalkBtn.addEventListener('click', async () => {
      isWalking = !isWalking;
      startWalkBtn.classList.toggle('walking-active', isWalking);

      if (isWalking) {
        if (startWalkText) startWalkText.textContent = 'Peata ja salvesta kõnd';
        lastGpsLatLng = null;
        lastGpsTimestampMs = 0;
        gpsRemainderMeters = 0;
        sensorStepsSinceLastGps = 0;
        lastTimerCheckMs = Date.now();

        await requestPocketWakeLock();
        await startMotionStepSensor();

        walkTimer = setInterval(syncWalkElapsedTime, 1000);

        if (navigator.geolocation && window.L) {
          gpsWatchId = navigator.geolocation.watchPosition(
            handleGpsPosition,
            err => console.warn('GPS jälgimise info:', err.message),
            { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
          );
        }
      } else {
        syncWalkElapsedTime();
        clearInterval(walkTimer);
        walkTimer = null;
        lastTimerCheckMs = 0;

        stopMotionStepSensor();
        await releasePocketWakeLock();

        if (gpsWatchId !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(gpsWatchId);
          gpsWatchId = null;
        }

        if (startWalkText) startWalkText.textContent = 'Alusta kõndimist';

        // Puhasta ja salvesta ilma sama kuupäeva topeltridu tekitamata
        cleanAndMergeHistoryRecords();
        saveState();
        updateHudUI();
      }
    });
  }

  // ==========================================================================
  // MODERNNE ACTIVITY STATISTIKA & AJALOO ARMATUURLAUD (PRO UI)
  // ==========================================================================

  let activeStatsPeriod = 'day'; // 'day' | 'week' | 'month' | 'year'
  let selectedStatsDateKey = state.today.date || new Date().toISOString().slice(0, 10);
  let activeChartBarIndex = null;

  function ensureActivityDashboardStyles() {
    if (document.getElementById('gowalk-activity-dashboard-css')) return;
    const style = document.createElement('style');
    style.id = 'gowalk-activity-dashboard-css';
    style.textContent = `
      .gw-activity-wrap {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: 18px;
      }
      /* 1. Ajaperioodi vahetaja (Segmented Tabs) */
      .gw-period-tabs {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        background: rgba(15, 11, 30, 0.72);
        border: 1px solid rgba(139, 92, 246, 0.18);
        border-radius: 999px;
        padding: 4px;
        gap: 4px;
      }
      .gw-period-tab {
        background: transparent;
        border: 1px solid transparent;
        color: rgba(203, 213, 225, 0.72);
        font-family: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        padding: 8px 6px;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.22s ease;
      }
      .gw-period-tab.active {
        background: rgba(139, 92, 246, 0.16);
        border-color: rgba(168, 85, 247, 0.85);
        color: #ffffff;
        box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
      }
      /* 2. Kuupäevade kapslite karussell (Date Pills) */
      .gw-date-strip {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 7px;
        align-items: center;
      }
      .gw-date-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 11px 4px;
        border-radius: 999px;
        background: rgba(20, 15, 38, 0.75);
        border: 1px solid rgba(139, 92, 246, 0.18);
        color: rgba(226, 232, 240, 0.78);
        cursor: pointer;
        transition: all 0.22s ease;
        user-select: none;
      }
      .gw-date-pill .gw-pill-num {
        font-size: 0.92rem;
        font-weight: 700;
        line-height: 1.1;
      }
      .gw-date-pill .gw-pill-day {
        font-size: 0.68rem;
        font-weight: 500;
        opacity: 0.75;
        text-transform: capitalize;
      }
      .gw-date-pill.has-steps:not(.active) {
        border-color: rgba(168, 85, 247, 0.42);
      }
      .gw-date-pill.active {
        background: linear-gradient(180deg, #ec4899 0%, #8b5cf6 52%, #06b6d4 100%);
        border-color: rgba(255, 255, 255, 0.45);
        color: #ffffff;
        box-shadow: 0 6px 20px rgba(168, 85, 247, 0.55), 0 0 14px rgba(6, 182, 212, 0.45);
        transform: translateY(-2px);
      }
      .gw-date-pill.active .gw-pill-day {
        opacity: 0.95;
        font-weight: 600;
      }
      .gw-date-pill.future {
        opacity: 0.35;
        pointer-events: none;
      }
      /* 3. Koondkaart (Activity Summary Card) */
      .gw-summary-card {
        background: linear-gradient(160deg, rgba(27, 20, 52, 0.88) 0%, rgba(15, 11, 30, 0.92) 100%);
        border: 1px solid rgba(139, 92, 246, 0.24);
        border-radius: 22px;
        padding: 18px 18px 15px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .gw-metric-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .gw-metric-icon {
        width: 34px;
        height: 34px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .gw-metric-icon svg {
        width: 18px;
        height: 18px;
      }
      .gw-metric-icon.steps-icon {
        background: rgba(6, 182, 212, 0.15);
        color: #22d3ee;
        box-shadow: 0 0 12px rgba(34, 211, 238, 0.22);
      }
      .gw-metric-icon.dist-icon {
        background: rgba(244, 63, 94, 0.15);
        color: #fb7185;
        box-shadow: 0 0 12px rgba(251, 113, 133, 0.22);
      }
      .gw-metric-icon.cal-icon {
        background: rgba(249, 115, 22, 0.16);
        color: #fb923c;
        box-shadow: 0 0 12px rgba(251, 146, 60, 0.22);
      }
      .gw-metric-val {
        font-size: 1.25rem;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.02em;
      }
      .gw-metric-goal {
        font-size: 0.82rem;
        font-weight: 500;
        color: rgba(148, 163, 184, 0.78);
        margin-left: 4px;
      }
      .gw-speed-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(139, 92, 246, 0.14);
      }
      .gw-speed-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: rgba(148, 163, 184, 0.85);
        white-space: nowrap;
      }
      .gw-speed-wave {
        flex: 1;
        height: 24px;
        overflow: visible;
      }
      .gw-speed-val {
        font-size: 0.84rem;
        font-weight: 700;
        color: #f8fafc;
        white-space: nowrap;
      }
      /* 4. Interaktiivne Tulpdiagramm ("Statistika") */
      .gw-chart-card {
        background: linear-gradient(160deg, rgba(24, 18, 46, 0.82) 0%, rgba(13, 10, 26, 0.9) 100%);
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 22px;
        padding: 16px 16px 14px;
        position: relative;
      }
      .gw-chart-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .gw-chart-title {
        font-size: 1rem;
        font-weight: 700;
        color: #ffffff;
      }
      .gw-chart-sub {
        font-size: 0.75rem;
        color: rgba(168, 85, 247, 0.9);
        font-weight: 600;
      }
      .gw-chart-stage {
        position: relative;
        height: 158px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding-top: 46px;
      }
      .gw-chart-tooltip {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        background: rgba(19, 14, 39, 0.94);
        border: 1px solid rgba(168, 85, 247, 0.55);
        border-radius: 12px;
        padding: 6px 10px;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.55), 0 0 12px rgba(168, 85, 247, 0.3);
        pointer-events: none;
        z-index: 5;
        white-space: nowrap;
        transition: left 0.2s ease;
      }
      .gw-tooltip-time {
        font-size: 0.65rem;
        color: rgba(148, 163, 184, 0.85);
        font-weight: 600;
        margin-bottom: 2px;
      }
      .gw-tooltip-metrics {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #ffffff;
      }
      .gw-dot-cyan { color: #22d3ee; }
      .gw-dot-pink { color: #fb7185; }
      .gw-dot-orange { color: #fb923c; }
      .gw-bars-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        height: 102px;
        gap: 5px;
        padding: 0 2px;
      }
      .gw-bar-col {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        cursor: pointer;
        position: relative;
      }
      .gw-bar-fill {
        width: 100%;
        max-width: 9px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.2);
        transition: height 0.28s ease, background 0.22s ease, box-shadow 0.22s ease;
        min-height: 8px;
      }
      .gw-bar-col.active .gw-bar-fill {
        background: linear-gradient(180deg, #ec4899 0%, #8b5cf6 52%, #22d3ee 100%);
        box-shadow: 0 0 12px rgba(236, 72, 153, 0.65), 0 0 16px rgba(34, 211, 238, 0.45);
      }
      .gw-bar-col.active::before {
        content: '';
        position: absolute;
        bottom: 0;
        top: -8px;
        width: 1px;
        background: linear-gradient(180deg, rgba(236, 72, 153, 0.8), transparent);
        pointer-events: none;
      }
      .gw-chart-axis {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        font-size: 0.68rem;
        color: rgba(148, 163, 184, 0.68);
        font-weight: 600;
      }
      /* 5. Kompaktsed üldnäitajad ja korrastatud ajalugu */
      .gw-lifetime-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      .gw-lifetime-box {
        background: rgba(20, 15, 38, 0.72);
        border: 1px solid rgba(139, 92, 246, 0.16);
        border-radius: 16px;
        padding: 12px 14px;
      }
      .gw-lifetime-label {
        font-size: 0.72rem;
        color: rgba(148, 163, 184, 0.78);
        display: block;
        margin-bottom: 4px;
      }
      .gw-lifetime-val {
        font-size: 1.15rem;
        font-weight: 800;
        color: #ffffff;
      }
      .gw-history-item-clickable {
        cursor: pointer;
        transition: border-color 0.2s ease, transform 0.15s ease;
      }
      .gw-history-item-clickable:hover,
      .gw-history-item-clickable.selected-day {
        border-color: rgba(168, 85, 247, 0.65) !important;
        background: rgba(139, 92, 246, 0.12) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function formatEstonianDatePretty(dateKey, todayKey) {
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    const d = new Date(yyyy, (mm || 1) - 1, dd || 1);
    const weekdays = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
    const months = [
      'jaan',
      'veebr',
      'märts',
      'apr',
      'mai',
      'juuni',
      'juuli',
      'aug',
      'sept',
      'okt',
      'nov',
      'dets'
    ];
    const wd = weekdays[d.getDay()];
    const mName = months[(mm || 1) - 1];
    if (dateKey === todayKey) {
      return `Täna (${wd}, ${dd}. ${mName})`;
    }
    return `${wd}, ${dd}. ${mName} ${yyyy}`;
  }

  function renderStatsAndHistory() {
    ensureActivityDashboardStyles();

    const statsModal = document.getElementById('statsModal');
    if (!statsModal) return;
    const modalBody = statsModal.querySelector('.subview-body');
    if (!modalBody) return;

    const allDaysMap = cleanAndMergeHistoryRecords();
    const todayKey = state.today.date || new Date().toISOString().slice(0, 10);

    if (!selectedStatsDateKey || !allDaysMap.has(selectedStatsDateKey)) {
      selectedStatsDateKey = todayKey;
    }

    const strideMeters = (state.settings.strideCm || 76) / 100;
    const dailyStepGoal = state.settings.stepGoal || 10000;

    // 1. Koosta 7-päevane kuupäevade karussell (5 eelmist päeva + täna + homme)
    const [tY, tM, tD] = todayKey.split('-').map(Number);
    const todayDateObj = new Date(tY, tM - 1, tD);
    const weekdayShort = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
    const datePills = [];

    for (let offset = -5; offset <= 1; offset++) {
      const d = new Date(todayDateObj);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const dayRec = allDaysMap.get(key);
      datePills.push({
        key,
        dayNum: day,
        dayName: weekdayShort[d.getDay()],
        isFuture: offset > 0,
        hasSteps: (dayRec?.steps || 0) > 0,
        isActive: key === selectedStatsDateKey
      });
    }

    // 2. Arvuta valitud perioodi koondnumbrid ja tulpdiagrammi andmed
    let periodSteps = 0;
    let periodGoalSteps = dailyStepGoal;
    let periodTitleLabel = '';
    let chartBars = [];
    let axisLabels = ['00:00', '12:00', '23:59'];

    const selectedDayRec = allDaysMap.get(selectedStatsDateKey) || {
      date: selectedStatsDateKey,
      steps: 0,
      distanceKm: 0,
      calories: 0
    };

    if (activeStatsPeriod === 'day') {
      periodSteps = selectedDayRec.steps || 0;
      periodGoalSteps = dailyStepGoal;
      periodTitleLabel = formatEstonianDatePretty(selectedStatsDateKey, todayKey);

      // 18 ajatulpade vahemikku (00:00 - 23:59)
      const weights = [0, 0, 0, 0, 0.04, 0.09, 0.14, 0.11, 0.08, 0.12, 0.18, 0.1, 0.08, 0.04, 0.02, 0, 0, 0];
      chartBars = weights.map((w, idx) => {
        const startH = Math.floor((idx * 24) / 18);
        const endH = Math.floor(((idx + 1) * 24) / 18);
        const slotSteps = periodSteps > 0 ? Math.round(periodSteps * w) : 0;
        return {
          label: `${String(startH).padStart(2, '0')}:00 - ${String(endH).padStart(2, '0')}:00`,
          steps: slotSteps,
          distanceKm: +((slotSteps * strideMeters) / 1000).toFixed(2),
          calories: Math.round(slotSteps * 0.04)
        };
      });
      axisLabels = ['00:00', '12:00', '23:59'];
    } else if (activeStatsPeriod === 'week') {
      periodGoalSteps = dailyStepGoal * 7;
      periodTitleLabel = 'Viimased 7 päeva';
      chartBars = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayDateObj);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const rec = allDaysMap.get(key);
        const st = rec ? rec.steps : 0;
        periodSteps += st;
        chartBars.push({
          label: `${weekdayShort[d.getDay()]} (${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')})`,
          steps: st,
          distanceKm: +((st * strideMeters) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        });
      }
      axisLabels = [chartBars[0].label.split(' ')[0], 'Nädala keskpaik', 'Täna'];
    } else if (activeStatsPeriod === 'month') {
      periodGoalSteps = dailyStepGoal * 30;
      periodTitleLabel = 'Viimased 30 päeva';
      chartBars = [];
      for (let i = 14; i >= 0; i--) {
        const d1 = new Date(todayDateObj);
        d1.setDate(d1.getDate() - i * 2);
        const d2 = new Date(todayDateObj);
        d2.setDate(d2.getDate() - (i * 2 + 1));

        const k1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
        const k2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
        const st = (allDaysMap.get(k1)?.steps || 0) + (allDaysMap.get(k2)?.steps || 0);
        periodSteps += st;
        chartBars.push({
          label: `${String(d1.getDate()).padStart(2, '0')}.${String(d1.getMonth() + 1).padStart(2, '0')}`,
          steps: st,
          distanceKm: +((st * strideMeters) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        });
      }
      axisLabels = ['30 p tagasi', '15 p tagasi', 'Täna'];
    } else {
      periodGoalSteps = dailyStepGoal * 365;
      periodTitleLabel = `Aasta ${tY}`;
      const monthNames = ['Jaan', 'Veebr', 'Märts', 'Apr', 'Mai', 'Juuni', 'Juuli', 'Aug', 'Sept', 'Okt', 'Nov', 'Dets'];
      const monthTotals = new Array(12).fill(0);
      allDaysMap.forEach(rec => {
        const [yStr, mStr] = rec.date.split('-');
        if (Number(yStr) === tY) {
          const mIdx = (Number(mStr) || 1) - 1;
          monthTotals[mIdx] += rec.steps || 0;
        }
      });
      periodSteps = monthTotals.reduce((a, b) => a + b, 0);
      chartBars = monthTotals.map((st, idx) => ({
        label: `${monthNames[idx]} ${tY}`,
        steps: st,
        distanceKm: +((st * strideMeters) / 1000).toFixed(2),
        calories: Math.round(st * 0.04)
      }));
      axisLabels = ['Jaan', 'Juuni', 'Dets'];
    }

    const periodDistKm = +((periodSteps * strideMeters) / 1000).toFixed(2);
    const periodGoalKm = +((periodGoalSteps * strideMeters) / 1000).toFixed(2);
    const periodCal = Math.round(periodSteps * 0.04);
    const periodGoalCal = Math.round(periodGoalSteps * 0.04);

    // Keskmine kiirus (km/h)
    let avgSpeedKmh = 0;
    if (periodSteps > 0) {
      if (
        activeStatsPeriod === 'day' &&
        selectedStatsDateKey === todayKey &&
        (state.today.durationSec || 0) > 60
      ) {
        const hrs = state.today.durationSec / 3600;
        avgSpeedKmh = Math.min(7.2, Math.max(3.6, +(periodDistKm / hrs).toFixed(1)));
      } else {
        avgSpeedKmh = 4.8;
      }
    }

    // Leia aktiivne tulp graafikul
    const maxBarSteps = Math.max(1, ...chartBars.map(b => b.steps));
    if (
      activeChartBarIndex === null ||
      activeChartBarIndex < 0 ||
      activeChartBarIndex >= chartBars.length
    ) {
      let peakIdx = chartBars.findIndex(b => b.steps === maxBarSteps && b.steps > 0);
      if (peakIdx === -1) peakIdx = Math.floor(chartBars.length / 2);
      activeChartBarIndex = peakIdx;
    }

    const activeBar = chartBars[activeChartBarIndex] || chartBars[0];
    const tooltipLeftPct = Math.min(
      82,
      Math.max(18, Math.round(((activeChartBarIndex + 0.5) / chartBars.length) * 100))
    );

    // 3. Üldnäitajad (Kokku sammud & seeria ilma topeltlugemiseta)
    const allSortedDays = Array.from(allDaysMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const totalStepsAllTime = allSortedDays.reduce((sum, r) => sum + (r.steps || 0), 0);
    const totalKmAllTime = ((totalStepsAllTime * strideMeters) / 1000).toFixed(1);
    const activeDaysCount = allSortedDays.filter(r => (r.steps || 0) > 0).length;

    modalBody.innerHTML = `
      <div class="gw-activity-wrap">
        <!-- 1. Ajaperioodi vahetaja -->
        <div class="gw-period-tabs">
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'day' ? 'active' : ''}" data-period="day">Päev</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'week' ? 'active' : ''}" data-period="week">Nädal</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'month' ? 'active' : ''}" data-period="month">Kuu</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'year' ? 'active' : ''}" data-period="year">Aasta</button>
        </div>

        <!-- 2. Kuupäevade horisontaalne karussell -->
        <div class="gw-date-strip">
          ${datePills
            .map(
              p => `
            <div class="gw-date-pill ${p.isActive ? 'active' : ''} ${p.isFuture ? 'future' : ''} ${p.hasSteps ? 'has-steps' : ''}" data-date="${p.key}">
              <span class="gw-pill-num">${p.dayNum}</span>
              <span class="gw-pill-day">${p.dayName}</span>
            </div>
          `
            )
            .join('')}
        </div>

        <!-- 3. Koondkaart (Activity Summary Card) -->
        <div class="gw-summary-card">
          <div class="gw-metric-row">
            <div class="gw-metric-icon steps-icon"><i data-lucide="footprints"></i></div>
            <div>
              <span class="gw-metric-val">${periodSteps.toLocaleString('et-EE')}</span>
              <span class="gw-metric-goal">/ ${periodGoalSteps.toLocaleString('et-EE')} sammu</span>
            </div>
          </div>

          <div class="gw-metric-row">
            <div class="gw-metric-icon dist-icon"><i data-lucide="map-pin"></i></div>
            <div>
              <span class="gw-metric-val">${periodDistKm.toFixed(2)}</span>
              <span class="gw-metric-goal">/ ${periodGoalKm.toFixed(2)} km</span>
            </div>
          </div>

          <div class="gw-metric-row">
            <div class="gw-metric-icon cal-icon"><i data-lucide="flame"></i></div>
            <div>
              <span class="gw-metric-val">${periodCal.toLocaleString('et-EE')}</span>
              <span class="gw-metric-goal">/ ${periodGoalCal.toLocaleString('et-EE')} kcal</span>
            </div>
          </div>

          <div class="gw-speed-row">
            <span class="gw-speed-label">Keskm. kiirus</span>
            <svg class="gw-speed-wave" viewBox="0 0 160 24" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gwSpeedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ec4899" stop-opacity="0.2" />
                  <stop offset="50%" stop-color="#a855f7" stop-opacity="0.95" />
                  <stop offset="100%" stop-color="#22d3ee" stop-opacity="1" />
                </linearGradient>
              </defs>
              <path d="M2,18 C25,17 38,12 58,15 C80,18 96,4 118,11 C134,16 146,6 158,9" fill="none" stroke="url(#gwSpeedGrad)" stroke-width="2.5" stroke-linecap="round" />
            </svg>
            <span class="gw-speed-val">${avgSpeedKmh.toFixed(1)} km/h</span>
          </div>
        </div>

        <!-- 4. Interaktiivne tulpdiagramm ("Statistika") -->
        <div class="gw-chart-card">
          <div class="gw-chart-header">
            <span class="gw-chart-title">Statistika</span>
            <span class="gw-chart-sub">${periodTitleLabel}</span>
          </div>

          <div class="gw-chart-stage">
            <div class="gw-chart-tooltip" style="left: ${tooltipLeftPct}%;">
              <div class="gw-tooltip-time">${activeBar.label}</div>
              <div class="gw-tooltip-metrics">
                <span><b class="gw-dot-cyan">●</b> ${activeBar.steps.toLocaleString('et-EE')}</span>
                <span><b class="gw-dot-pink">●</b> ${activeBar.distanceKm} km</span>
                <span><b class="gw-dot-orange">●</b> ${activeBar.calories} kcal</span>
              </div>
            </div>

            <div class="gw-bars-row">
              ${chartBars
                .map((bar, idx) => {
                  const pct =
                    bar.steps > 0
                      ? Math.max(16, Math.round((bar.steps / maxBarSteps) * 100))
                      : 10;
                  return `
                  <div class="gw-bar-col ${idx === activeChartBarIndex ? 'active' : ''}" data-bar-idx="${idx}">
                    <div class="gw-bar-fill" style="height: ${pct}%;"></div>
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>

          <div class="gw-chart-axis">
            <span>${axisLabels[0]}</span>
            <span>${axisLabels[1]}</span>
            <span>${axisLabels[2]}</span>
          </div>
        </div>

        <!-- 5. Üldsaavutused ja korrastatud päevade ajalugu -->
        <div class="gw-lifetime-grid">
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Kokku sammud</span>
            <span class="gw-lifetime-val">${totalStepsAllTime.toLocaleString('et-EE')}</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Läbitud distants</span>
            <span class="gw-lifetime-val">${totalKmAllTime} km</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Aktiivne seeria (Streak)</span>
            <span class="gw-lifetime-val">${Math.max(1, activeDaysCount)} päeva</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Aktiivseid päevi</span>
            <span class="gw-lifetime-val">${Math.max(1, activeDaysCount)}</span>
          </div>
        </div>

        <h4 class="section-subtitle" style="margin-top: 4px;">Salvestatud päevade ajalugu</h4>
        <div id="historyList" class="history-list">
          ${allSortedDays
            .map(
              rec => `
            <div class="history-item gw-history-item-clickable ${rec.date === selectedStatsDateKey ? 'selected-day' : ''}" data-history-date="${rec.date}">
              <div class="history-item-left">
                <span class="history-date">${formatEstonianDatePretty(rec.date, todayKey)}</span>
                <span class="history-meta">${Number(rec.distanceKm \vert{}\vert{} 0).toFixed(2)} km • ${rec.calories || 0} kcal</span>
              </div>
              <span class="history-steps-badge">${Number(rec.steps || 0).toLocaleString('et-EE')} sammu</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Sündmuste sidumine: Perioodi vahetus (Päev | Nädal | Kuu | Aasta)
    modalBody.querySelectorAll('.gw-period-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeStatsPeriod = btn.getAttribute('data-period') || 'day';
        activeChartBarIndex = null;
        renderStatsAndHistory();
      });
    });

    // Sündmuste sidumine: Kuupäeva kapsli valimine
    modalBody.querySelectorAll('.gw-date-pill:not(.future)').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedStatsDateKey = pill.getAttribute('data-date');
        activeStatsPeriod = 'day';
        activeChartBarIndex = null;
        renderStatsAndHistory();
      });
    });

    // Sündmuste sidumine: Tulpdiagrammi tulba puudutamine
    modalBody.querySelectorAll('.gw-bar-col').forEach(col => {
      col.addEventListener('click', () => {
        activeChartBarIndex = parseInt(col.getAttribute('data-bar-idx'), 10) || 0;
        renderStatsAndHistory();
      });
    });

    // Sündmuste sidumine: Ajaloo real klõpsamine näitab selle päeva graafikut
    modalBody.querySelectorAll('.gw-history-item-clickable').forEach(row => {
      row.addEventListener('click', () => {
        const dKey = row.getAttribute('data-history-date');
        if (dKey) {
          selectedStatsDateKey = dKey;
          activeStatsPeriod = 'day';
          activeChartBarIndex = null;
          renderStatsAndHistory();
        }
      });
    });
  }

  // ==========================================================================
  // SEADED & EKSPORT
  // ==========================================================================

  const settingStepGoal = document.getElementById('settingStepGoal');
  const settingStrideLength = document.getElementById('settingStrideLength');
  const settingMapStyle = document.getElementById('settingMapStyle');

  if (settingStepGoal) {
    settingStepGoal.value = state.settings.stepGoal;
    settingStepGoal.addEventListener('change', e => {
      state.settings.stepGoal = Math.max(1000, parseInt(e.target.value, 10) || 10000);
      saveState();
      updateHudUI();
    });
  }

  if (settingStrideLength) {
    settingStrideLength.value = state.settings.strideCm;
    settingStrideLength.addEventListener('change', e => {
      state.settings.strideCm = Math.max(40, parseInt(e.target.value, 10) || 76);
      saveState();
      updateHudUI();
    });
  }

  if (settingMapStyle) {
    settingMapStyle.value = state.settings.mapLayer;
    settingMapStyle.addEventListener('change', e => {
      switchMapLayer(e.target.value);
    });
  }

  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute('href', dataStr);
      dlAnchor.setAttribute(
        'download',
        `gowalk_ajalugu_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
    });
  }

  function refreshAllUI() {
    cleanAndMergeHistoryRecords();
    renderProfile();
    updateHudUI();
    checkAdminAccess();
  }

  // ==========================================================================
  // ALGLAADIMINE (KÕIK MOODULID JÄRJEST)
  // ==========================================================================
  setupStepDialModal(updateHudUI, generateLoopRouteForSteps);
  initMapAndRouting(updateHudUI);
  initAdminAndPromos(renderProfile);
  refreshAllUI();
  initSupabase(refreshAllUI);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGoWalkApp);
} else {
  bootGoWalkApp();
}
