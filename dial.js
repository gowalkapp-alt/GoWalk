/* ==========================================================================
   GOWALK PRO — 4. 360° INTERACTIVE STEP DIAL PICKER & INLINE INPUT
   ========================================================================== */

import { LUCIDE_SVGS } from './config.js';
import { state, saveState, getMissingSteps } from './state.js';

const DIAL_RADIUS = 92;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
let dialMode = 'walked'; // 'walked' | 'goal'
let tempWalkedSteps = 0;
let tempGoalSteps = 10000;
let isDraggingDial = false;

export function setupStepDialModal(onHudUpdate, onGenerateRoute) {
  const backdrop = document.createElement('div');
  backdrop.id = 'stepDialBackdrop';
  backdrop.className = 'step-dial-backdrop';
  backdrop.innerHTML = `
    <div class="step-dial-card">
      <div class="step-dial-top">
        <div class="step-dial-tabs">
          <button type="button" class="dial-tab-btn active" data-dial-tab="walked">Täna tehtud</button>
          <button type="button" class="dial-tab-btn" data-dial-tab="goal">Päeva eesmärk</button>
        </div>
        <button type="button" id="closeStepDialBtn" class="icon-btn" style="width:34px;height:34px;">
          ${LUCIDE_SVGS.close}
        </button>
      </div>

      <div class="dial-wheel-wrap" id="dialWheelWrap">
        <svg class="dial-svg" viewBox="0 0 224 224">
          <defs>
            <linearGradient id="dialVioletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc" />
              <stop offset="100%" stop-color="#7c3aed" />
            </linearGradient>
          </defs>
          <circle class="dial-track-circle" cx="112" cy="112" r="${DIAL_RADIUS}"></circle>
          <circle class="dial-ticks-circle" cx="112" cy="112" r="${DIAL_RADIUS}"></circle>
          <circle id="dialProgressCircle" class="dial-progress-circle" cx="112" cy="112" r="${DIAL_RADIUS}"
            stroke-dasharray="${DIAL_CIRCUMFERENCE.toFixed(2)}"
            stroke-dashoffset="${DIAL_CIRCUMFERENCE.toFixed(2)}"></circle>
          <circle id="dialThumbHandle" class="dial-thumb-handle" cx="112" cy="20" r="11"></circle>
        </svg>

        <div class="dial-center-readout">
          <span class="dial-mode-caption" id="dialModeCaption">Täna tehtud</span>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9 ]*"
            id="dialBigValue"
            class="dial-big-input"
            value="0"
            aria-label="Sammude arv"
          />
          <span class="dial-unit-sub" id="dialUnitSub">sammu • ~0.00 km</span>
          <div class="dial-missing-summary" id="dialMissingSummary">Puudu: 10 000 sammu</div>
        </div>
      </div>

      <div class="dial-steppers-row">
        <button type="button" class="dial-step-btn" data-delta="-500">-500</button>
        <button type="button" class="dial-step-btn" data-delta="-100">-100</button>
        <button type="button" class="dial-step-btn" data-delta="100">+100</button>
        <button type="button" class="dial-step-btn" data-delta="500">+500</button>
      </div>

      <div class="dial-actions-col">
        <button type="button" id="dialSaveAndRouteBtn" class="btn-dial-primary-route"></button>
        <button type="button" id="dialSaveOnlyBtn" class="btn-dial-secondary-save">
          Salvesta sammud
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const primaryLine = document.querySelector('.primary-step-line');
  const stepRingContainer = document.querySelector('.step-ring-container');

  if (primaryLine) {
    let hintBadge = primaryLine.querySelector('.step-dial-trigger-hint');
    if (!hintBadge) {
      hintBadge = document.createElement('span');
      hintBadge.id = 'hudMissingHintBadge';
      hintBadge.className = 'step-dial-trigger-hint';
      hintBadge.textContent = 'Muuda';
      primaryLine.appendChild(hintBadge);
    }
    primaryLine.addEventListener('click', () => openStepDial('walked'));
  }

  if (stepRingContainer) {
    stepRingContainer.addEventListener('click', () => openStepDial('walked'));
  }

  const quickSyncBtn = document.getElementById('quickSyncBtn');
  if (quickSyncBtn) {
    quickSyncBtn.title = 'Ava sammuketas';
    quickSyncBtn.addEventListener('click', () => openStepDial('walked'));
  }

  backdrop.querySelectorAll('.dial-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dialMode = btn.getAttribute('data-dial-tab');
      backdrop.querySelectorAll('.dial-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDialPosition(true);
    });
  });

  document.getElementById('closeStepDialBtn').addEventListener('click', closeStepDial);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeStepDial();
  });

  backdrop.querySelectorAll('.dial-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      if (dialMode === 'walked') {
        tempWalkedSteps = Math.max(0, Math.min(100000, tempWalkedSteps + delta));
      } else {
        tempGoalSteps = Math.max(1000, Math.min(100000, tempGoalSteps + delta));
      }
      renderDialPosition(true);
    });
  });

  // Otse ketta keskel muudetav sisestusväli (Inline Input ilma prompt() aknata)
  const bigInputEl = document.getElementById('dialBigValue');

  bigInputEl.addEventListener('focus', () => {
    const currentVal = dialMode === 'walked' ? tempWalkedSteps : tempGoalSteps;
    bigInputEl.value = String(currentVal);
    setTimeout(() => bigInputEl.select(), 20);
  });

  bigInputEl.addEventListener('input', () => {
    const rawDigits = bigInputEl.value.replace(/[^0-9]/g, '');
    const parsed = rawDigits === '' ? 0 : Math.min(100000, parseInt(rawDigits, 10));
    if (dialMode === 'walked') {
      tempWalkedSteps = Math.max(0, parsed);
    } else {
      tempGoalSteps = Math.max(500, parsed);
    }
    renderDialPosition(false);
  });

  bigInputEl.addEventListener('blur', () => {
    if (dialMode === 'goal' && tempGoalSteps < 1000) {
      tempGoalSteps = 1000;
    }
    renderDialPosition(true);
  });

  bigInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bigInputEl.blur();
    }
  });

  // 360° radiaalne ketta pööramine
  const wheelWrap = document.getElementById('dialWheelWrap');

  const updateFromPointer = (clientX, clientY) => {
    const rect = wheelWrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const fraction = Math.max(0, Math.min(1, deg / 360));

    if (dialMode === 'walked') {
      const maxWalkScale = Math.max(15000, tempGoalSteps);
      tempWalkedSteps = Math.round((fraction * maxWalkScale) / 100) * 100;
    } else {
      const maxGoalScale = 30000;
      const rawGoal = 1000 + fraction * (maxGoalScale - 1000);
      tempGoalSteps = Math.round(rawGoal / 500) * 500;
    }
    renderDialPosition(true);
  };

  wheelWrap.addEventListener('mousedown', e => {
    if (e.target === bigInputEl) return;
    if (document.activeElement === bigInputEl) bigInputEl.blur();
    isDraggingDial = true;
    updateFromPointer(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', e => {
    if (!isDraggingDial) return;
    updateFromPointer(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    isDraggingDial = false;
  });

  wheelWrap.addEventListener(
    'touchstart',
    e => {
      if (e.target === bigInputEl) return;
      if (document.activeElement === bigInputEl) bigInputEl.blur();
      if (e.touches && e.touches[0]) {
        isDraggingDial = true;
        updateFromPointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true }
  );

  wheelWrap.addEventListener(
    'touchmove',
    e => {
      if (!isDraggingDial || !e.touches || !e.touches[0]) return;
      updateFromPointer(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );

  wheelWrap.addEventListener(
    'touchend',
    () => {
      isDraggingDial = false;
    },
    { passive: true }
  );

  const commitDialValues = () => {
    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.steps = Math.max(0, tempWalkedSteps);
    state.today.distanceKm = +((state.today.steps * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(state.today.steps * 0.04);
    state.settings.stepGoal = Math.max(1000, tempGoalSteps);

    const settingStepGoalEl = document.getElementById('settingStepGoal');
    if (settingStepGoalEl) settingStepGoalEl.value = state.settings.stepGoal;

    saveState();
    if (onHudUpdate) onHudUpdate();
  };

  document.getElementById('dialSaveOnlyBtn').addEventListener('click', () => {
    commitDialValues();
    closeStepDial();
  });

  document.getElementById('dialSaveAndRouteBtn').addEventListener('click', () => {
    commitDialValues();
    closeStepDial();
    const missing = getMissingSteps();
    const stepsToGenerate = missing >= 300 ? missing : 3000;
    if (onGenerateRoute) onGenerateRoute(stepsToGenerate);
  });
}

export function openStepDial(initialMode = 'walked') {
  const backdrop = document.getElementById('stepDialBackdrop');
  if (!backdrop) return;
  dialMode = initialMode;
  tempWalkedSteps = state.today.steps || 0;
  tempGoalSteps = state.settings.stepGoal || 10000;

  backdrop.querySelectorAll('.dial-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-dial-tab') === dialMode);
  });

  renderDialPosition(true);
  backdrop.classList.add('open');
}

export function closeStepDial() {
  const backdrop = document.getElementById('stepDialBackdrop');
  const bigInputEl = document.getElementById('dialBigValue');
  if (bigInputEl && document.activeElement === bigInputEl) {
    bigInputEl.blur();
  }
  if (backdrop) backdrop.classList.remove('open');
}

function renderDialPosition(formatInputDisplay = true) {
  const progressCircle = document.getElementById('dialProgressCircle');
  const thumbHandle = document.getElementById('dialThumbHandle');
  const captionEl = document.getElementById('dialModeCaption');
  const bigInputEl = document.getElementById('dialBigValue');
  const unitSubEl = document.getElementById('dialUnitSub');
  const missingSummaryEl = document.getElementById('dialMissingSummary');
  const routeBtnEl = document.getElementById('dialSaveAndRouteBtn');

  const strideMeters = (state.settings.strideCm || 76) / 100;
  const activeVal = dialMode === 'walked' ? tempWalkedSteps : tempGoalSteps;
  const maxRef =
    dialMode === 'walked'
      ? Math.max(15000, tempGoalSteps, tempWalkedSteps)
      : Math.max(30000, tempGoalSteps);
  const minRef = dialMode === 'walked' ? 0 : 1000;

  const fraction = Math.max(0, Math.min(1, (activeVal - minRef) / Math.max(1, maxRef - minRef)));
  const offset = DIAL_CIRCUMFERENCE - fraction * DIAL_CIRCUMFERENCE;
  if (progressCircle) {
    progressCircle.style.strokeDashoffset = offset.toFixed(2);
  }

  const angleRad = (fraction * 360 - 90) * (Math.PI / 180);
  const tx = 112 + DIAL_RADIUS * Math.cos(angleRad);
  const ty = 112 + DIAL_RADIUS * Math.sin(angleRad);
  if (thumbHandle) {
    thumbHandle.setAttribute('cx', tx.toFixed(2));
    thumbHandle.setAttribute('cy', ty.toFixed(2));
  }

  if (captionEl) {
    captionEl.textContent = dialMode === 'walked' ? 'Täna tehtud' : 'Päeva eesmärk';
  }
  if (bigInputEl && formatInputDisplay && document.activeElement !== bigInputEl) {
    bigInputEl.value = activeVal.toLocaleString('et-EE');
  }

  const activeKm = ((activeVal * strideMeters) / 1000).toFixed(2);
  if (unitSubEl) {
    unitSubEl.textContent = `sammu • ~${activeKm} km`;
  }

  const missing = Math.max(0, tempGoalSteps - tempWalkedSteps);
  const missingKm = ((missing * strideMeters) / 1000).toFixed(2);

  if (missingSummaryEl) {
    if (missing > 0) {
      missingSummaryEl.textContent = `Puudu: ${missing.toLocaleString('et-EE')} sammu (~${missingKm} km)`;
    } else {
      missingSummaryEl.textContent = 'Päeva eesmärk täidetud ✓';
    }
  }

  if (routeBtnEl) {
    const btnText =
      missing > 0
        ? `Salvesta & koosta ${missing.toLocaleString('et-EE')} sammu ring`
        : 'Salvesta & koosta lisaring (3 000)';
    routeBtnEl.innerHTML = `${LUCIDE_SVGS.sparkles}<span>${btnText}</span>`;
  }
}

/* ==========================================================================
   MIDNIGHT INDIGO STEP DIAL MODAL OVERRIDES
   ========================================================================== */

[id*="dial" i] .modal-card,
[id*="dial" i] .dial-card,
[class*="dial-modal"] > div,
.dial-container,
.dial-content,
.dial-modal-card {
  background: linear-gradient(165deg, rgba(28, 34, 74, 0.96) 0%, rgba(15, 20, 42, 0.98) 100%) !important;
  border: 1px solid rgba(236, 72, 153, 0.42) !important;
  border-radius: 26px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 28px rgba(168, 85, 247, 0.25) !important;
}

[id*="dial" i] svg circle[stroke-dasharray],
[class*="dial"] svg circle[stroke-dasharray],
[id*="dial" i] svg circle:nth-of-type(2),
#dialProgressRing,
.dial-progress-ring {
  stroke: #ec4899 !important;
  filter: drop-shadow(0 0 10px rgba(236, 72, 153, 0.7)) !important;
}

[id*="dial" i] [id*="thumb" i],
[id*="dial" i] [class*="thumb" i],
[class*="dial"] [class*="thumb" i],
#dialThumb {
  background: #ffffff !important;
  border: 4px solid #ec4899 !important;
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.85) !important;
}

.dial-step-btn,
.quick-step-btn {
  background: rgba(26, 31, 66, 0.92) !important;
  border: 1px solid rgba(168, 85, 247, 0.36) !important;
  color: #fff !important;
  border-radius: 14px !important;
  font-weight: 700 !important;
}

#saveStepsOnlyBtn,
#dialSaveOnlyBtn {
  background: rgba(22, 27, 58, 0.92) !important;
  border: 1px solid rgba(168, 85, 247, 0.34) !important;
  color: #e2e8f0 !important;
  border-radius: 999px !important;
}
