/* ==========================================================================
   GOWALK PRO — 6. MAIN ENTRY POINT, PRECISION GPS, PAUSE/RESUME & WATCH SYNC
   ========================================================================== */

import {
  state,
  saveState,
  getMissingSteps,
  getTierConfig,
  initSupabase
} from './state.js';

import {
  map,
  initMapAndRouting,
  switchMapLayer,
  invalidateMapSize,
  generateLoopRouteForSteps,
  refreshRouteHint,
  appendWalkedTrackPoint,
  getWalkedTrackGeoJson
} from './map.js';

import { setupStepDialModal } from './dial.js';
import { checkAdminAccess, loadAdminDashboard, initAdminAndPromos } from './admin.js';
import { loadStatsModuleSafely } from './features/stats-loader.js';
import { setupPrecisionGpsLocator } from './features/gps-locator.js';
import { setupWatchAndPhoneSyncModal } from './features/watch-sync.js';
import { setupCustomMapStylePicker } from './features/map-style-picker.js';
import { setupStrideCalculator } from './features/stride-calculator.js';
import { setupProfileAndAuthModals } from './features/profile-auth.js';
import { applyMidnightIndigoThemeAndNav } from './features/theme-nav.js';
import { setupHealthSync } from './features/health.js';
import { setupNativeMode } from './features/native-mode.js';
import { setupSimpleHome, setupSimpleSettings } from './features/simple-home.js';


function bootGoWalkApp() {
  setupNativeMode();
  setupSimpleHome();
  setupSimpleSettings();
  const quickAddBtn = document.getElementById('quickAddStepsBtn');
  if (quickAddBtn) quickAddBtn.remove();

  const navList = document.querySelector('.drawer-nav, .sidebar-nav, #sidebarDrawer nav');
  let syncNavBtn = document.querySelector('.nav-item[data-target="syncModal"]');
  if (!syncNavBtn && navList) {
    syncNavBtn = document.createElement('button');
    syncNavBtn.className = 'nav-item';
    syncNavBtn.setAttribute('data-target', 'syncModal');
    syncNavBtn.innerHTML = '<span class="nav-icon"><i data-lucide="watch"></i></span><div class="nav-text"><span class="nav-title">Sammud ja import</span><span class="nav-sub">Käsitsi sisestus, kellafail (GPX/TCX)</span></div><i data-lucide="chevron-right" class="nav-arrow"></i>';
    navList.appendChild(syncNavBtn);
  } else if (syncNavBtn) {
    syncNavBtn.innerHTML = '<span class="nav-icon"><i data-lucide="watch"></i></span><div class="nav-text"><span class="nav-title">Sammud ja import</span><span class="nav-sub">Käsitsi sisestus, kellafail (GPX/TCX)</span></div><i data-lucide="chevron-right" class="nav-arrow"></i>';
  }

  const oldGenModal = document.getElementById('generatorModal');
  if (oldGenModal) {
    oldGenModal.classList.remove('open');
    oldGenModal.style.display = 'none';
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

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
        ? 'Logi välja (' + state.profile.email + ')'
        : 'Registreeru või logi sisse';
    }

    if (headerProTag) {
      const tierCfg = getTierConfig(state.profile.tier);
      headerProTag.textContent = tierCfg.headerTag;
      headerProTag.classList.remove('tier-pro', 'tier-lite', 'tier-standard');
      headerProTag.classList.add('tier-' + tierCfg.id);
    }
  }

  const editNameBtn = document.getElementById('editNameBtn');
  if (editNameBtn) {
    editNameBtn.addEventListener('click', function () {
      const nameOv = document.getElementById('gwNameModalOverlay');
      const nameInp = document.getElementById('gwProfileNameInput');
      if (nameOv && nameInp) {
        nameInp.value = state.profile.name || '';
        nameOv.classList.add('open');
        if (window.lucide) window.lucide.createIcons();
        setTimeout(function () {
          nameInp.focus();
          nameInp.select();
        }, 60);
      }
    });
  }

  const editAvatarBtn = document.getElementById('editAvatarBtn');
  if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', function () {
      const randomSeed = 'GoWalk_' + Math.floor(Math.random() * 9999);
      state.profile.avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + randomSeed;
      saveState();
      renderProfile();
    });
  }

  const googleAuthBtn = document.getElementById('googleAuthBtn');
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', function () {
      const authOv = document.getElementById('gwAuthModalOverlay');
      if (!authOv) return;

      const outPane = document.getElementById('gwAuthLoggedOutPane');
      const inPane = document.getElementById('gwAuthLoggedInPane');
      const curEmailEl = document.getElementById('gwAuthCurrentEmail');
      const fb = document.getElementById('gwAuthFeedback');
      if (fb) fb.textContent = '';

      if (state.profile.email) {
        if (outPane) outPane.style.display = 'none';
        if (inPane) inPane.style.display = 'flex';
        if (curEmailEl) curEmailEl.textContent = state.profile.email;
      } else {
        if (outPane) outPane.style.display = 'flex';
        if (inPane) inPane.style.display = 'none';
      }

      authOv.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  const sidebarDrawer = document.getElementById('sidebarDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');

  function setBottomNavActive(key) {
    const nav = document.getElementById('gwBottomNavbar');
    if (!nav) return;
    const btns = nav.querySelectorAll('.gw-bnav-btn');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-bnav') === key);
    }
  }

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

  function closeAllModalsAndGoHome() {
    closeDrawer();
    const subviewModals = document.querySelectorAll('.subview-modal');
    for (let i = 0; i < subviewModals.length; i++) {
      subviewModals[i].classList.remove('open');
    }
    const rbModal = document.getElementById('gwRouteBuilderModal');
    if (rbModal) rbModal.classList.remove('open');
    setBottomNavActive('home');
    invalidateMapSize();
  }

  function openRouteBuilderView() {
    closeDrawer();
    const subviewModals = document.querySelectorAll('.subview-modal');
    for (let i = 0; i < subviewModals.length; i++) {
      subviewModals[i].classList.remove('open');
    }
    const genM = document.getElementById('generatorModal');
    if (genM) genM.classList.remove('open');

    const rbModal = document.getElementById('gwRouteBuilderModal');
    if (rbModal) {
      const missing = getMissingSteps();
      const defSteps = missing >= 1000 ? Math.min(20000, Math.round(missing / 500) * 500) : 5000;
      const sliderEl = document.getElementById('gwRbSlider');
      if (sliderEl) {
        sliderEl.value = String(defSteps);
        sliderEl.dispatchEvent(new Event('input'));
      }
      rbModal.classList.add('open');
      setBottomNavActive('routes');
    }
  }

  function openStatsView() {
    closeAllModalsAndGoHome();
    const modal = document.getElementById('statsModal');
    if (modal) {
      loadStatsModuleSafely()
        .then(function (mod) {
          if (mod && typeof mod.renderStatsAndHistory === 'function') {
            mod.renderStatsAndHistory();
          }
        })
        .catch(function (err) {
          console.error(err);
        });
      modal.classList.add('open');
      setBottomNavActive('stats');
    }
  }

  function openSettingsView() {
    closeAllModalsAndGoHome();
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.add('open');
      setBottomNavActive('settings');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // ==========================================================================
  // ALUMINE HUD, PAUS / JÄTKA & TÄPNE SAMMULOENDUR (6-SAMMU PUHVER + GPS FILTER)
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;
  let isWalking = false;
  let isPaused = false;
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
    return hrs > 0 ? hrs + ':' + m + ':' + s : m + ':' + s;
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
      if (isWalking && isPaused) {
        hintBadge.textContent = 'Pausil ⏸';
      } else {
        hintBadge.textContent = missing > 0 ? 'Puudu ' + missing.toLocaleString('et-EE') : 'Täidetud ✓';
      }
    }

    refreshRouteHint();

    const pctEl = document.getElementById('stepPercentText');
    if (pctEl) pctEl.textContent = pct + '%';

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
    if (durEl) {
      durEl.textContent = formatDuration(state.today.durationSec || 0);
      durEl.classList.toggle('paused-blink', Boolean(isWalking && isPaused));
    }
  }

  setupWatchAndPhoneSyncModal(updateHudUI, closeAllModalsAndGoHome);

  const navItems = document.querySelectorAll('.nav-item');
  for (let i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener('click', function () {
      const targetId = this.getAttribute('data-target');
      for (let j = 0; j < navItems.length; j++) navItems[j].classList.remove('active');
      this.classList.add('active');
      closeDrawer();

      const subviewModals = document.querySelectorAll('.subview-modal');
      for (let k = 0; k < subviewModals.length; k++) subviewModals[k].classList.remove('open');

      if (targetId === 'statsModal') {
        openStatsView();
      } else if (targetId === 'settingsModal') {
        openSettingsView();
      } else if (targetId !== 'home') {
        const modal = document.getElementById(targetId);
        if (modal) {
          if (targetId === 'adminModal') loadAdminDashboard();
          if (targetId === 'syncModal') {
            const inp = document.getElementById('gwSyncStepsInput');
            if (inp) inp.value = String(state.today.steps || 0);
          }
          modal.classList.add('open');
          if (window.lucide) window.lucide.createIcons();
        }
      } else {
        closeAllModalsAndGoHome();
      }
    });
  }

  const closeBtns = document.querySelectorAll('.close-subview');
  for (let i = 0; i < closeBtns.length; i++) {
    closeBtns[i].addEventListener('click', function () {
      closeAllModalsAndGoHome();
    });
  }

  document.addEventListener(
    'click',
    function (e) {
      const genBtn = e.target.closest('#openGeneratorBtn, [data-target="generatorModal"]');
      if (genBtn) {
        e.preventDefault();
        e.stopPropagation();
        openRouteBuilderView();
      }
    },
    true
  );

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
    if (!isWalking || isPaused) return;

    const accG = event.accelerationIncludingGravity;
    const accLinear = event.acceleration;
    let linearImpulse = 0;

    if (accG && typeof accG.x === 'number') {
      const mag = Math.sqrt(accG.x * accG.x + accG.y * accG.y + accG.z * accG.z);
      gravityMagEMA = 0.9 * gravityMagEMA + 0.1 * mag;
      linearImpulse = mag - gravityMagEMA;
    } else if (accLinear && typeof accLinear.x === 'number') {
      linearImpulse = Math.sqrt(
        accLinear.x * accLinear.x + accLinear.y * accLinear.y + accLinear.z * accLinear.z
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
      if (lastStepTimestamp > 0 && deltaMs < STEP_MIN_INTERVAL_MS) return;

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
          fillColor: '#38bdf8',
          fillOpacity: 1
        }).addTo(map);
      } else {
        livePositionDot.setLatLng(currentLatLng);
      }

      if (!isPaused) {
        appendWalkedTrackPoint(currentLatLng);
      }
    }

    if (isPaused || accuracy > 16) return;

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
    if (!isWalking || isPaused || !lastTimerCheckMs) return;
    const nowMs = Date.now();
    const deltaSec = Math.floor((nowMs - lastTimerCheckMs) / 1000);
    if (deltaSec >= 1) {
      state.today.durationSec = (state.today.durationSec || 0) + deltaSec;
      lastTimerCheckMs += deltaSec * 1000;
      updateHudUI();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!isWalking) return;
    if (!isPaused) {
      syncWalkElapsedTime();
    }
    if (document.visibilityState === 'visible') {
      requestPocketWakeLock();
    }
  });

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');
  const actionRow = document.querySelector('.hud-action-row');

  let pauseWalkBtn = document.getElementById('pauseWalkBtn');
  if (!pauseWalkBtn && actionRow && startWalkBtn) {
    pauseWalkBtn = document.createElement('button');
    pauseWalkBtn.type = 'button';
    pauseWalkBtn.id = 'pauseWalkBtn';
    pauseWalkBtn.innerHTML = '<i data-lucide="pause"></i><span>Paus</span>';
    actionRow.insertBefore(pauseWalkBtn, startWalkBtn);
  }

  function renderPauseButtonState() {
    if (!pauseWalkBtn) return;
    if (!isWalking) {
      pauseWalkBtn.classList.remove('visible', 'paused-active');
      return;
    }
    pauseWalkBtn.classList.add('visible');
    pauseWalkBtn.classList.toggle('paused-active', isPaused);
    pauseWalkBtn.innerHTML = isPaused
      ? '<i data-lucide="play"></i><span>Jätka</span>'
      : '<i data-lucide="pause"></i><span>Paus</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  if (pauseWalkBtn) {
    pauseWalkBtn.addEventListener('click', function () {
      if (!isWalking) return;

      if (!isPaused) {
        syncWalkElapsedTime();
        isPaused = true;
        lastTimerCheckMs = 0;
        lastGpsLatLng = null;
        lastGpsTimestampMs = 0;
        pendingStepBuffer = 0;
        isCadenceActive = false;
        if (startWalkText) startWalkText.textContent = 'Lõpeta ja salvesta';
      } else {
        isPaused = false;
        lastTimerCheckMs = Date.now();
        lastGpsLatLng = null;
        lastGpsTimestampMs = 0;
        pendingStepBuffer = 0;
        isCadenceActive = false;
        if (startWalkText) startWalkText.textContent = 'Lõpeta ja salvesta';
      }

      renderPauseButtonState();
      updateHudUI();
      saveState();
    });
  }

  if (startWalkBtn) {
    startWalkBtn.addEventListener('click', async function () {
      isWalking = !isWalking;
      startWalkBtn.classList.toggle('walking-active', isWalking);

      if (isWalking) {
        isPaused = false;
        if (startWalkText) startWalkText.textContent = 'Lõpeta ja salvesta';
        renderPauseButtonState();

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
            function () {},
            { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
          );
        }
        updateHudUI();
      } else {
        if (!isPaused) {
          syncWalkElapsedTime();
        }
        isPaused = false;
        renderPauseButtonState();

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

        state.today.walkTrack = getWalkedTrackGeoJson();

        loadStatsModuleSafely()
          .then(function (mod) {
            if (mod && typeof mod.cleanAndMergeHistoryRecords === 'function') {
              mod.cleanAndMergeHistoryRecords();
            }
            saveState();
            updateHudUI();
          })
          .catch(function () {
            saveState();
            updateHudUI();
          });
      }
    });
  }

  const settingStepGoal = document.getElementById('settingStepGoal');
  const settingStrideLength = document.getElementById('settingStrideLength');
  const settingMapStyle = document.getElementById('settingMapStyle');

  if (settingStepGoal) {
    settingStepGoal.value = state.settings.stepGoal;
    settingStepGoal.addEventListener('change', function (e) {
      state.settings.stepGoal = Math.max(1000, parseInt(e.target.value, 10) || 10000);
      saveState();
      updateHudUI();
    });
  }

  if (settingStrideLength) {
    settingStrideLength.value = state.settings.strideCm;
    settingStrideLength.addEventListener('change', function (e) {
      state.settings.strideCm = Math.max(40, parseInt(e.target.value, 10) || 76);
      saveState();
      updateHudUI();
    });
  }

  if (settingMapStyle) {
    settingMapStyle.value = state.settings.mapLayer;
    settingMapStyle.addEventListener('change', function (e) {
      switchMapLayer(e.target.value);
    });
  }

  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute('href', dataStr);
      dlAnchor.setAttribute(
        'download',
        'gowalk_ajalugu_' + new Date().toISOString().slice(0, 10) + '.json'
      );
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
    });
  }

  function refreshAllUI() {
    renderProfile();
    updateHudUI();
    checkAdminAccess();
    loadStatsModuleSafely()
      .then(function (mod) {
        if (mod && typeof mod.initStatsModule === 'function') {
          mod.initStatsModule();
        }
      })
      .catch(function () {});
  }

  setupPrecisionGpsLocator();
  setupStepDialModal(updateHudUI, generateLoopRouteForSteps);
  initMapAndRouting(updateHudUI);
  initAdminAndPromos(renderProfile);
  applyMidnightIndigoThemeAndNav(
    openRouteBuilderView,
    openStatsView,
    openSettingsView,
    closeAllModalsAndGoHome
  );
  setupStrideCalculator(updateHudUI);
  setupCustomMapStylePicker();
  setupProfileAndAuthModals(renderProfile, refreshAllUI);
  setupHealthSync(updateHudUI);
  refreshAllUI();
  initSupabase(refreshAllUI);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGoWalkApp);
} else {
  bootGoWalkApp();
}
