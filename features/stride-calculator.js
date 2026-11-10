import { state, saveState } from '../state.js';

export function setupStrideCalculator(updateHudFn) {
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
    let calculatedCm = state.settings.strideCm || 76;

    function recomputeStride() {
      if (calcMode === 'height') {
        calculatedCm = Math.max(45, Math.min(115, Math.round(heightCm * genderFactor * paceFactor)));
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
        document.getElementById('gwCalcHeightPane').style.display = calcMode === 'height' ? 'flex' : 'none';
        document.getElementById('gwCalcTestPane').style.display = calcMode === 'test' ? 'flex' : 'none';
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
        state.settings.strideCm = calculatedCm;
        strideInput.value = String(calculatedCm);
        saveState();
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
