/* ==========================================================================
   GOWALK PRO — STATS.JS ("SINU ARENG" PRO DASHBOARD MODULE)
   ========================================================================== */

import { state } from './state.js';

let activePeriod = 'day';
let selectedDateKey = '';

export function normalizeDateKey(raw) {
  const fallback = (state.today && state.today.date) || '2026-10-21';
  if (!raw || typeof raw !== 'string') return fallback;

  const s = raw.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  const ee = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ee) {
    const d = String(ee[1]).padStart(2, '0');
    const m = String(ee[2]).padStart(2, '0');
    return ee[3] + '-' + m + '-' + d;
  }
  return fallback;
}

export function cleanAndMergeHistoryRecords() {
  const daysMap = new Map();
  const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
  const todayKey = (state.today && state.today.date) || '2026-10-21';

  if (Array.isArray(state.history)) {
    for (let i = 0; i < state.history.length; i++) {
      const item = state.history[i];
      if (!item) continue;
      const k = normalizeDateKey(item.date);
      const st = Math.max(0, Number(item.steps) || 0);
      const prev = daysMap.get(k);
      if (!prev || st > prev.steps) {
        daysMap.set(k, {
          date: k,
          steps: st,
          distanceKm: +((st * strideM) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        });
      }
    }
  }

  const fromHist = daysMap.get(todayKey);
  if (fromHist && fromHist.steps > (state.today.steps || 0)) {
    state.today.steps = fromHist.steps;
  }

  daysMap.delete(todayKey);
  const pastList = Array.from(daysMap.values());
  pastList.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
  state.history = pastList;

  const todaySteps = Math.max(0, Number(state.today.steps) || 0);
  daysMap.set(todayKey, {
    date: todayKey,
    steps: todaySteps,
    distanceKm: +((todaySteps * strideM) / 1000).toFixed(2),
    calories: Math.round(todaySteps * 0.04)
  });

  return daysMap;
}

function injectStatsCss() {
  if (document.getElementById('gw-sinu-areng-css')) return;
  const st = document.createElement('style');
  st.id = 'gw-sinu-areng-css';
  const rules = [
    '.gw-areng-wrap { display:flex; flex-direction:column; gap:16px; padding-bottom:90px; color:#f8fafc; }',
    '.gw-areng-tabs { display:grid; grid-template-columns:repeat(4,1fr); background:rgba(15,20,42,0.85); border:1px solid rgba(139,92,246,0.28); border-radius:14px; padding:4px; gap:4px; }',
    '.gw-areng-tab { background:transparent; border:1px solid transparent; color:#94a3b8; font:600 0.84rem inherit; padding:9px 4px; border-radius:11px; cursor:pointer; transition:0.2s; }',
    '.gw-areng-tab.active { background:linear-gradient(135deg,rgba(124,58,237,0.45),rgba(236,72,153,0.35)); border-color:#a855f7; color:#fff; box-shadow:0 0 14px rgba(168,85,247,0.45); }',
    '.gw-hero-grid { display:grid; grid-template-columns:1.1fr 1fr; gap:14px; align-items:center; background:linear-gradient(160deg,rgba(26,31,66,0.9),rgba(15,20,42,0.95)); border:1px solid rgba(139,92,246,0.26); border-radius:22px; padding:18px 14px; box-shadow:0 12px 30px rgba(0,0,0,0.35); }',
    '.gw-ring-box { position:relative; width:146px; height:146px; margin:0 auto; display:flex; align-items:center; justify-content:center; }',
    '.gw-ring-svg { width:146px; height:146px; transform:rotate(-90deg); }',
    '.gw-ring-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }',
    '.gw-ring-steps { font-size:1.55rem; font-weight:800; color:#fff; line-height:1.1; }',
    '.gw-ring-goal { font-size:0.72rem; color:#94a3b8; margin-top:2px; }',
    '.gw-ring-pct { font-size:0.86rem; font-weight:700; color:#e2e8f0; margin-top:4px; }',
    '.gw-side-metrics { display:flex; flex-direction:column; gap:11px; }',
    '.gw-smetric { display:flex; align-items:center; gap:10px; }',
    '.gw-sm-ico { width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }',
    '.gw-sm-ico svg { width:16px; height:16px; }',
    '.gw-sm-ico.pink { background:rgba(236,72,153,0.16); color:#f472b6; }',
    '.gw-sm-ico.cyan { background:rgba(6,182,212,0.16); color:#22d3ee; }',
    '.gw-sm-ico.blue { background:rgba(99,102,241,0.18); color:#818cf8; }',
    '.gw-sm-ico.orange { background:rgba(249,115,22,0.16); color:#fb923c; }',
    '.gw-sm-val { font-size:0.98rem; font-weight:800; color:#fff; }',
    '.gw-sm-lbl { font-size:0.75rem; color:#94a3b8; margin-left:3px; font-weight:500; }',
    '.gw-glass-card { background:linear-gradient(160deg,rgba(26,31,66,0.88),rgba(15,20,42,0.94)); border:1px solid rgba(139,92,246,0.25); border-radius:22px; padding:16px; box-shadow:0 10px 26px rgba(0,0,0,0.3); }',
    '.gw-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }',
    '.gw-card-title { font-size:0.98rem; font-weight:700; color:#fff; }',
    '.gw-card-link { font-size:0.76rem; font-weight:600; color:#a855f7; display:flex; align-items:center; gap:2px; }',
    '.gw-walk-grid { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; align-items:center; }',
    '.gw-mini-map { height:106px; border-radius:14px; background:radial-gradient(circle at center,#1e293b 0%,#0f172a 100%); border:1px solid rgba(168,85,247,0.32); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; }',
    '.gw-wk-list { display:flex; flex-direction:column; gap:7px; font-size:0.84rem; color:#e2e8f0; }',
    '.gw-wk-item { display:flex; align-items:center; gap:8px; font-weight:700; }',
    '.gw-wk-item svg { width:15px; height:15px; color:#c084fc; }',
    '.gw-wk-grid { display:grid; grid-template-columns:28px 1fr; gap:8px; align-items:end; height:112px; padding-top:8px; }',
    '.gw-yaxis { display:flex; flex-direction:column; justify-content:space-between; height:88px; font-size:0.66rem; color:#64748b; font-weight:600; padding-bottom:18px; }',
    '.gw-wbars { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; height:106px; align-items:end; }',
    '.gw-wcol { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:6px; cursor:pointer; }',
    '.gw-wbar { width:100%; max-width:14px; border-radius:99px; background:linear-gradient(180deg,#38bdf8 0%,#8b5cf6 55%,#ec4899 100%); min-height:8px; transition:height 0.25s ease; opacity:0.75; }',
    '.gw-wcol.active .gw-wbar { opacity:1; box-shadow:0 0 14px rgba(236,72,153,0.65); }',
    '.gw-wday { font-size:0.7rem; font-weight:600; color:#94a3b8; }',
    '.gw-wcol.active .gw-wday { color:#fff; font-weight:800; }',
    '.gw-motiv-card { display:flex; align-items:center; gap:14px; background:linear-gradient(135deg,rgba(46,29,89,0.85),rgba(20,24,52,0.95)); border:1px solid rgba(236,72,153,0.35); border-radius:20px; padding:14px 16px; }',
    '.gw-motiv-ico { width:46px; height:46px; border-radius:50%; background:radial-gradient(circle,#ec4899 0%,#7c3aed 100%); display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 0 18px rgba(236,72,153,0.55); flex-shrink:0; }',
    '.gw-motiv-title { font-size:0.92rem; font-weight:800; color:#fff; margin-bottom:2px; }',
    '.gw-motiv-sub { font-size:0.76rem; color:#cbd5e1; line-height:1.35; }',
    '.gw-hrow { cursor:pointer; transition:0.2s; }',
    '.gw-hrow.selected-day { border-color:#ec4899 !important; background:rgba(124,58,237,0.22) !important; }'
  ];
  st.textContent = rules.join('\n');
  document.head.appendChild(st);
}

function prettyDay(dateKey, todayKey) {
  const p = dateKey.split('-');
  const y = Number(p[0]) || 2026;
  const m = Number(p[1]) || 1;
  const d = Number(p[2]) || 1;
  const dt = new Date(y, m - 1, d);
  const wds = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
  const mos = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
  const label = wds[dt.getDay()] + ', ' + d + '. ' + mos[m - 1];
  return dateKey === todayKey ? 'Täna (' + label + ')' : label + ' ' + y;
}

export function renderStatsAndHistory() {
  injectStatsCss();

  const modal = document.getElementById('statsModal');
  if (!modal) return;

  const titleEl = modal.querySelector('h2, h3, .subview-title');
  if (titleEl) {
    titleEl.textContent = 'Sinu areng';
  }

  const hOrig = document.getElementById('historyList');
  const box =
    modal.querySelector('.subview-body') ||
    modal.querySelector('.modal-body') ||
    (hOrig ? hOrig.parentElement : null);
  if (!box) return;

  const daysMap = cleanAndMergeHistoryRecords();
  const todayKey = (state.today && state.today.date) || '2026-10-21';

  if (!selectedDateKey || !daysMap.has(selectedDateKey)) {
    selectedDateKey = todayKey;
  }

  const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
  const dailyGoal = (state.settings && state.settings.stepGoal) || 10000;

  const tp = todayKey.split('-');
  const todayObj = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]));
  const wds = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];

  const selRec = daysMap.get(selectedDateKey) || { steps: 0, distanceKm: 0, calories: 0 };

  let heroSteps = selRec.steps || 0;
  let heroGoal = dailyGoal;

  if (activePeriod === 'week') {
    heroSteps = 0;
    heroGoal = dailyGoal * 7;
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const r = daysMap.get(ky);
      if (r) heroSteps += r.steps || 0;
    }
  } else if (activePeriod === 'month') {
    heroSteps = 0;
    heroGoal = dailyGoal * 30;
    for (let i = 0; i < 30; i++) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const r = daysMap.get(ky);
      if (r) heroSteps += r.steps || 0;
    }
  } else if (activePeriod === 'year') {
    heroSteps = 0;
    heroGoal = dailyGoal * 365;
    const allV = Array.from(daysMap.values());
    for (let i = 0; i < allV.length; i++) {
      if (allV[i].date.indexOf(tp[0]) === 0) {
        heroSteps += allV[i].steps || 0;
      }
    }
  }

  const heroKm = ((heroSteps * strideM) / 1000).toFixed(2);
  const heroCal = Math.round(heroSteps * 0.04);
  const heroMin = Math.max(0, Math.round(heroSteps / 100));
  const pct = Math.min(100, Math.round((heroSteps / Math.max(1, heroGoal)) * 100));

  const ringCircumference = 352;
  const ringOffset = Math.round(ringCircumference - (pct / 100) * ringCircumference);

  const daySteps = selRec.steps || 0;
  const dayKm = ((daySteps * strideM) / 1000).toFixed(2);
  const dayCal = Math.round(daySteps * 0.04);
  const dayMin = Math.max(0, Math.round(daySteps / 100));
  const dayTimeFormatted = String(dayMin).padStart(2, '0') + ':00';

  let maxWeekSteps = dailyGoal;
  const weekItems = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() - i);
    const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const r = daysMap.get(ky);
    const st = r ? r.steps : 0;
    if (st > maxWeekSteps) maxWeekSteps = st;
    weekItems.push({
      key: ky,
      day: wds[d.getDay()],
      steps: st,
      active: ky === selectedDateKey
    });
  }

  let weekBarsHtml = '';
  for (let i = 0; i < weekItems.length; i++) {
    const it = weekItems[i];
    const hPct = it.steps > 0 ? Math.max(18, Math.round((it.steps / maxWeekSteps) * 100)) : 12;
    const cName = it.active ? 'gw-wcol active' : 'gw-wcol';
    weekBarsHtml +=
      '<div class="' + cName + '" data-wdate="' + it.key + '">' +
      '<div class="gw-wbar" style="height:' + hPct + '%;"></div>' +
      '<span class="gw-wday">' + it.day + '</span>' +
      '</div>';
  }

  const sortedDays = Array.from(daysMap.values());
  sortedDays.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });

  let histHtml = '';
  for (let i = 0; i < sortedDays.length; i++) {
    const r = sortedDays[i];
    const hCls = r.date === selectedDateKey ? 'history-item gw-hrow selected-day' : 'history-item gw-hrow';
    histHtml +=
      '<div class="' + hCls + '" data-hdate="' + r.date + '">' +
      '<div class="history-item-left">' +
      '<span class="history-date">' + prettyDay(r.date, todayKey) + '</span>' +
      '<span class="history-meta">' + Number(r.distanceKm || 0).toFixed(2) + ' km • ' + (r.calories || 0) + ' kcal</span>' +
      '</div>' +
      '<span class="history-steps-badge">' + Number(r.steps || 0).toLocaleString('et-EE') + ' sammu</span>' +
      '</div>';
  }

  const htmlParts = [
    '<div class="gw-areng-wrap">',
      '<div class="gw-areng-tabs">',
        '<button type="button" class="gw-areng-tab ' + (activePeriod === 'day' ? 'active' : '') + '" data-period="day">Täna</button>',
        '<button type="button" class="gw-areng-tab ' + (activePeriod === 'week' ? 'active' : '') + '" data-period="week">Nädal</button>',
        '<button type="button" class="gw-areng-tab ' + (activePeriod === 'month' ? 'active' : '') + '" data-period="month">Kuu</button>',
        '<button type="button" class="gw-areng-tab ' + (activePeriod === 'year' ? 'active' : '') + '" data-period="year">Aasta</button>',
      '</div>',

      '<div class="gw-hero-grid">',
        '<div class="gw-ring-box">',
          '<svg class="gw-ring-svg" viewBox="0 0 130 130">',
            '<defs>',
              '<linearGradient id="gwArengGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" stop-color="#ec4899" />',
                '<stop offset="50%" stop-color="#8b5cf6" />',
                '<stop offset="100%" stop-color="#06b6d4" />',
              '</linearGradient>',
            '</defs>',
            '<circle cx="65" cy="65" r="56" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="10" />',
            '<circle cx="65" cy="65" r="56" fill="none" stroke="url(#gwArengGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="352" stroke-dashoffset="' + ringOffset + '" />',
          '</svg>',
          '<div class="gw-ring-center">',
            '<span class="gw-ring-steps">' + heroSteps.toLocaleString('et-EE') + '</span>',
            '<span class="gw-ring-goal">/ ' + heroGoal.toLocaleString('et-EE') + ' sammu</span>',
            '<span class="gw-ring-pct">' + pct + '%</span>',
          '</div>',
        '</div>',

        '<div class="gw-side-metrics">',
          '<div class="gw-smetric"><div class="gw-sm-ico pink"><i data-lucide="footprints"></i></div><div><span class="gw-sm-val">' + heroSteps.toLocaleString('et-EE') + '</span><span class="gw-sm-lbl">sammu</span></div></div>',
          '<div class="gw-smetric"><div class="gw-sm-ico cyan"><i data-lucide="route"></i></div><div><span class="gw-sm-val">' + heroKm + '</span><span class="gw-sm-lbl">km</span></div></div>',
          '<div class="gw-smetric"><div class="gw-sm-ico blue"><i data-lucide="clock"></i></div><div><span class="gw-sm-val">' + heroMin + '</span><span class="gw-sm-lbl">min</span></div></div>',
          '<div class="gw-smetric"><div class="gw-sm-ico orange"><i data-lucide="flame"></i></div><div><span class="gw-sm-val">' + heroCal.toLocaleString('et-EE') + '</span><span class="gw-sm-lbl">kcal</span></div></div>',
        '</div>',
      '</div>',

      '<div class="gw-glass-card">',
        '<div class="gw-card-head">',
          '<span class="gw-card-title">' + prettyDay(selectedDateKey, todayKey) + '</span>',
          '<span class="gw-card-link">Vaata detaile <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></span>',
        '</div>',
        '<div class="gw-walk-grid">',
          '<div class="gw-mini-map">',
            '<svg viewBox="0 0 140 90" style="width:100%;height:100%;">',
              '<line x1="0" y1="25" x2="140" y2="65" stroke="rgba(148,163,184,0.12)" stroke-width="1" />',
              '<line x1="30" y1="0" x2="90" y2="90" stroke="rgba(148,163,184,0.12)" stroke-width="1" />',
              '<line x1="0" y1="70" x2="140" y2="15" stroke="rgba(148,163,184,0.12)" stroke-width="1" />',
              '<polygon points="38,48 65,18 106,32 92,72 52,68" fill="rgba(236,72,153,0.12)" stroke="#ec4899" stroke-width="3" stroke-linejoin="round" />',
              '<circle cx="38" cy="48" r="5" fill="#38bdf8" stroke="#fff" stroke-width="2" />',
            '</svg>',
          '</div>',
          '<div class="gw-wk-list">',
            '<div class="gw-wk-item"><i data-lucide="route"></i> <span>' + dayKm + ' km</span></div>',
            '<div class="gw-wk-item"><i data-lucide="clock"></i> <span>' + dayTimeFormatted + '</span></div>',
            '<div class="gw-wk-item"><i data-lucide="footprints"></i> <span>' + daySteps.toLocaleString('et-EE') + ' sammu</span></div>',
            '<div class="gw-wk-item"><i data-lucide="flame"></i> <span>' + dayCal + ' kcal</span></div>',
          '</div>',
        '</div>',
      '</div>',

      '<div class="gw-glass-card">',
        '<div class="gw-card-head">',
          '<span class="gw-card-title">Nädala ülevaade</span>',
          '<span class="gw-card-link">Vaata kõiki <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></span>',
        '</div>',
        '<div class="gw-wk-grid">',
          '<div class="gw-yaxis"><span>10K</span><span>5K</span><span>0</span></div>',
          '<div class="gw-wbars">' + weekBarsHtml + '</div>',
        '</div>',
      '</div>',

      '<div class="gw-motiv-card">',
        '<div class="gw-motiv-ico"><i data-lucide="flame"></i></div>',
        '<div style="flex:1;">',
          '<div class="gw-motiv-title">Suurepärane töö!</div>',
          '<div class="gw-motiv-sub">Oled selle nädala eesmärgi täitmisele hästi lähedal.</div>',
        '</div>',
        '<i data-lucide="chevron-right" style="color:#94a3b8;width:18px;height:18px;"></i>',
      '</div>',

      '<h4 class="section-subtitle" style="margin-top:4px;">Salvestatud päevade ajalugu</h4>',
      '<div id="historyList" class="history-list">' + histHtml + '</div>',
    '</div>'
  ];

  box.innerHTML = htmlParts.join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }

  box.onclick = function (e) {
    const tab = e.target.closest('.gw-areng-tab');
    if (tab) {
      activePeriod = tab.getAttribute('data-period') || 'day';
      renderStatsAndHistory();
      return;
    }

    const wcol = e.target.closest('.gw-wcol');
    if (wcol) {
      selectedDateKey = wcol.getAttribute('data-wdate');
      activePeriod = 'day';
      renderStatsAndHistory();
      return;
    }

    const hrow = e.target.closest('.gw-hrow');
    if (hrow) {
      selectedDateKey = hrow.getAttribute('data-hdate');
      activePeriod = 'day';
      renderStatsAndHistory();
    }
  };
}

export function initStatsModule() {
  cleanAndMergeHistoryRecords();
}
