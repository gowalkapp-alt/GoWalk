/* ==========================================================================
   GOWALK PRO — DIAL.JS (STEP DIAL MODAL & STRIDE CALCULATOR)
   ========================================================================== */

import { state, saveState, getMissingSteps } from './state.js';
import { generateLoopRouteForSteps } from './map.js';

const LUCIDE_SVGS = {
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.2 1.2L3 12l5.8 1.9a2 2 0 0 1 1.2 1.2L12 21l1.9-5.8a2 2 0 0 1 1.2-1.2L21 12l-5.8-1.9a2 2 0 0 1-1.2-1.2Z"/></svg>'
};

export function setupStepDialModal(updateHudFn, generateRouteFn) {
  const openBtn = document.getElementById('openStepDialBtn') || document.getElementById('openGeneratorBtn');
  let modal = document.getElementById('stepDialModal') || document.getElementById('dialModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stepDialModal';
    modal.className = 'subview-modal gw-rb-modal';
    modal.innerHTML = [
      '<div class="gw-rb-head">',
        '<button type="button" class="gw-rb-back" id="closeDialBtn"><i data-lucide="arrow-left"></i></button>',
        '<span class="gw-rb-title">Sammuratas & Eesmärk</span>',
      '</div>',
      '<div class="gw-rb-valbox">',
        '<input type="text" id="dialBigInput" class="gw-rb-bigval" style="background:transparent;border:none;color:#fff;text-align:center;width:100%;font:inherit;font-size:2.2rem;font-weight:800;" value="5 000" />',
        '<span class="gw-rb-unit" id="dialUnitSub">sammu • ~3.8 km</span>',
      '</div>',
      '<div class="gw-rb-sub" id="dialMissingSummary" style="text-align:center;color:#f472b6;margin-bottom:16px;">Puudu: 5 000 sammu</div>',
      '<input type="range" id="dialRangeSlider" class="gw-rb-slider" min="500" max="25000" step="250" value="5000" />',
      '<div class="gw-rb-marks"><span>500</span><span>5K</span><span>10K</span><span>15K</span><span>20K</span><span>25K</span></div>',
      '<div style="margin-top:20px;">',
        '<button type="button" class="gw-rb-cta" id="dialSaveAndRouteBtn">',
          LUCIDE_SVGS.sparkles,
          '<span>Salvesta & koosta liikumisring</span>',
        '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
  }

  const closeBtn = modal.querySelector('#closeDialBtn') || modal.querySelector('.close-subview');
  const bigInputEl = modal.querySelector('#dialBigInput');
  const sliderEl = modal.querySelector('#dialRangeSlider');
  const unitSubEl = modal.querySelector('#dialUnitSub');
  const missingSummaryEl = modal.querySelector('#dialMissingSummary');
  const routeBtnEl = modal.querySelector('#dialSaveAndRouteBtn');

  function openDial() {
    const missing = getMissingSteps();
    const currentGoal = (state.settings && state.settings.stepGoal) || 10000;
    const initSteps = missing > 0 ? Math.min(25000, Math.max(500, missing)) : 5000;

    if (sliderEl) sliderEl.value = String(initSteps);
    if (bigInputEl) bigInputEl.value = initSteps.toLocaleString('et-EE');

    const strideMeters = ((state.settings && state.settings.strideCm) || 76) / 100;
    const kmVal = ((initSteps * strideMeters) / 1000).toFixed(2);
    if (unitSubEl) unitSubEl.textContent = 'sammu • ~' + kmVal + ' km';

    if (missingSummaryEl) {
      missingSummaryEl.textContent = missing > 0 ? 'Puudu: ' + missing.toLocaleString('et-EE') + ' sammu' : 'Päeva eesmärk täidetud ✓';
    }

    modal.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  }

  if (openBtn) {
    openBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openDial();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      modal.classList.remove('open');
    });
  }

  if (sliderEl && bigInputEl) {
    sliderEl.addEventListener('input', function () {
      const val = parseInt(sliderEl.value, 10) || 1000;
      bigInputEl.value = val.toLocaleString('et-EE');
      const strideMeters = ((state.settings && state.settings.strideCm) || 76) / 100;
      const kmVal = ((val * strideMeters) / 1000).toFixed(2);
      if (unitSubEl) unitSubEl.textContent = 'sammu • ~' + kmVal + ' km';
    });
  }

  if (routeBtnEl) {
    routeBtnEl.addEventListener('click', function () {
      const val = parseInt(String(bigInputEl.value).replace(/\s/g, ''), 10) || 5000;
      modal.classList.remove('open');
      if (typeof generateRouteFn === 'function') {
        generateRouteFn(val);
      }
    });
  }
}

export function setupStrideCalculator(appState, saveStateFn, updateHudFn) {
  const strideInput = document.getElementById('settingStrideLength');
  if (!strideInput) return;

  const parentCard = strideInput.closest('.setting-item, .setting-row, .settings-card') || strideInput.parentElement;
  if (parentCard) {
    parentCard.classList.add('gw-stride-row-card');
    if (!document.getElementById('openStrideCalcBtn')) {
      const trigBtn = document.createElement('button');
      trigBtn.type = 'button';
      trigBtn.id = 'openStrideCalcBtn';
      trigBtn.className = 'gw-stride-calc-trigger';
      trigBtn.innerHTML = '<i data-lucide="calculator"></i><span>Arvuta oma täpne sammupikkus</span>';
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
            '<span class="gw-calc-lbl"><span>Sugu</span></span>',
            '<div class="gw-calc-opts" id="gwCalcGenderGroup">',
              '<button type="button" class="gw-calc-opt active" data-gender="m">Mees (×0.415)</button>',
              '<button type="button" class="gw-calc-opt" data-gender="f">Naine (×0.413)</button>',
            '</div>',
          '</div>',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>Sinu pikkus</span><strong id="gwCalcHeightVal" style="color:#fff;">180 cm</strong></span>',
            '<input type="range" id="gwCalcHeightSlider" class="gw-rb-slider" min="140" max="210" step="1" value="180" />',
          '</div>',
        '</div>',
        '<div class="gw-calc-resbox">',
          '<div>',
            '<div style="font-size:0.74rem;color:#cbd5e1;font-weight:600;">Arvutatud sammupikkus</div>',
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
    let calculatedCm = (appState.settings && appState.settings.strideCm) || 76;

    function recompute() {
      calculatedCm = Math.max(45, Math.min(115, Math.round(heightCm * genderFactor)));
      const resEl = document.getElementById('gwCalcResultCm');
      if (resEl) resEl.textContent = calculatedCm + ' cm';
    }

    const hSlider = document.getElementById('gwCalcHeightSlider');
    if (hSlider) {
      hSlider.addEventListener('input', function () {
        heightCm = parseInt(hSlider.value, 10) || 180;
        document.getElementById('gwCalcHeightVal').textContent = heightCm + ' cm';
        recompute();
      });
    }

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('#gwCalcCloseBtn')) {
        ov.classList.remove('open');
        return;
      }
      const gBtn = e.target.closest('[data-gender]');
      if (gBtn) {
        genderFactor = gBtn.getAttribute('data-gender') === 'f' ? 0.413 : 0.415;
        const gAll = ov.querySelectorAll('[data-gender]');
        for (let i = 0; i < gAll.length; i++) gAll[i].classList.remove('active');
        gBtn.classList.add('active');
        recompute();
        return;
      }
      if (e.target.closest('#gwCalcSaveBtn')) {
        appState.settings.strideCm = calculatedCm;
        strideInput.value = String(calculatedCm);
        if (typeof saveStateFn === 'function') saveStateFn();
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
  const selectEl = document.getElementById('settingMapStyle');
  if (!selectEl) return;

  const styleMeta = {
    dark: { title: 'Tume (Pro Dark)', icon: 'moon' },
    light: { title: 'Hele (Tavaline)', icon: 'sun' },
    hybrid: { title: 'Hübriid (Satelliit)', icon: 'layers' },
    terrain: { title: 'Maastik (Reljeef)', icon: 'mountain' }
  };

  let trigBtn = document.getElementById('gwCustomMapSelectBtn');
  if (!trigBtn) {
    trigBtn = document.createElement('button');
    trigBtn.type = 'button';
    trigBtn.id = 'gwCustomMapSelectBtn';
    trigBtn.className = 'gw-map-select-trigger';
    selectEl.parentNode.insertBefore(trigBtn, selectEl.nextSibling);
  }

  function updateTriggerLabel() {
    const curVal = selectEl.value || (appState.settings && appState.settings.mapLayer) || 'dark';
    const m = styleMeta[curVal] || styleMeta.dark;
    trigBtn.innerHTML = '<i data-lucide="' + m.icon + '"></i><span>' + m.title + '</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  updateTriggerLabel();

  if (!document.getElementById('gwMapStyleOverlay')) {
    const ov = document.createElement('div');
    ov.id = 'gwMapStyleOverlay';
    ov.className = 'gw-calc-overlay';
    ov.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title"><i data-lucide="map" style="color:#ec4899;"></i> Vaikimisi kaardistiil</span>',
          '<button type="button" class="gw-calc-close" id="gwMapStyleCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div class="gw-mstyle-list">',
          '<button type="button" class="gw-mstyle-opt" data-mval="dark"><div class="gw-mstyle-ico"><i data-lucide="moon"></i></div><div class="gw-mstyle-title">Tume (Pro Dark)</div></button>',
          '<button type="button" class="gw-mstyle-opt" data-mval="light"><div class="gw-mstyle-ico"><i data-lucide="sun"></i></div><div class="gw-mstyle-title">Hele (Tavaline)</div></button>',
          '<button type="button" class="gw-mstyle-opt" data-mval="hybrid"><div class="gw-mstyle-ico"><i data-lucide="layers"></i></div><div class="gw-mstyle-title">Hübriid (Satelliit)</div></button>',
          '<button type="button" class="gw-mstyle-opt" data-mval="terrain"><div class="gw-mstyle-ico"><i data-lucide="mountain"></i></div><div class="gw-mstyle-title">Maastik (Reljeef)</div></button>',
        '</div>',
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
        appState.settings.mapLayer = chosen;
        if (typeof saveStateFn === 'function') saveStateFn();
        if (typeof switchMapLayerFn === 'function') switchMapLayerFn(chosen);
        updateTriggerLabel();
        ov.classList.remove('open');
      }
    });
  }

  trigBtn.onclick = function () {
    const ov = document.getElementById('gwMapStyleOverlay');
    if (!ov) return;
    ov.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  };
}
