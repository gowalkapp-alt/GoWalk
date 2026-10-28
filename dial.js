/* ==========================================================================
   GOWALK PRO — DIAL.JS (INTERACTIVE STEP DIAL, HUD TRIGGER & CALCULATORS)
   ========================================================================== */

import { state, saveState, getMissingSteps } from './state.js';
import { generateLoopRouteForSteps, switchMapLayer } from './map.js';

const LUCIDE_SVGS = {
  sparkles:
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.2 1.2L3 12l5.8 1.9a2 2 0 0 1 1.2 1.2L12 21l1.9-5.8a2 2 0 0 1 1.2-1.2L21 12l-5.8-1.9a2 2 0 0 1-1.2-1.2Z"/></svg>',
  check:
    '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x:
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
};

function injectDialAndHudStyles() {
  if (document.getElementById('gw-dial-complete-styles')) return;
  const st = document.createElement('style');
  st.id = 'gw-dial-complete-styles';
  st.textContent = [
    /* Keela Chrome Touch-to-Search ("Puudutage otsingutulemuste nägemiseks") HUD kaardil */
    '.hud-card, .bottom-hud, #bottomHud, #liveSteps, #goalStepsLabel, #stepPercentText, #hudMissingHintBadge {',
    '  -webkit-user-select: none !important;',
    '  user-select: none !important;',
    '  -webkit-touch-callout: none !important;',
    '}',
    '.gw-hud-clickable {',
    '  cursor: pointer !important;',
    '}',
    '#hudMissingHintBadge {',
    '  display: inline-flex !important;',
    '  align-items: center;',
    '  padding: 5px 11px;',
    '  border-radius: 999px;',
    '  background: rgba(168, 85, 247, 0.22);',
    '  border: 1px solid rgba(236, 72, 153, 0.45);',
    '  color: #f8fafc;',
    '  font-size: 0.75rem;',
    '  font-weight: 700;',
    '  margin-left: auto;',
    '  white-space: nowrap;',
    '  cursor: pointer;',
    '}',
    /* Sammuratta modaalaken */
    '.gw-dial-overlay {',
    '  position: fixed;',
    '  inset: 0;',
    '  background: rgba(7, 10, 22, 0.86);',
    '  backdrop-filter: blur(14px);',
    '  z-index: 4000;',
    '  display: none;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 16px;',
    '}',
    '.gw-dial-overlay.open {',
    '  display: flex !important;',
    '}',
    '.gw-dial-modal-card {',
    '  width: 100%;',
    '  max-width: 390px;',
    '  background: linear-gradient(165deg, rgba(28, 34, 74, 0.98) 0%, rgba(14, 18, 38, 0.99) 100%) !important;',
    '  border: 1px solid rgba(236, 72, 153, 0.48) !important;',
    '  border-radius: 28px !important;',
    '  padding: 20px 18px !important;',
    '  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.75), 0 0 32px rgba(168, 85, 247, 0.28) !important;',
    '  color: #f8fafc;',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 14px;',
    '}',
    '.gw-dial-top {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '}',
    '.gw-dial-title {',
    '  font-size: 1.08rem;',
    '  font-weight: 800;',
    '  color: #ffffff;',
    '}',
    '.gw-dial-close {',
    '  width: 34px;',
    '  height: 34px;',
    '  border-radius: 50%;',
    '  background: rgba(30, 41, 59, 0.85);',
    '  border: 1px solid rgba(168, 85, 247, 0.38);',
    '  color: #ffffff;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '}',
    '.gw-dial-tabs {',
    '  display: grid;',
    '  grid-template-columns: 1fr 1fr;',
    '  gap: 6px;',
    '  background: rgba(11, 15, 34, 0.92);',
    '  padding: 4px;',
    '  border-radius: 14px;',
    '  border: 1px solid rgba(168, 85, 247, 0.28);',
    '}',
    '.gw-dial-tab {',
    '  background: transparent;',
    '  border: 1px solid transparent;',
    '  color: #94a3b8;',
    '  font: 700 0.82rem inherit;',
    '  padding: 9px 8px;',
    '  border-radius: 10px;',
    '  cursor: pointer;',
    '  transition: 0.2s;',
    '}',
    '.gw-dial-tab.active {',
    '  background: linear-gradient(90deg, #7c3aed 0%, #c026d3 52%, #ec4899 100%) !important;',
    '  color: #ffffff !important;',
    '  border-color: rgba(244, 114, 182, 0.55) !important;',
    '  box-shadow: 0 4px 14px rgba(217, 70, 239, 0.4);',
    '}',
    '.gw-dial-wheel-wrap {',
    '  position: relative;',
    '  width: 224px;',
    '  height: 224px;',
    '  margin: 2px auto;',
    '  touch-action: none;',
    '  user-select: none;',
    '}',
    '.gw-dial-svg {',
    '  width: 100%;',
    '  height: 100%;',
    '  transform: rotate(-90deg);',
    '  overflow: visible;',
    '}',
    '.gw-dial-track {',
    '  fill: none;',
    '  stroke: rgba(168, 85, 247, 0.18);',
    '  stroke-width: 14;',
    '}',
    '.gw-dial-prog {',
    '  fill: none;',
    '  stroke: #ec4899;',
    '  stroke-width: 14;',
    '  stroke-linecap: round;',
    '  filter: drop-shadow(0 0 10px rgba(236, 72, 153, 0.7));',
    '}',
    '.gw-dial-thumb {',
    '  position: absolute;',
    '  width: 26px;',
    '  height: 26px;',
    '  border-radius: 50%;',
    '  background: #ffffff;',
    '  border: 4px solid #ec4899;',
    '  box-shadow: 0 0 16px rgba(236, 72, 153, 0.9);',
    '  transform: translate(-50%, -50%);',
    '  pointer-events: none;',
    '}',
    '.gw-dial-center {',
    '  position: absolute;',
    '  inset: 28px;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  text-align: center;',
    '}',
    '.gw-dial-input {',
    '  width: 140px;',
    '  background: rgba(12, 16, 36, 0.75);',
    '  border: 1px solid rgba(236, 72, 153, 0.42);',
    '  border-radius: 12px;',
    '  color: #ffffff;',
    '  font: 800 1.75rem inherit;',
    '  text-align: center;',
    '  padding: 4px 6px;',
    '  outline: none;',
    '}',
    '.gw-dial-input:focus {',
    '  border-color: #ec4899;',
    '  box-shadow: 0 0 14px rgba(236, 72, 153, 0.5);',
    '}',
    '.gw-dial-unit {',
    '  font-size: 0.76rem;',
    '  color: #cbd5e1;',
    '  font-weight: 600;',
    '  margin-top: 5px;',
    '}',
    '.gw-dial-missing {',
    '  text-align: center;',
    '  font-size: 0.8rem;',
    '  font-weight: 700;',
    '  color: #f472b6;',
    '  background: rgba(236, 72, 153, 0.14);',
    '  border: 1px solid rgba(236, 72, 153, 0.35);',
    '  border-radius: 999px;',
    '  padding: 6px 12px;',
    '  align-self: center;',
    '}',
    '.gw-dial-qbtns {',
    '  display: grid;',
    '  grid-template-columns: repeat(4, 1fr);',
    '  gap: 8px;',
    '}',
    '.gw-dial-qbtn {',
    '  background: rgba(24, 30, 64, 0.94);',
    '  border: 1px solid rgba(168, 85, 247, 0.36);',
    '  color: #ffffff;',
    '  border-radius: 13px;',
    '  padding: 9px 4px;',
    '  font: 700 0.8rem inherit;',
    '  cursor: pointer;',
    '}',
    '.gw-dial-qbtn:active {',
    '  background: rgba(236, 72, 153, 0.28);',
    '  border-color: #ec4899;',
    '}',
    '.gw-dial-actions {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 8px;',
    '  margin-top: 2px;',
    '}',
    '.gw-dial-route-btn {',
    '  width: 100%;',
    '  padding: 13px 14px;',
    '  border-radius: 999px;',
    '  background: linear-gradient(90deg, #7c3aed 0%, #c026d3 52%, #ec4899 100%) !important;',
    '  border: 1px solid rgba(244, 114, 182, 0.55) !important;',
    '  color: #ffffff !important;',
    '  font: 800 0.9rem inherit;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  gap: 8px;',
    '  cursor: pointer;',
    '  box-shadow: 0 6px 20px rgba(217, 70, 239, 0.44);',
    '}',
    '.gw-dial-save-btn {',
    '  width: 100%;',
    '  padding: 11px 14px;',
    '  border-radius: 999px;',
    '  background: rgba(22, 27, 58, 0.94);',
    '  border: 1px solid rgba(168, 85, 247, 0.36);',
    '  color: #e2e8f0;',
    '  font: 700 0.84rem inherit;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  gap: 6px;',
    '  cursor: pointer;',
    '}'
  ].join('\n');
  document.head.appendChild(st);
}

export function setupStepDialModal(updateHudFn, generateRouteFn) {
  injectDialAndHudStyles();

  // 1. Tagame, et HUD kaardil on "Puudu X" märgis olemas
  const liveStepsEl = document.getElementById('liveSteps');
  const goalLabelEl = document.getElementById('goalStepsLabel');
  if (liveStepsEl && !document.getElementById('hudMissingHintBadge')) {
    const rowEl = liveStepsEl.parentElement;
    if (rowEl) {
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'baseline';
      rowEl.style.flexWrap = 'wrap';
      rowEl.style.gap = '6px';
      const badge = document.createElement('span');
      badge.id = 'hudMissingHintBadge';
      const miss = getMissingSteps();
      badge.textContent = miss > 0 ? 'Puudu ' + miss.toLocaleString('et-EE') : 'Täidetud ✓';
      rowEl.appendChild(badge);
    }
  }

  // 2. Ehitame või leiame Sammuratta modaalakna
  let overlay = document.getElementById('gwStepDialOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gwStepDialOverlay';
    overlay.className = 'gw-dial-overlay';

    const radius = 92;
    const circum = +(2 * Math.PI * radius).toFixed(2);

    overlay.innerHTML = [
      '<div class="gw-dial-modal-card dial-modal-card">',
        '<div class="gw-dial-top">',
          '<span class="gw-dial-title">Seadista sammud & eesmärk</span>',
          '<button type="button" class="gw-dial-close" id="closeDialBtn">' + LUCIDE_SVGS.x + '</button>',
        '</div>',

        '<div class="gw-dial-tabs">',
          '<button type="button" class="gw-dial-tab active" data-dmode="walked">Täna tehtud</button>',
          '<button type="button" class="gw-dial-tab" data-dmode="goal">Päeva eesmärk</button>',
        '</div>',

        '<div class="gw-dial-wheel-wrap" id="gwDialWheelWrap">',
          '<svg class="gw-dial-svg" viewBox="0 0 224 224">',
            '<circle class="gw-dial-track" cx="112" cy="112" r="' + radius + '"></circle>',
            '<circle class="gw-dial-prog" id="dialProgressRing" cx="112" cy="112" r="' + radius + '" stroke-dasharray="' + circum + '" stroke-dashoffset="' + circum + '"></circle>',
          '</svg>',
          '<div class="gw-dial-thumb" id="dialThumb"></div>',
          '<div class="gw-dial-center">',
            '<input type="text" inputmode="numeric" class="gw-dial-input" id="dialBigInput" value="0" />',
            '<div class="gw-dial-unit" id="dialUnitSub">sammu • ~0.00 km</div>',
          '</div>',
        '</div>',

        '<div class="gw-dial-missing" id="dialMissingSummary">Puudu: 10 000 sammu</div>',

        '<div class="gw-dial-qbtns">',
          '<button type="button" class="gw-dial-qbtn dial-step-btn" data-dstep="-1000">-1000</button>',
          '<button type="button" class="gw-dial-qbtn dial-step-btn" data-dstep="-500">-500</button>',
          '<button type="button" class="gw-dial-qbtn dial-step-btn" data-dstep="500">+500</button>',
          '<button type="button" class="gw-dial-qbtn dial-step-btn" data-dstep="1000">+1000</button>',
        '</div>',

        '<div class="gw-dial-actions">',
          '<button type="button" class="gw-dial-route-btn" id="dialSaveAndRouteBtn">',
            LUCIDE_SVGS.sparkles,
            '<span>Salvesta & koosta 10 000 sammu ring</span>',
          '</button>',
          '<button type="button" class="gw-dial-save-btn" id="dialSaveOnlyBtn">',
            LUCIDE_SVGS.check,
            '<span>Salvesta ainult sammud</span>',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
  }

  const radius = 92;
  const circum = 2 * Math.PI * radius;
  const wheelWrap = overlay.querySelector('#gwDialWheelWrap');
  const progRing = overlay.querySelector('#dialProgressRing');
  const thumbEl = overlay.querySelector('#dialThumb');
  const bigInputEl = overlay.querySelector('#dialBigInput');
  const unitSubEl = overlay.querySelector('#dialUnitSub');
  const missingSummaryEl = overlay.querySelector('#dialMissingSummary');
  const routeBtnEl = overlay.querySelector('#dialSaveAndRouteBtn');
  const saveOnlyBtnEl = overlay.querySelector('#dialSaveOnlyBtn');

  let activeMode = 'walked'; // 'walked' või 'goal'
  let tempWalkedSteps = 0;
  let tempGoalSteps = 10000;
  let isDraggingWheel = false;

  function renderDialState(formatInputDisplay) {
    const strideMeters = ((state.settings && state.settings.strideCm) || 76) / 100;
    const activeVal = activeMode === 'walked' ? tempWalkedSteps : tempGoalSteps;
    const maxScale = activeMode === 'walked' ? Math.max(tempGoalSteps, 15000) : 25000;

    const ratio = Math.max(0, Math.min(1, activeVal / maxScale));
    const offset = circum - ratio * circum;
    if (progRing) {
      progRing.style.strokeDashoffset = String(offset);
    }

    const angleRad = ratio * 2 * Math.PI - Math.PI / 2;
    const cx = 112 + radius * Math.cos(angleRad);
    const cy = 112 + radius * Math.sin(angleRad);
    if (thumbEl) {
      thumbEl.style.left = cx + 'px';
      thumbEl.style.top = cy + 'px';
    }

    if (bigInputEl && formatInputDisplay && document.activeElement !== bigInputEl) {
      bigInputEl.value = activeVal.toLocaleString('et-EE');
    }

    const activeKm = ((activeVal * strideMeters) / 1000).toFixed(2);
    if (unitSubEl) {
      unitSubEl.textContent = 'sammu • ~' + activeKm + ' km';
    }

    const missing = Math.max(0, tempGoalSteps - tempWalkedSteps);
    const missingKm = ((missing * strideMeters) / 1000).toFixed(2);

    if (missingSummaryEl) {
      if (missing > 0) {
        missingSummaryEl.textContent =
          'Puudu: ' + missing.toLocaleString('et-EE') + ' sammu (~' + missingKm + ' km)';
      } else {
        missingSummaryEl.textContent = 'Päeva eesmärk täidetud ✓';
      }
    }

    if (routeBtnEl) {
      const btnText =
        missing > 0
          ? 'Salvesta & koosta ' + missing.toLocaleString('et-EE') + ' sammu ring'
          : 'Salvesta & koosta lisaring (3 000)';
      routeBtnEl.innerHTML = LUCIDE_SVGS.sparkles + '<span>' + btnText + '</span>';
    }
  }

  function openDialModal(defaultMode) {
    tempWalkedSteps = Math.max(0, parseInt(state.today && state.today.steps, 10) || 0);
    tempGoalSteps = Math.max(1000, parseInt(state.settings && state.settings.stepGoal, 10) || 10000);
    activeMode = defaultMode === 'goal' ? 'goal' : 'walked';

    const tabs = overlay.querySelectorAll('.gw-dial-tab');
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-dmode') === activeMode);
    }

    renderDialState(true);
    overlay.classList.add('open');
  }

  function updateFromPointerEvent(clientX, clientY) {
    if (!wheelWrap) return;
    const rect = wheelWrap.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let angle = Math.atan2(clientY - centerY, clientX - centerX) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    const ratio = Math.max(0, Math.min(1, angle / (2 * Math.PI)));
    const maxScale = activeMode === 'walked' ? Math.max(tempGoalSteps, 15000) : 25000;
    const rawSteps = Math.round((ratio * maxScale) / 100) * 100;

    if (activeMode === 'walked') {
      tempWalkedSteps = Math.max(0, Math.min(50000, rawSteps));
    } else {
      tempGoalSteps = Math.max(1000, Math.min(50000, rawSteps));
    }
    renderDialState(true);
  }

  if (wheelWrap) {
    wheelWrap.addEventListener('pointerdown', function (e) {
      if (e.target === bigInputEl) return;
      isDraggingWheel = true;
      if (wheelWrap.setPointerCapture) {
        try {
          wheelWrap.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
      updateFromPointerEvent(e.clientX, e.clientY);
    });

    wheelWrap.addEventListener('pointermove', function (e) {
      if (!isDraggingWheel) return;
      updateFromPointerEvent(e.clientX, e.clientY);
    });

    wheelWrap.addEventListener('pointerup', function () {
      isDraggingWheel = false;
    });

    wheelWrap.addEventListener('pointercancel', function () {
      isDraggingWheel = false;
    });
  }

  if (bigInputEl) {
    bigInputEl.addEventListener('focus', function () {
      const cur = activeMode === 'walked' ? tempWalkedSteps : tempGoalSteps;
      bigInputEl.value = String(cur);
      bigInputEl.select();
    });

    bigInputEl.addEventListener('input', function () {
      const cleaned = parseInt(String(bigInputEl.value).replace(/[^\d]/g, ''), 10);
      const numVal = Number.isNaN(cleaned) ? 0 : cleaned;
      if (activeMode === 'walked') {
        tempWalkedSteps = Math.max(0, Math.min(100000, numVal));
      } else {
        tempGoalSteps = Math.max(500, Math.min(100000, numVal));
      }
      renderDialState(false);
    });

    bigInputEl.addEventListener('blur', function () {
      if (activeMode === 'goal' && tempGoalSteps < 1000) {
        tempGoalSteps = 1000;
      }
      renderDialState(true);
    });
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.closest('#closeDialBtn')) {
      overlay.classList.remove('open');
      return;
    }

    const tab = e.target.closest('.gw-dial-tab');
    if (tab) {
      activeMode = tab.getAttribute('data-dmode') || 'walked';
      const allTabs = overlay.querySelectorAll('.gw-dial-tab');
      for (let i = 0; i < allTabs.length; i++) allTabs[i].classList.remove('active');
      tab.classList.add('active');
      renderDialState(true);
      return;
    }

    const qBtn = e.target.closest('.gw-dial-qbtn');
    if (qBtn) {
      const delta = parseInt(qBtn.getAttribute('data-dstep'), 10) || 0;
      if (activeMode === 'walked') {
        tempWalkedSteps = Math.max(0, Math.min(100000, tempWalkedSteps + delta));
      } else {
        tempGoalSteps = Math.max(1000, Math.min(100000, tempGoalSteps + delta));
      }
      renderDialState(true);
      return;
    }

    if (e.target.closest('#dialSaveOnlyBtn')) {
      state.today.steps = tempWalkedSteps;
      state.settings.stepGoal = tempGoalSteps;
      const goalInput = document.getElementById('settingStepGoal');
      if (goalInput) goalInput.value = String(tempGoalSteps);
      saveState();
      if (typeof updateHudFn === 'function') updateHudFn();
      overlay.classList.remove('open');
      return;
    }

    if (e.target.closest('#dialSaveAndRouteBtn')) {
      state.today.steps = tempWalkedSteps;
      state.settings.stepGoal = tempGoalSteps;
      const goalInput = document.getElementById('settingStepGoal');
      if (goalInput) goalInput.value = String(tempGoalSteps);
      saveState();
      if (typeof updateHudFn === 'function') updateHudFn();
      overlay.classList.remove('open');

      const missing = Math.max(0, tempGoalSteps - tempWalkedSteps);
      const targetSteps = missing > 0 ? missing : 3000;
      const routeFn =
        typeof generateRouteFn === 'function' ? generateRouteFn : generateLoopRouteForSteps;
      if (typeof routeFn === 'function') {
        routeFn(targetSteps);
      }
    }
  });

  // 3. Ühendame avalehe alumise HUD-kaardi (sammud, rõngas, eesmärk, "Puudu X") sammurattaga
  const hudCard =
    document.querySelector('.hud-card, .bottom-hud, #bottomHud') ||
    (liveStepsEl && liveStepsEl.closest('div'));

  if (hudCard) {
    hudCard.classList.add('gw-hud-clickable');
    hudCard.addEventListener('click', function (e) {
      // Kui vajutati "Alusta kõndimist" nupule, ära ava sammuratast
      if (e.target.closest('#startWalkBtn')) return;

      e.preventDefault();
      e.stopPropagation();

      // Kui vajutati otse "/ 10 000 sammu" eesmärgi tekstile, ava "Päeva eesmärk" vahekaart
      const clickedGoal = Boolean(e.target.closest('#goalStepsLabel'));
      openDialModal(clickedGoal ? 'goal' : 'walked');
    });
  }
}

export function setupStrideCalculator(appState, saveStateFn, updateHudFn) {
  const targetState = appState || state;
  const targetSave = typeof saveStateFn === 'function' ? saveStateFn : saveState;
  const strideInput = document.getElementById('settingStrideLength');
  if (!strideInput) return;

  const parentCard =
    strideInput.closest('.setting-item, .setting-row, .settings-card') || strideInput.parentElement;
  if (parentCard) {
    parentCard.classList.add('gw-stride-row-card');
    if (!document.getElementById('openStrideCalcBtn')) {
      const trigBtn = document.createElement('button');
      trigBtn.type = 'button';
      trigBtn.id = 'openStrideCalcBtn';
      trigBtn.className = 'gw-stride-calc-trigger';
      trigBtn.innerHTML =
        '<i data-lucide="calculator"></i><span>Arvuta oma täpne sammupikkus</span>';
      parentCard.appendChild(trigBtn);
    }
  }

  if (!document.getElementById('gwStrideCalcOverlay')) {
    const ov = document.createElement('div');
    ov.id = 'gwStrideCalcOverlay';
    ov.className = 'gw-calc-overlay';
    ov.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title"><i data-lucide="footprints" style="color:#ec4899;"></i> Sammupikkuse kalkulaator</span>',
          '<button type="button" class="gw-calc-close" id="gwCalcCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div class="gw-calc-tabs">',
          '<button type="button" class="gw-calc-tab active" data-cmode="height">Pikkuse järgi</button>',
          '<button type="button" class="gw-calc-tab" data-cmode="test">10 sammu test</button>',
        '</div>',
        '<div id="gwCalcHeightPane" style="display:flex;flex-direction:column;gap:12px;">',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>Sugu (keskmise valemi koefitsient)</span></span>',
            '<div class="gw-calc-opts" id="gwCalcGenderGroup">',
              '<button type="button" class="gw-calc-opt active" data-gender="m">Mees (×0.415)</button>',
              '<button type="button" class="gw-calc-opt" data-gender="f">Naine (×0.413)</button>',
            '</div>',
          '</div>',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>Sinu pikkus</span><strong id="gwCalcHeightVal" style="color:#fff;">180 cm</strong></span>',
            '<input type="range" id="gwCalcHeightSlider" class="gw-rb-slider" min="140" max="210" step="1" value="180" />',
          '</div>',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>Tavapärane kõnnitempo</span></span>',
            '<div class="gw-calc-opts" id="gwCalcPaceGroup" style="grid-template-columns:repeat(3,1fr);">',
              '<button type="button" class="gw-calc-opt" data-pace="0.95">Rahulik</button>',
              '<button type="button" class="gw-calc-opt active" data-pace="1">Tavaline</button>',
              '<button type="button" class="gw-calc-opt" data-pace="1.06">Kiire</button>',
            '</div>',
          '</div>',
        '</div>',
        '<div id="gwCalcTestPane" style="display:none;flex-direction:column;gap:10px;">',
          '<p style="font-size:0.78rem;color:#cbd5e1;line-height:1.4;margin:0;">Kõnni 10 loomulikku sammu ja sisesta läbitud vahemaa meetrites (nt 7.6 m):</p>',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>10 sammu pikkus (meetrites)</span></span>',
            '<input type="number" id="gwCalcTenStepsM" class="gw-calc-input" step="0.1" min="4" max="12" value="7.6" />',
          '</div>',
        '</div>',
        '<div class="gw-calc-resbox">',
          '<div>',
            '<div style="font-size:0.74rem;color:#cbd5e1;font-weight:600;">Sinu arvutatud sammupikkus</div>',
            '<div style="font-size:0.68rem;color:#94a3b8;">Kasutatakse km ja sammude arvestuses</div>',
          '</div>',
          '<span class="gw-calc-resval" id="gwCalcResultCm">75 cm</span>',
        '</div>',
        '<button type="button" class="gw-calc-apply" id="gwCalcSaveBtn">Salvesta sammupikkus</button>',
      '</div>'
    ].join('');
    document.body.appendChild(ov);

    let calcMode = 'height';
    let genderFactor = 0.415;
    let heightCm = 180;
    let paceFactor = 1;
    let calculatedCm = (targetState.settings && targetState.settings.strideCm) || 76;

    function recomputeStride() {
      if (calcMode === 'height') {
        calculatedCm = Math.max(
          45,
          Math.min(115, Math.round(heightCm * genderFactor * paceFactor))
        );
      } else {
        const mVal = parseFloat(document.getElementById('gwCalcTenStepsM').value) || 7.6;
        calculatedCm = Math.max(45, Math.min(115, Math.round((mVal * 100) / 10)));
      }
      const resEl = document.getElementById('gwCalcResultCm');
      if (resEl) resEl.textContent = calculatedCm + ' cm';
    }

    recomputeStride();

    const hSlider = document.getElementById('gwCalcHeightSlider');
    if (hSlider) {
      hSlider.addEventListener('input', function () {
        heightCm = parseInt(hSlider.value, 10) || 180;
        document.getElementById('gwCalcHeightVal').textContent = heightCm + ' cm';
        recomputeStride();
      });
    }

    const tenInput = document.getElementById('gwCalcTenStepsM');
    if (tenInput) {
      tenInput.addEventListener('input', recomputeStride);
    }

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('#gwCalcCloseBtn')) {
        ov.classList.remove('open');
        return;
      }
      const tab = e.target.closest('.gw-calc-tab');
      if (tab) {
        calcMode = tab.getAttribute('data-cmode') || 'height';
        const tabs = ov.querySelectorAll('.gw-calc-tab');
        for (let i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
        tab.classList.add('active');
        document.getElementById('gwCalcHeightPane').style.display =
          calcMode === 'height' ? 'flex' : 'none';
        document.getElementById('gwCalcTestPane').style.display =
          calcMode === 'test' ? 'flex' : 'none';
        recomputeStride();
        return;
      }
      const gBtn = e.target.closest('[data-gender]');
      if (gBtn) {
        genderFactor = gBtn.getAttribute('data-gender') === 'f' ? 0.413 : 0.415;
        const gAll = ov.querySelectorAll('[data-gender]');
        for (let i = 0; i < gAll.length; i++) gAll[i].classList.remove('active');
        gBtn.classList.add('active');
        recomputeStride();
        return;
      }
      const pBtn = e.target.closest('[data-pace]');
      if (pBtn) {
        paceFactor = parseFloat(pBtn.getAttribute('data-pace')) || 1;
        const pAll = ov.querySelectorAll('[data-pace]');
        for (let i = 0; i < pAll.length; i++) pAll[i].classList.remove('active');
        pBtn.classList.add('active');
        recomputeStride();
        return;
      }
      if (e.target.closest('#gwCalcSaveBtn')) {
        targetState.settings.strideCm = calculatedCm;
        strideInput.value = String(calculatedCm);
        targetSave();
        if (typeof updateHudFn === 'function') updateHudFn();
        ov.classList.remove('open');
      }
    });
  }

  const openBtn = document.getElementById('openStrideCalcBtn');
  if (openBtn) {
    openBtn.onclick = function () {
      const ov = document.getElementById('gwStrideCalcOverlay');
      if (ov) {
        ov.classList.add('open');
        if (window.lucide) window.lucide.createIcons();
      }
    };
  }
}

export function setupCustomMapStylePicker(appState, saveStateFn, switchMapLayerFn) {
  const targetState = appState || state;
  const targetSave = typeof saveStateFn === 'function' ? saveStateFn : saveState;
  const targetSwitch =
    typeof switchMapLayerFn === 'function' ? switchMapLayerFn : switchMapLayer;

  const selectEl = document.getElementById('settingMapStyle');
  if (!selectEl) return;

  const styleMeta = {
    dark: { title: 'Tume (Pro Dark)', sub: 'Sügav tume kaart neoon-trajektooriga', icon: 'moon' },
    light: { title: 'Hele (Tavaline)', sub: 'Klassikaline hele tänavakaart', icon: 'sun' },
    hybrid: { title: 'Hübriid (Satelliit)', sub: 'Aerofoto koos tänavanimedega', icon: 'layers' },
    terrain: { title: 'Maastik (Reljeef)', sub: 'Kõrgusjooned ja loodusrajad', icon: 'mountain' }
  };

  function getMetaForVal(val) {
    if (styleMeta[val]) return styleMeta[val];
    const v = String(val || '').toLowerCase();
    if (v.indexOf('light') !== -1 || v.indexOf('hele') !== -1) return styleMeta.light;
    if (v.indexOf('hyb') !== -1 || v.indexOf('sat') !== -1) return styleMeta.hybrid;
    if (v.indexOf('terr') !== -1 || v.indexOf('rel') !== -1 || v.indexOf('maas') !== -1)
      return styleMeta.terrain;
    return styleMeta.dark;
  }

  let trigBtn = document.getElementById('gwCustomMapSelectBtn');
  if (!trigBtn) {
    trigBtn = document.createElement('button');
    trigBtn.type = 'button';
    trigBtn.id = 'gwCustomMapSelectBtn';
    trigBtn.className = 'gw-map-select-trigger';
    selectEl.parentNode.insertBefore(trigBtn, selectEl.nextSibling);
  }

  function updateTriggerLabel() {
    const curVal =
      selectEl.value || (targetState.settings && targetState.settings.mapLayer) || 'dark';
    const m = getMetaForVal(curVal);
    trigBtn.innerHTML =
      '<i data-lucide="' + m.icon + '"></i>' +
      '<span>' + m.title + '</span>' +
      '<i data-lucide="chevron-down" style="width:15px;height:15px;color:#94a3b8;margin-left:2px;"></i>';
    if (window.lucide) window.lucide.createIcons();
  }

  updateTriggerLabel();

  if (!document.getElementById('gwMapStyleOverlay')) {
    const ov = document.createElement('div');
    ov.id = 'gwMapStyleOverlay';
    ov.className = 'gw-calc-overlay';

    let optsHtml = '';
    const opts =
      selectEl.options && selectEl.options.length > 0
        ? Array.from(selectEl.options).map(function (o) {
            return o.value;
          })
        : ['dark', 'light', 'hybrid', 'terrain'];

    for (let i = 0; i < opts.length; i++) {
      const val = opts[i];
      const m = getMetaForVal(val);
      optsHtml +=
        '<button type="button" class="gw-mstyle-opt" data-mval="' + val + '">' +
          '<div class="gw-mstyle-ico"><i data-lucide="' + m.icon + '"></i></div>' +
          '<div class="gw-mstyle-text">' +
            '<div class="gw-mstyle-title">' + m.title + '</div>' +
            '<div class="gw-mstyle-sub">' + m.sub + '</div>' +
          '</div>' +
          '<div class="gw-mstyle-radio"></div>' +
        '</button>';
    }

    ov.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title"><i data-lucide="map" style="color:#ec4899;"></i> Vaikimisi kaardistiil</span>',
          '<button type="button" class="gw-calc-close" id="gwMapStyleCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div class="gw-mstyle-list" id="gwMapStyleOptionList">' + optsHtml + '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('#gwMapStyleCloseBtn')) {
        ov.classList.remove('open');
        return;
      }
      const optBtn = e.target.closest('.gw-mstyle-opt');
      if (optBtn) {
        const chosen = optBtn.getAttribute('data-mval') || 'dark';
        selectEl.value = chosen;
        targetState.settings.mapLayer = chosen;
        targetSave();
        if (typeof targetSwitch === 'function') targetSwitch(chosen);
        updateTriggerLabel();
        ov.classList.remove('open');
      }
    });
  }

  trigBtn.onclick = function () {
    const ov = document.getElementById('gwMapStyleOverlay');
    if (!ov) return;
    const curVal =
      selectEl.value || (targetState.settings && targetState.settings.mapLayer) || 'dark';
    const allOpts = ov.querySelectorAll('.gw-mstyle-opt');
    for (let i = 0; i < allOpts.length; i++) {
      allOpts[i].classList.toggle('active', allOpts[i].getAttribute('data-mval') === curVal);
    }
    ov.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  };
}
