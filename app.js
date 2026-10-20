/* ==========================================================================
   GOWALK PRO — 6. MAIN ENTRY POINT & MODULE ORCHESTRATOR
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

document.addEventListener('DOMContentLoaded', () => {
  // Eemalda vanad kellaühenduste ja "+" nupu elemendid
  const syncNavBtn = document.querySelector('.nav-item[data-target="syncModal"]');
  if (syncNavBtn) syncNavBtn.remove();
  const syncModalEl = document.getElementById('syncModal');
  if (syncModalEl) syncModalEl.remove();
  const quickAddBtn = document.getElementById('quickAddStepsBtn');
  if (quickAddBtn) quickAddBtn.remove();

  // Initsialiseeri Lucide'i vektoriikoonid kohe alguses
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

    // Uuendatud sisselogimise ja registreerumise tekst liugmenüüs
    if (googleAuthText) {
      googleAuthText.textContent = state.profile.email
        ? `Logi välja (${state.profile.email})`
        : 'Registreeru või logi sisse';
    }

    // Ülemise päise paketi märgis vastavalt kontotasemele (PRO / LITE / STD)
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
  // ALUMINE HUD PANEEL & PÄRIS GPS-KÕNDIMINE
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;
  let isWalking = false;
  let walkTimer = null;
  let gpsWatchId = null;
  let lastGpsLatLng = null;

  function formatDuration(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
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

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');

  if (startWalkBtn) {
    startWalkBtn.addEventListener('click', () => {
      isWalking = !isWalking;
      startWalkBtn.classList.toggle('walking-active', isWalking);

      if (isWalking) {
        if (startWalkText) startWalkText.textContent = 'Peata ja salvesta kõnd';
        lastGpsLatLng = null;

        walkTimer = setInterval(() => {
          state.today.durationSec = (state.today.durationSec || 0) + 1;
          updateHudUI();
        }, 1000);

        if (navigator.geolocation && window.L) {
          gpsWatchId = navigator.geolocation.watchPosition(
            pos => {
              const currentLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);
              if (lastGpsLatLng && map) {
                const movedMeters = map.distance(lastGpsLatLng, currentLatLng);
                if (movedMeters >= 4 && movedMeters < 150) {
                  const strideMeters = (state.settings.strideCm || 76) / 100;
                  const realAddedSteps = Math.round(movedMeters / strideMeters);
                  state.today.steps += realAddedSteps;
                  lastGpsLatLng = currentLatLng;
                  saveState();
                  updateHudUI();
                }
              } else {
                lastGpsLatLng = currentLatLng;
              }
            },
            err => console.warn('GPS jälgimise info:', err.message),
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
          );
        }
      } else {
        clearInterval(walkTimer);
        if (gpsWatchId !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(gpsWatchId);
          gpsWatchId = null;
        }
        if (startWalkText) startWalkText.textContent = 'Alusta kõndimist';
        if (state.today.steps > 0 || state.today.distanceKm > 0) {
          state.history.unshift({
            date: new Date().toLocaleString('et-EE'),
            steps: state.today.steps,
            distanceKm: state.today.distanceKm,
            calories: state.today.calories
          });
          saveState();
        }
      }
    });
  }

  // ==========================================================================
  // STATISTIKA & SEADED
  // ==========================================================================

  function renderStatsAndHistory() {
    const historicalSteps = state.history.reduce((sum, item) => sum + (item.steps || 0), 0);
    const totalSteps = historicalSteps + state.today.steps;
    const totalKm = ((totalSteps * (state.settings.strideCm / 100)) / 1000).toFixed(1);

    const totalStepsEl = document.getElementById('statTotalSteps');
    const totalKmEl = document.getElementById('statTotalKm');
    const totalWalksEl = document.getElementById('statTotalWalks');
    const streakEl = document.getElementById('statStreak');

    if (totalStepsEl) totalStepsEl.textContent = totalSteps.toLocaleString('et-EE');
    if (totalKmEl) totalKmEl.textContent = `${totalKm} km`;
    if (totalWalksEl) {
      totalWalksEl.textContent = state.history.length + (state.today.steps > 0 ? 1 : 0);
    }
    if (streakEl) streakEl.textContent = `${Math.max(1, state.history.length + 1)} päeva`;

    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    historyList.innerHTML = '';

    const allRecords = [
      {
        date: `Täna (${state.today.date})`,
        steps: state.today.steps,
        distanceKm: state.today.distanceKm,
        calories: state.today.calories
      },
      ...state.history
    ];

    allRecords.forEach(rec => {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `
        <div class="history-item-left">
          <span class="history-date">${rec.date}</span>
          <span class="history-meta">${Number(rec.distanceKm || 0).toFixed(2)} km • ${rec.calories || 0} kcal</span>
        </div>
        <span class="history-steps-badge">${Number(rec.steps || 0).toLocaleString('et-EE')} sammu</span>
      `;
      historyList.appendChild(row);
    });
  }

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
});
