import { state } from '../state.js';
import { generateLoopRouteForSteps } from '../map.js';
import { createPngGradient, setupFaviconAndPWA } from './pwa.js';

export function applyMidnightIndigoThemeAndNav(openRouteBuilderFn, openStatsFn, openSettingsFn, goHomeFn) {
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
  const greenPng = createPngGradient('#059669', '#10b981', '#34d399');

  if (!document.getElementById('gw-midnight-indigo-theme')) {
    const st = document.createElement('style');
    st.id = 'gw-midnight-indigo-theme';

    const css = [
      ':root, html { color-scheme: only dark !important; }',
      'body, .app-shell, .subview-modal, .sidebar-drawer, .modal-content, .dial-modal-card { background: radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f1429 65%, #090d1a 100%) !important; color: #f8fafc !important; }',
      '#generatorModal { display: none !important; visibility: hidden !important; pointer-events: none !important; }',
      'html body .nav-item[data-target="syncModal"] { display: flex !important; }',
      'html body #syncModal.subview-modal { display: none !important; }',
      'html body #syncModal.subview-modal.open { display: flex !important; }',
      '.subview-modal { padding-bottom: 76px !important; }',
      '.close-subview, .close-modal-btn, #closeDialBtn { border-radius: 50% !important; background: rgba(30, 41, 59, 0.78) !important; border: 1px solid rgba(168, 85, 247, 0.35) !important; color: #fff !important; }',
      '.hud-card, .bottom-hud, #bottomHud { background: linear-gradient(165deg, rgba(25, 30, 64, 0.94) 0%, rgba(14, 18, 38, 0.98) 100%) !important; border: 1px solid rgba(168, 85, 247, 0.34) !important; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55) !important; bottom: 74px !important; border-radius: 24px !important; }',
      '.hud-action-row { display: flex !important; gap: 10px !important; align-items: center !important; width: 100% !important; }',
      '#startWalkBtn, .primary-btn, .generate-btn, .gw-rb-cta, .gw-calc-apply, .gw-sync-go-btn, #openGeneratorBtn, #applyPromoBtn, #promoApplyBtn, #settingsModal .subview-body > div:first-child button, #triggerInstallBtn, #triggerPwaInstallBtn, #saveAndRouteDialBtn, #dialSaveAndRouteBtn, [id*="dial" i] button[id*="route" i], .dial-mode-btn.active, .dial-tab.active, .map-style-pill.active, .layer-btn.active, .pro-tag { background-image: url("' + neonPng + '") !important; background-size: 100% 100% !important; border: 1px solid rgba(244, 114, 182, 0.52) !important; color: #ffffff !important; font-weight: 700 !important; box-shadow: 0 6px 20px rgba(217, 70, 239, 0.44) !important; }',
      '#startWalkBtn, .gw-rb-cta, .gw-calc-apply, #triggerInstallBtn, #triggerPwaInstallBtn, #saveAndRouteDialBtn { border-radius: 999px !important; }',
      '#startWalkBtn.walking-active { background-image: url("' + redPng + '") !important; border-color: rgba(251, 113, 133, 0.65) !important; box-shadow: 0 6px 20px rgba(225, 29, 72, 0.45) !important; font-size: 14px !important; }',
      '#pauseWalkBtn { height: 48px !important; padding: 0 18px !important; border-radius: 999px !important; background: rgba(28, 34, 72, 0.95) !important; border: 1px solid rgba(251, 191, 36, 0.55) !important; color: #fbbf24 !important; font-family: var(--font-display) !important; font-size: 14px !important; font-weight: 800 !important; display: none; align-items: center !important; justify-content: center !important; gap: 7px !important; cursor: pointer !important; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45) !important; flex-shrink: 0 !important; white-space: nowrap !important; transition: transform 0.15s ease, box-shadow 0.2s ease !important; }',
      '#pauseWalkBtn.visible { display: inline-flex !important; }',
      '#pauseWalkBtn:active { transform: scale(0.96) !important; }',
      '#pauseWalkBtn.paused-active { background-image: url("' + greenPng + '") !important; background-size: 100% 100% !important; border-color: rgba(110, 231, 183, 0.7) !important; color: #ffffff !important; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45) !important; }',
      '#pauseWalkBtn svg { width: 17px !important; height: 17px !important; stroke-width: 2.5px !important; }',
      '#liveDuration.paused-blink { color: #fbbf24 !important; }',
      '.gw-sync-wrap { display: flex; flex-direction: column; gap: 14px; padding-bottom: 84px; }',
      '.gw-sync-card { background: linear-gradient(160deg, rgba(28, 34, 74, 0.92), rgba(15, 20, 42, 0.96)); border: 1px solid rgba(168, 85, 247, 0.32); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 11px; box-shadow: 0 10px 26px rgba(0,0,0,0.35); }',
      '.gw-sync-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
      '.gw-sync-title { font-size: 0.95rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; }',
      '.gw-sync-title svg { width: 18px; height: 18px; }',
      '.gw-sync-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: rgba(236, 72, 153, 0.18); border: 1px solid rgba(236, 72, 153, 0.45); color: #f472b6; }',
      '.gw-sync-desc { font-size: 0.78rem; color: #cbd5e1; line-height: 1.4; margin: 0; }',
      '.gw-sync-mode-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(11, 15, 34, 0.9); padding: 4px; border-radius: 13px; border: 1px solid rgba(168, 85, 247, 0.25); }',
      '.gw-smode-btn { background: transparent; border: 1px solid transparent; color: #94a3b8; font: 700 0.75rem inherit; padding: 8px 6px; border-radius: 9px; cursor: pointer; }',
      '.gw-smode-btn.active { background: rgba(168, 85, 247, 0.28); border-color: #ec4899; color: #fff; }',
      '.gw-sync-input-row { display: flex; gap: 8px; }',
      '.gw-sync-go-btn { padding: 0 16px; border-radius: 12px; font: 800 0.84rem inherit; cursor: pointer; white-space: nowrap; }',
      '.gw-sync-chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
      '.gw-schip { background: rgba(20, 26, 56, 0.9); border: 1px solid rgba(168, 85, 247, 0.3); color: #e2e8f0; border-radius: 10px; padding: 7px 4px; font: 700 0.74rem inherit; cursor: pointer; }',
      '.gw-schip:active { transform: scale(0.96); border-color: #ec4899; }',
      '.gw-sync-feedback { font-size: 0.76rem; font-weight: 700; color: #38bdf8; min-height: 4px; line-height: 1.35; }',
      '.gw-file-drop-btn { width: 100%; padding: 14px; border-radius: 16px; background: rgba(14, 20, 44, 0.92); border: 1px dashed rgba(56, 189, 248, 0.65); color: #38bdf8; font: 700 0.82rem inherit; display: flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; }',
      '.gw-file-drop-btn svg { width: 19px; height: 19px; flex-shrink: 0; }',
      '.gw-sync-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }',
      '.gw-sync-prov { display: flex; align-items: center; gap: 9px; background: rgba(16, 21, 46, 0.9); border: 1px solid rgba(168, 85, 247, 0.24); border-radius: 14px; padding: 10px; color: #e2e8f0; text-align: left; cursor: pointer; }',
      '.gw-sync-prov.active { background: rgba(124, 58, 237, 0.28); border-color: #ec4899; box-shadow: 0 0 14px rgba(236, 72, 153, 0.3); }',
      '.gw-sync-pico { width: 32px; height: 32px; border-radius: 9px; background: rgba(236, 72, 153, 0.15); color: #f472b6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
      '.gw-sync-pico svg { width: 16px; height: 16px; }',
      '.gw-sync-pname { font-size: 0.78rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.gw-sync-psub { font-size: 0.65rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dial-step-btn, .quick-step-btn { background: rgba(26, 31, 66, 0.92) !important; border: 1px solid rgba(168, 85, 247, 0.36) !important; color: #fff !important; border-radius: 14px !important; font-weight: 700 !important; }',
      '#saveStepsOnlyBtn, #dialSaveOnlyBtn { background: rgba(22, 27, 58, 0.92) !important; border: 1px solid rgba(168, 85, 247, 0.34) !important; color: #e2e8f0 !important; border-radius: 999px !important; }',
      '.gw-bottom-navbar { position: fixed; left: 0; right: 0; bottom: 0; height: 64px; background: rgba(12, 16, 34, 0.96); backdrop-filter: blur(16px); border-top: 1px solid rgba(168, 85, 247, 0.26); display: grid; grid-template-columns: repeat(3, 1fr); z-index: 3500; padding: 4px 8px; }',
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
    const helpBody = helpModal.querySelector('.subview-body');
    if (helpBody && !helpBody.dataset.updatedHelp) {
      helpBody.dataset.updatedHelp = '1';
      helpBody.innerHTML = [
        '<div class="help-card">',
          '<h4><i data-lucide="locate-fixed"></i> Täpne GPS & Alguspunkt (Pin A)</h4>',
          '<p>Äpp tuvastab avamisel automaatselt sinu asukoha. Kui soovid alguspunkti muuta, hoia näppu lillal alguspunktil (<strong>Pin A</strong>) ja lohista see sobivasse kohta või vajuta kaardi paremal servas sihiku nupule.</p>',
          '<p style="margin-top:4px;font-size:12px;color:#cbd5e1;"><strong>Nipp:</strong> Täpseima siseruumi GPS-i jaoks hoia telefonis sees <em>Täpne asukoht (Precise Location)</em> ja Wi-Fi otsing.</p>',
        '</div>',
        '<div class="help-card">',
          '<h4><i data-lucide="watch"></i> Kella & Telefoni Sünkroniseerimine</h4>',
          '<p>Ava <strong>Seaded → Sammud ja import</strong>, et sisestada sammud käsitsi või laadida üles kellast eksporditud <strong>.GPX / .TCX</strong> treeningufail koos GPS-rajaga.</p>',
        '</div>',
        '<div class="help-card">',
          '<h4><i data-lucide="footprints"></i> 360° Sammuketas & Kõnni salvestamine</h4>',
          '<p>Puuduta avalehel oma sammude arvu või protsendirõngast, et avada <strong>360° sammuketas</strong> – või vajuta otse <strong>Alusta kõndimist</strong>, et salvestada vaba kõnd koos GPS-rajaga.</p>',
        '</div>'
      ].join('');
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
        const activeTypeEl = rb.querySelector('.gw-rb-type.active');
        const chosenType = activeTypeEl ? activeTypeEl.getAttribute('data-rtype') : 'loop';
        const currentSteps = sliderEl ? parseInt(sliderEl.value, 10) || rbSteps : rbSteps;
        rb.classList.remove('open');
        goHomeFn();
        generateLoopRouteForSteps(currentSteps, chosenType, rbStops);
      }
    });
  }

  if (!document.getElementById('gwBottomNavbar')) {
    const nav = document.createElement('nav');
    nav.id = 'gwBottomNavbar';
    nav.className = 'gw-bottom-navbar';
    nav.innerHTML = [
      '<button type="button" class="gw-bnav-btn active" data-bnav="home"><i data-lucide="home"></i><span>Avaleht</span></button>',
      '<button type="button" class="gw-bnav-btn" data-bnav="stats"><i data-lucide="bar-chart-2"></i><span>Ajalugu</span></button>',
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
