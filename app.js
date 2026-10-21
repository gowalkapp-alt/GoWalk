/* ==========================================================================
   GOWALK PRO — 6. MAIN ENTRY POINT, STRIDE CALCULATOR & MIDNIGHT INDIGO UI
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

let statsModuleCache = null;
async function loadStatsModuleSafely() {
  if (statsModuleCache) return statsModuleCache;
  try {
    statsModuleCache = await import('./stats.js');
    return statsModuleCache;
  } catch (err1) {
    statsModuleCache = await import('./Stats.js');
    return statsModuleCache;
  }
}

// Raster-PNG gradiendi generaator (püsib Samsung Internetis ja Chrome'is 100% identne)
function createPngGradient(c1, c2, c3) {
  try {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 80;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, cv.width, 0);
    g.addColorStop(0, c1);
    g.addColorStop(0.52, c2);
    g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function setupFaviconAndPWA() {
  const fallbackGitHubIcon = 'file_000000003a8c820abfebb762ae22beff.png';
  const primaryIcon = 'favicon.png';

  function applyIconLinks(hrefUrl) {
    let iconLink = document.querySelector('link[rel="icon"]');
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      iconLink.type = 'image/png';
      document.head.appendChild(iconLink);
    }
    iconLink.href = hrefUrl;

    let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = hrefUrl;

    const manifestObj = {
      name: 'GoWalk Pro',
      short_name: 'GoWalk',
      start_url: './',
      display: 'standalone',
      background_color: '#0f1429',
      theme_color: '#0f1429',
      icons: [
        {
          src: new URL(hrefUrl, window.location.href).href,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };
    const blob = new Blob([JSON.stringify(manifestObj)], { type: 'application/json' });
    let manLink = document.querySelector('link[rel="manifest"]');
    if (!manLink) {
      manLink = document.createElement('link');
      manLink.rel = 'manifest';
      document.head.appendChild(manLink);
    }
    manLink.href = URL.createObjectURL(blob);
  }

  const testImg = new Image();
  testImg.onload = function () {
    applyIconLinks(primaryIcon);
  };
  testImg.onerror = function () {
    applyIconLinks(fallbackGitHubIcon);
  };
  testImg.src = primaryIcon;
}

// Sammupikkuse kalkulaatori ehitaja ja ühendaja Seadete lehele
function setupStrideCalculator(updateHudFn) {
  const strideInput = document.getElementById('settingStrideLength');
  if (!strideInput) return;

  const parentCard =
    strideInput.closest('.setting-item, .setting-row, .settings-card') || strideInput.parentElement;

  if (parentCard && !document.getElementById('openStrideCalcBtn')) {
    parentCard.style.flexWrap = 'wrap';
    const trigBtn = document.createElement('button');
    trigBtn.type = 'button';
    trigBtn.id = 'openStrideCalcBtn';
    trigBtn.className = 'gw-stride-calc-trigger';
    trigBtn.innerHTML = '<i data-lucide="calculator"></i><span>Arvuta oma täpne sammupikkus</span>';
    parentCard.appendChild(trigBtn);
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

function applyMidnightIndigoThemeAndNav(openRouteBuilderFn, openStatsFn, openSettingsFn, goHomeFn) {
  setupFaviconAndPWA();

  const metaTags = [
    { name: 'color-scheme', content: 'only dark' },
    { name: 'supported-color-schemes', content: 'dark' },
    { name: 'darkreader-lock', content: 'true' },
    { name: 'theme-color', content: '#0f1429' }
  ];
  for (let i = 0; i < metaTags.length; i++) {
    let m = document.querySelector('meta[name="' + metaTags[i].name + '"]');
    if (!m) {
      m = document.createElement('meta');
      m.name = metaTags[i].name;
      document.head.appendChild(m);
    }
    m.content = metaTags[i].content;
  }

  const neonPng = createPngGradient('#7c3aed', '#c026d3', '#ec4899');
  const redPng = createPngGradient('#e11d48', '#f43f5e', '#fb7185');

  if (!document.getElementById('gw-midnight-indigo-theme')) {
    const st = document.createElement('style');
    st.id = 'gw-midnight-indigo-theme';

    const css = [
      ':root, html { color-scheme: only dark !important; }',
      'body, .app-shell, .subview-modal, .sidebar-drawer, .modal-content, .dial-modal-card { background: radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f1429 65%, #090d1a 100%) !important; color: #f8fafc !important; }',
      '#generatorModal { display: none !important; visibility: hidden !important; pointer-events: none !important; }',
      '.subview-modal { padding-bottom: 76px !important; }',
      '.close-subview, .close-modal-btn, #closeDialBtn { border-radius: 50% !important; background: rgba(30, 41, 59, 0.78) !important; border: 1px solid rgba(168, 85, 247, 0.35) !important; color: #fff !important; }',
      '.hud-card, .bottom-hud, #bottomHud { background: linear-gradient(165deg, rgba(25, 30, 64, 0.94) 0%, rgba(14, 18, 38, 0.98) 100%) !important; border: 1px solid rgba(168, 85, 247, 0.34) !important; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55) !important; bottom: 74px !important; border-radius: 24px !important; }',
      /* PNG neoon-gradient KÕIGIL peamistel nuppudel (sh Seadete Rakenda, Sammuratas ja Kalkulaator) */
      '#startWalkBtn, .primary-btn, .generate-btn, .gw-rb-cta, .gw-calc-apply, #openGeneratorBtn, #applyPromoBtn, #promoApplyBtn, #settingsModal .promo-box button, #settingsModal button.primary-btn, #triggerInstallBtn, #saveAndRouteDialBtn, #dialSaveAndRouteBtn, [id*="dial" i] button[id*="route" i], .dial-mode-btn.active, .dial-tab.active, .map-style-pill.active, .layer-btn.active, .pro-tag { background-image: url("' + neonPng + '") !important; background-size: 100% 100% !important; border: 1px solid rgba(244, 114, 182, 0.5) !important; color: #ffffff !important; font-weight: 700 !important; box-shadow: 0 6px 20px rgba(217, 70, 239, 0.44) !important; }',
      '#startWalkBtn, .gw-rb-cta, .gw-calc-apply, #triggerInstallBtn, #saveAndRouteDialBtn { border-radius: 999px !important; }',
      '#startWalkBtn.walking-active { background-image: url("' + redPng + '") !important; }',
      '.dial-step-btn, .quick-step-btn { background: rgba(26, 31, 66, 0.92) !important; border: 1px solid rgba(168, 85, 247, 0.36) !important; color: #fff !important; border-radius: 14px !important; font-weight: 700 !important; }',
      '#saveStepsOnlyBtn, #dialSaveOnlyBtn { background: rgba(22, 27, 58, 0.92) !important; border: 1px solid rgba(168, 85, 247, 0.34) !important; color: #e2e8f0 !important; border-radius: 999px !important; }',
      '.gw-bottom-navbar { position: fixed; left: 0; right: 0; bottom: 0; height: 64px; background: rgba(12, 16, 34, 0.96); backdrop-filter: blur(16px); border-top: 1px solid rgba(168, 85, 247, 0.26); display: grid; grid-template-columns: repeat(4, 1fr); z-index: 3500; padding: 4px 8px; }',
      '.gw-bnav-btn { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: 600 0.72rem inherit; cursor: pointer; transition: 0.2s; }',
      '.gw-bnav-btn svg { width: 20px; height: 20px; }',
      '.gw-bnav-btn.active { color: #ec4899 !important; }',
      '.gw-bnav-btn.active svg { stroke: #ec4899 !important; filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.6)); }',
      '.gw-rb-modal { position: fixed; inset: 0; background: radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f1429 70%, #090d1a 100%); z-index: 2800; display: none; flex-direction: column; padding: 18px 18px 88px; overflow-y: auto; }',
      '.gw-rb-modal.open { display: flex; }',
      '.gw-rb-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }',
      '.gw-rb-back { width: 38px; height: 38px; border-radius: 50%; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(168, 85, 247, 0.35); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }',
      '.gw-rb-title { font-size: 1.2rem; font-weight: 800; color: #fff; }',
      '.gw-rb-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px; }',
      '.gw-rb-tab { background: rgba(22, 27, 58, 0.88); border: 1px solid rgba(168, 85, 247, 0.26); color: #cbd5e1; border-radius: 14px; padding: 10px 6px; font: 600 0.82rem inherit; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }',
      '.gw-rb-tab svg { width: 16px; height: 16px; }',
      '.gw-rb-tab.active { background-image: url("' + neonPng + '") !important; background-size: 100% 100% !important; border-color: #f472b6 !important; color: #fff !important; box-shadow: 0 0 14px rgba(236, 72, 153, 0.45); }',
      '.gw-rb-valbox { text-align: center; margin-bottom: 16px; }',
      '.gw-rb-bigval { font-size: 2.1rem; font-weight: 800; color: #fff; }',
      '.gw-rb-unit { font-size: 1rem; color: #cbd5e1; margin-left: 6px; font-weight: 600; }',
      '.gw-rb-slider { width: 100%; accent-color: #ec4899; height: 6px; border-radius: 99px; cursor: pointer; margin-bottom: 8px; }',
      '.gw-rb-marks { display: flex; justify-content: space-between; font-size: 0.72rem; color: #94a3b8; font-weight: 600; margin-bottom: 20px; }',
      '.gw-rb-sub { font-size: 0.9rem; font-weight: 700; color: #cbd5e1; margin-bottom: 10px; }',
      '.gw-rb-types { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }',
      '.gw-rb-type { display: flex; align-items: center; gap: 14px; background: linear-gradient(160deg, rgba(26, 31, 66, 0.9), rgba(15, 20, 42, 0.95)); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 20px; padding: 12px 14px; cursor: pointer; transition: 0.2s; }',
      '.gw-rb-type.active { background: rgba(124, 58, 237, 0.28); border-color: #ec4899 !important; box-shadow: 0 0 16px rgba(236, 72, 153, 0.32); }',
      '.gw-rb-tico { width: 40px; height: 40px; border-radius: 12px; background: rgba(236, 72, 153, 0.16); color: #f472b6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
      '.gw-rb-tname { font-size: 0.95rem; font-weight: 700; color: #fff; }',
      '.gw-rb-tdesc { font-size: 0.76rem; color: #94a3b8; }',
      '.gw-rb-stops { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(160deg, rgba(26, 31, 66, 0.9), rgba(15, 20, 42, 0.95)); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 18px; padding: 10px 14px; margin-bottom: 18px; font-size: 0.84rem; color: #cbd5e1; font-weight: 600; }',
      '.gw-rb-stepper { display: flex; align-items: center; gap: 12px; }',
      '.gw-rb-sbtn { width: 32px; height: 32px; border-radius: 9px; background: rgba(168, 85, 247, 0.25); border: 1px solid rgba(236, 72, 153, 0.45); color: #fff; font-weight: 700; cursor: pointer; }',
      '.gw-rb-cta { width: 100%; padding: 15px; font-size: 1rem; font-weight: 800; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }'
    ];
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }

  const helpModal = document.getElementById('helpModal');
  if (helpModal) {
    const cards = helpModal.querySelectorAll('p, div, span, h4, h3');
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].textContent && cards[i].textContent.indexOf('Kuidas töötab sünkroniseerimine') !== -1 && cards[i].children.length === 0) {
        cards[i].textContent = 'Automaatne jalutusring & sammulugeja';
      }
      if (cards[i].textContent && cards[i].textContent.indexOf('Terviseandmete sünkroniseerimine') !== -1 && cards[i].children.length === 0) {
        cards[i].textContent = 'Ava alt menüüst "Marsruudid", vali soovitud sammud või aeg ning GoWalk koostab sulle täpse jalutusringi algusega sinu asukohast.';
      }
    }
  }

  if (!document.getElementById('gwRouteBuilderModal')) {
    const rb = document.createElement('div');
    rb.id = 'gwRouteBuilderModal';
    rb.className = 'gw-rb-modal';
    rb.innerHTML = [
      '<div class="gw-rb-head">',
        '<button type="button" class="gw-rb-back" id="gwRbCloseBtn"><i data-lucide="arrow-left"></i></button>',
        '<span class="gw-rb-title">Loo jalutusring</span>',
      '</div>',
      '<div class="gw-rb-tabs">',
        '<button type="button" class="gw-rb-tab active" data-mode="steps"><i data-lucide="footprints"></i> Sammud</button>',
        '<button type="button" class="gw-rb-tab" data-mode="time"><i data-lucide="clock"></i> Aeg</button>',
        '<button type="button" class="gw-rb-tab" data-mode="dist"><i data-lucide="route"></i> Vahemaa</button>',
      '</div>',
      '<div class="gw-rb-valbox">',
        '<span class="gw-rb-bigval" id="gwRbValText">5000</span>',
        '<span class="gw-rb-unit" id="gwRbUnitText">sammu</span>',
      '</div>',
      '<input type="range" id="gwRbSlider" class="gw-rb-slider" min="1000" max="20000" step="500" value="5000" />',
      '<div class="gw-rb-marks"><span>1K</span><span>3K</span><span>5K</span><span>10K</span><span>15K</span><span>20K</span></div>',
      '<div class="gw-rb-sub">Marsruudi tüüp</div>',
      '<div class="gw-rb-types">',
        '<div class="gw-rb-type active" data-rtype="loop">',
          '<div class="gw-rb-tico"><i data-lucide="refresh-cw"></i></div>',
          '<div style="flex:1;"><div class="gw-rb-tname">Puhas ring</div><div class="gw-rb-tdesc">Algus ja lõpp samas kohas</div></div>',
          '<i data-lucide="chevron-right" style="color:#94a3b8;width:18px;height:18px;"></i>',
        '</div>',
        '<div class="gw-rb-type" data-rtype="discover">',
          '<div class="gw-rb-tico"><i data-lucide="star"></i></div>',
          '<div style="flex:1;"><div class="gw-rb-tname">Avasta</div><div class="gw-rb-tdesc">Uus ja huvitav marsruut</div></div>',
          '<i data-lucide="chevron-right" style="color:#94a3b8;width:18px;height:18px;"></i>',
        '</div>',
        '<div class="gw-rb-type" data-rtype="park">',
          '<div class="gw-rb-tico"><i data-lucide="trees"></i></div>',
          '<div style="flex:1;"><div class="gw-rb-tname">Park ja loodus</div><div class="gw-rb-tdesc">Eelista rohealasid</div></div>',
          '<i data-lucide="chevron-right" style="color:#94a3b8;width:18px;height:18px;"></i>',
        '</div>',
        '<div class="gw-rb-type" data-rtype="surprise">',
          '<div class="gw-rb-tico"><i data-lucide="sparkles"></i></div>',
          '<div style="flex:1;"><div class="gw-rb-tname">Üllata mind</div><div class="gw-rb-tdesc">GoWalk valib sinu eest</div></div>',
          '<i data-lucide="chevron-right" style="color:#94a3b8;width:18px;height:18px;"></i>',
        '</div>',
      '</div>',
      '<div class="gw-rb-stops">',
        '<span>Peatuste arv (valikuline)</span>',
        '<div class="gw-rb-stepper">',
          '<button type="button" class="gw-rb-sbtn" id="gwStopMinus">-</button>',
          '<strong id="gwStopCount" style="color:#fff;min-width:16px;text-align:center;">3</strong>',
          '<button type="button" class="gw-rb-sbtn" id="gwStopPlus">+</button>',
        '</div>',
      '</div>',
      '<button type="button" class="gw-rb-cta" id="gwRbCreateBtn"><i data-lucide="sparkles"></i> Loo marsruut</button>'
    ].join('');
    document.body.appendChild(rb);

    let rbMode = 'steps';
    let rbSteps = 5000;
    let rbStops = 3;

    const sliderEl = document.getElementById('gwRbSlider');
    const valEl = document.getElementById('gwRbValText');
    const unitEl = document.getElementById('gwRbUnitText');

    function updateRbDisplay() {
      const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
      if (rbMode === 'steps') {
        valEl.textContent = rbSteps.toLocaleString('et-EE');
        unitEl.textContent = 'sammu';
      } else if (rbMode === 'time') {
        valEl.textContent = String(Math.max(5, Math.round(rbSteps / 105)));
        unitEl.textContent = 'min';
      } else {
        valEl.textContent = ((rbSteps * strideM) / 1000).toFixed(1);
        unitEl.textContent = 'km';
      }
    }

    if (sliderEl) {
      sliderEl.addEventListener('input', function () {
        rbSteps = parseInt(sliderEl.value, 10) || 5000;
        updateRbDisplay();
      });
    }

    rb.addEventListener('click', function (e) {
      if (e.target.closest('#gwRbCloseBtn')) {
        rb.classList.remove('open');
        goHomeFn();
        return;
      }
      const tab = e.target.closest('.gw-rb-tab');
      if (tab) {
        rbMode = tab.getAttribute('data-mode') || 'steps';
        const allT = rb.querySelectorAll('.gw-rb-tab');
        for (let i = 0; i < allT.length; i++) allT[i].classList.remove('active');
        tab.classList.add('active');
        updateRbDisplay();
        return;
      }
      const tCard = e.target.closest('.gw-rb-type');
      if (tCard) {
        const allC = rb.querySelectorAll('.gw-rb-type');
        for (let i = 0; i < allC.length; i++) allC[i].classList.remove('active');
        tCard.classList.add('active');
        return;
      }
      if (e.target.closest('#gwStopMinus')) {
        rbStops = Math.max(1, rbStops - 1);
        document.getElementById('gwStopCount').textContent = String(rbStops);
        return;
      }
      if (e.target.closest('#gwStopPlus')) {
        rbStops = Math.min(8, rbStops + 1);
        document.getElementById('gwStopCount').textContent = String(rbStops);
        return;
      }
      if (e.target.closest('#gwRbCreateBtn')) {
        rb.classList.remove('open');
        goHomeFn();
        generateLoopRouteForSteps(rbSteps);
      }
    });
  }

  if (!document.getElementById('gwBottomNavbar')) {
    const nav = document.createElement('nav');
    nav.id = 'gwBottomNavbar';
    nav.className = 'gw-bottom-navbar';
    nav.innerHTML = [
      '<button type="button" class="gw-bnav-btn active" data-bnav="home"><i data-lucide="home"></i><span>Avaleht</span></button>',
      '<button type="button" class="gw-bnav-btn" data-bnav="routes"><i data-lucide="route"></i><span>Marsruudid</span></button>',
      '<button type="button" class="gw-bnav-btn" data-bnav="stats"><i data-lucide="bar-chart-2"></i><span>Statistika</span></button>',
      '<button type="button" class="gw-bnav-btn" data-bnav="settings"><i data-lucide="settings"></i><span>Seaded</span></button>'
    ].join('');
    document.body.appendChild(nav);

    nav.addEventListener('click', function (e) {
      const btn = e.target.closest('.gw-bnav-btn');
      if (!btn) return;
      const target = btn.getAttribute('data-bnav');
      const allB = nav.querySelectorAll('.gw-bnav-btn');
      for (let i = 0; i < allB.length; i++) allB[i].classList.remove('active');
      btn.classList.add('active');

      if (target === 'home') goHomeFn();
      if (target === 'routes') openRouteBuilderFn();
      if (target === 'stats') openStatsFn();
      if (target === 'settings') openSettingsFn();
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function bootGoWalkApp() {
  const syncNavBtn = document.querySelector('.nav-item[data-target="syncModal"]');
  if (syncNavBtn) syncNavBtn.remove();
  const syncModalEl = document.getElementById('syncModal');
  if (syncModalEl) syncModalEl.remove();
  const quickAddBtn = document.getElementById('quickAddStepsBtn');
  if (quickAddBtn) quickAddBtn.remove();

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
    editAvatarBtn.addEventListener('click', function () {
      const randomSeed = 'GoWalk_' + Math.floor(Math.random() * 9999);
      state.profile.avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + randomSeed;
      saveState();
      renderProfile();
    });
  }

  const googleAuthBtn = document.getElementById('googleAuthBtn');
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async function () {
      if (!supabaseClient) {
        alert('Pilveühendus luuakse, proovi hetke pärast uuesti.');
        return;
      }

      if (state.profile.email) {
        const confirmLogout = confirm(
          'Oled sisse logitud kui ' + state.profile.email + '.\n\nKas soovid välja logida?'
        );
        if (confirmLogout) {
          await performFullLogout();
        }
        return;
      }

      try {
        const res = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (res.error) throw res.error;
      } catch (err) {
        const manualEmail = prompt('Registreeru või logi sisse oma e-posti aadressiga:', '');
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

  const sidebarDrawer = document.getElementById('sidebarDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const navItems = document.querySelectorAll('.nav-item');
  const subviewModals = document.querySelectorAll('.subview-modal');

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
      const valEl = document.getElementById('gwRbValText');
      if (sliderEl) sliderEl.value = String(defSteps);
      if (valEl) valEl.textContent = defSteps.toLocaleString('et-EE');
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

  for (let i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener('click', function () {
      const targetId = this.getAttribute('data-target');
      for (let j = 0; j < navItems.length; j++) navItems[j].classList.remove('active');
      this.classList.add('active');
      closeDrawer();

      for (let k = 0; k < subviewModals.length; k++) subviewModals[k].classList.remove('open');

      if (targetId === 'statsModal') {
        openStatsView();
      } else if (targetId === 'settingsModal') {
        openSettingsView();
      } else if (targetId !== 'home') {
        const modal = document.getElementById(targetId);
        if (modal) {
          if (targetId === 'adminModal') loadAdminDashboard();
          modal.classList.add('open');
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
      hintBadge.textContent = missing > 0 ? 'Puudu ' + missing.toLocaleString('et-EE') : 'Täidetud ✓';
    }

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

  document.addEventListener('visibilitychange', function () {
    if (!isWalking) return;
    syncWalkElapsedTime();
    if (document.visibilityState === 'visible') {
      requestPocketWakeLock();
    }
  });

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');

  if (startWalkBtn) {
    startWalkBtn.addEventListener('click', async function () {
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
            function () {},
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
  refreshAllUI();
  initSupabase(refreshAllUI);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGoWalkApp);
} else {
  bootGoWalkApp();
}
