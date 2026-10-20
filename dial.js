import { LUCIDE_SVGS } from './config.js';

const DIAL_RADIUS = 92;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
let dialMode = 'walked';
let tempWalkedSteps = 0;
let tempGoalSteps = 10000;
let isDraggingDial = false;

export function setupStepDialModal(getState, onSave) {
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
        <button type="button" id="closeStepDialBtn" class="icon-btn" style="width:34px;height:34px;">${LUCIDE_SVGS.close}</button>
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
          <circle id="dialProgressCircle" class="dial-progress-circle" cx="112" cy="112" r="${DIAL_RADIUS}" stroke-dasharray="${DIAL_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${DIAL_CIRCUMFERENCE.toFixed(2)}"></circle>
          <circle id="dialThumbHandle" class="dial-thumb-handle" cx="112" cy="20" r="11"></circle>
        </svg>

        <div class="dial-center-readout">
          <span class="dial-mode-caption" id="dialModeCaption">Täna tehtud</span>
          <input type="text" inputmode="numeric" pattern="[0-9 ]*" id="dialBigValue" class="dial-big-input" value="0" />
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
        <button type="button" id="dialSaveOnlyBtn" class="btn-dial-secondary-save">Salvesta sammud</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const openDial = (mode) => {
    dialMode = mode;
    const st = getState();
    tempWalkedSteps = st.today.steps || 0;
    tempGoalSteps = st.settings.stepGoal || 10000;
    backdrop.querySelectorAll('.dial-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-dial-tab') === dialMode));
    renderDial(st);
    backdrop.classList.add('open');
  };

  const closeDial = () => backdrop.classList.remove('open');

  document.querySelectorAll('.primary-step-line, .step-ring-container').forEach(el => {
    el.addEventListener('click', () => openDial('walked'));
  });

  backdrop.querySelectorAll('.dial-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dialMode = btn.getAttribute('data-dial-tab');
      backdrop.querySelectorAll('.dial-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDial(getState());
    });
  });

  document.getElementById('closeStepDialBtn').addEventListener('click', closeDial);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDial(); });

  backdrop.querySelectorAll('.dial-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      if (dialMode === 'walked') tempWalkedSteps = Math.max(0, tempWalkedSteps + delta);
      else tempGoalSteps = Math.max(1000, tempGoalSteps + delta);
      renderDial(getState());
    });
  });

  const bigInput = document.getElementById('dialBigValue');
  bigInput.addEventListener('input', () => {
    const raw = bigInput.value.replace(/[^0-9]/g, '');
    const val = raw === '' ? 0 : parseInt(raw, 10);
    if (dialMode === 'walked') tempWalkedSteps = val;
    else tempGoalSteps = Math.max(500, val);
    renderDial(getState(), false);
  });

  const saveValues = (shouldRoute = false) => {
    const st = getState();
    st.today.steps = tempWalkedSteps;
    st.settings.stepGoal = tempGoalSteps;
    const strideMeters = st.settings.strideCm / 100;
    st.today.distanceKm = +(st.today.steps * strideMeters / 1000).toFixed(2);
    st.today.calories = Math.round(st.today.steps * 0.04);
    onSave(shouldRoute);
    closeDial();
  };

  document.getElementById('dialSaveOnlyBtn').addEventListener('click', () => saveValues(false));
  document.getElementById('dialSaveAndRouteBtn').addEventListener('click', () => saveValues(true));
}

function renderDial(st, formatInput = true) {
  const activeVal = dialMode === 'walked' ? tempWalkedSteps : tempGoalSteps;
  const maxRef = dialMode === 'walked' ? Math.max(15000, tempGoalSteps) : 30000;
  const fraction = Math.max(0, Math.min(1, activeVal / maxRef));
  
  document.getElementById('dialProgressCircle').style.strokeDashoffset = (DIAL_CIRCUMFERENCE - fraction * DIAL_CIRCUMFERENCE).toFixed(2);
  document.getElementById('dialModeCaption').textContent = dialMode === 'walked' ? 'Täna tehtud' : 'Päeva eesmärk';
  
  const bigInput = document.getElementById('dialBigValue');
  if (formatInput && document.activeElement !== bigInput) bigInput.value = activeVal.toLocaleString('et-EE');

  const missing = Math.max(0, tempGoalSteps - tempWalkedSteps);
  document.getElementById('dialMissingSummary').textContent = missing > 0 ? `Puudu: ${missing.toLocaleString('et-EE')} sammu` : 'Eesmärk täidetud ✓';
  document.getElementById('dialSaveAndRouteBtn').innerHTML = `${LUCIDE_SVGS.sparkles}<span>Salvesta & koosta ${missing > 0 ? missing : 3000} sammu ring</span>`;
}
