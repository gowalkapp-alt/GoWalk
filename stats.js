/* ==========================================================================
   GOWALK PRO — STATS.JS (COMPACT & MOBILE-SAFE ACTIVITY DASHBOARD)
   ========================================================================== */

import { state } from './state.js';

let activePeriod = 'day';
let selectedDateKey = '';
let activeBarIdx = -1;

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
  if (document.getElementById('gw-stats-css')) return;
  const st = document.createElement('style');
  st.id = 'gw-stats-css';
  st.textContent = `
    .gw-act-wrap { display:flex; flex-direction:column; gap:15px; padding-bottom:20px; }
    .gw-tabs { display:grid; grid-template-columns:repeat(4,1fr); background:rgba(14,10,29,0.8); border:1px solid rgba(139,92,246,0.25); border-radius:99px; padding:4px; gap:4px; }
    .gw-tab { background:transparent; border:1px solid transparent; color:rgba(203,213,225,0.75); font:600 0.82rem inherit; padding:8px 4px; border-radius:99px; cursor:pointer; }
    .gw-tab.active { background:rgba(139,92,246,0.2); border-color:#a855f7; color:#fff; box-shadow:0 0 12px rgba(168,85,247,0.35); }
    .gw-strip { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .gw-pill { display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 2px; border-radius:99px; background:rgba(20,15,38,0.78); border:1px solid rgba(139,92,246,0.2); color:#e2e8f0; cursor:pointer; }
    .gw-pill-n { font-size:0.9rem; font-weight:700; }
    .gw-pill-d { font-size:0.68rem; opacity:0.75; }
    .gw-pill.active { background:linear-gradient(180deg,#ec4899 0%,#8b5cf6 52%,#06b6d4 100%); border-color:rgba(255,255,255,0.5); color:#fff; box-shadow:0 6px 16px rgba(168,85,247,0.5); transform:translateY(-2px); }
    .gw-pill.future { opacity:0.35; pointer-events:none; }
    .gw-card { background:linear-gradient(160deg,rgba(27,20,52,0.9),rgba(14,10,28,0.95)); border:1px solid rgba(139,92,246,0.25); border-radius:22px; padding:16px; display:flex; flex-direction:column; gap:13px; }
    .gw-mrow { display:flex; align-items:center; gap:12px; }
    .gw-mico { width:36px; height:36px; border-radius:11px; display:flex; align-items:center; justify-content:center; }
    .gw-mico svg { width:18px; height:18px; }
    .gw-mico.c1 { background:rgba(6,182,212,0.16); color:#22d3ee; }
    .gw-mico.c2 { background:rgba(244,63,94,0.16); color:#fb7185; }
    .gw-mico.c3 { background:rgba(249,115,22,0.16); color:#fb923c; }
    .gw-mval { font-size:1.22rem; font-weight:800; color:#fff; }
    .gw-mgoal { font-size:0.8rem; color:#94a3b8; margin-left:4px; }
    .gw-srow { display:flex; align-items:center; justify-content:space-between; gap:10px; padding-top:10px; border-top:1px solid rgba(139,92,246,0.15); font-size:0.8rem; color:#cbd5e1; }
    .gw-wave { flex:1; height:22px; }
    .gw-cstage { position:relative; height:150px; display:flex; flex-direction:column; justify-content:flex-end; padding-top:44px; }
    .gw-tip { position:absolute; top:0; transform:translateX(-50%); background:rgba(18,13,38,0.96); border:1px solid rgba(168,85,247,0.6); border-radius:11px; padding:5px 9px; white-space:nowrap; font-size:0.7rem; color:#fff; z-index:4; pointer-events:none; }
    .gw-bars { display:flex; align-items:flex-end; justify-content:space-between; height:96px; gap:5px; }
    .gw-bcol { flex:1; height:100%; display:flex; align-items:flex-end; justify-content:center; cursor:pointer; }
    .gw-bfill { width:100%; max-width:9px; border-radius:99px; background:rgba(148,163,184,0.22); min-height:8px; }
    .gw-bcol.active .gw-bfill { background:linear-gradient(180deg,#ec4899 0%,#8b5cf6 52%,#22d3ee 100%); box-shadow:0 0 12px rgba(236,72,153,0.6); }
    .gw-axis { display:flex; justify-content:space-between; margin-top:6px; font-size:0.68rem; color:#94a3b8; }
    .gw-grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
    .gw-lbox { background:rgba(20,15,38,0.75); border:1px solid rgba(139,92,246,0.18); border-radius:16px; padding:12px; }
    .gw-llbl { font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:4px; }
    .gw-lval { font-size:1.12rem; font-weight:800; color:#fff; }
    .gw-hrow { cursor:pointer; }
    .gw-hrow.selected-day { border-color:#a855f7 !important; background:rgba(139,92,246,0.15) !important; }
  `;
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
  const goal = (state.settings && state.settings.stepGoal) || 10000;

  const tp = todayKey.split('-');
  const todayObj = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]));
  const wds = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];

  let pillsHtml = '';
  for (let off = -5; off <= 1; off++) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() + off);
    const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const cls = 'gw-pill' + (ky === selectedDateKey ? ' active' : '') + (off > 0 ? ' future' : '');
    pillsHtml +=
      '<div class="' + cls + '" data-date="' + ky + '">' +
      '<span class="gw-pill-n">' + String(d.getDate()).padStart(2, '0') + '</span>' +
      '<span class="gw-pill-d">' + wds[d.getDay()] + '</span>' +
      '</div>';
  }

  const selRec = daysMap.get(selectedDateKey) || { steps: 0 };
  let pSteps = 0;
  let pGoal = goal;
  let subTitle = '';
  const bars = [];
  let axis = ['00:00', '12:00', '23:59'];

  if (activePeriod === 'day') {
    pSteps = selRec.steps || 0;
    subTitle = prettyDay(selectedDateKey, todayKey);
    const wList = [0, 0, 0.04, 0.09, 0.14, 0.11, 0.09, 0.13, 0.18, 0.12, 0.07, 0.03, 0, 0];
    for (let i = 0; i < wList.length; i++) {
      const st = pSteps > 0 ? Math.round(pSteps * wList[i]) : 0;
      const h = Math.floor((i * 24) / wList.length);
      bars.push({
        label: String(h).padStart(2, '0') + ':00',
        steps: st,
        km: +((st * strideM) / 1000).toFixed(2),
        cal: Math.round(st * 0.04)
      });
    }
  } else if (activePeriod === 'week') {
    pGoal = goal * 7;
    subTitle = 'Viimased 7 päeva';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const r = daysMap.get(ky);
      const st = r ? r.steps : 0;
      pSteps += st;
      bars.push({
        label: wds[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1),
        steps: st,
        km: +((st * strideM) / 1000).toFixed(2),
        cal: Math.round(st * 0.04)
      });
    }
    axis = ['7p tagasi', 'Keskel', 'Täna'];
  } else if (activePeriod === 'month') {
    pGoal = goal * 30;
    subTitle = 'Viimased 30 päeva';
    for (let i = 9; i >= 0; i--) {
      let st = 0;
      let lbl = '';
      for (let j = 0; j < 3; j++) {
        const d = new Date(todayObj);
        d.setDate(d.getDate() - (i * 3 + j));
        const ky = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const r = daysMap.get(ky);
        st += r ? r.steps : 0;
        if (j === 0) lbl = d.getDate() + '.' + (d.getMonth() + 1);
      }
      pSteps += st;
      bars.push({
        label: lbl,
        steps: st,
        km: +((st * strideM) / 1000).toFixed(2),
        cal: Math.round(st * 0.04)
      });
    }
    axis = ['30p tagasi', '15p tagasi', 'Täna'];
  } else {
    pGoal = goal * 365;
    subTitle = 'Aasta ' + tp[0];
    const mos = ['Jaan', 'Veebr', 'Märts', 'Apr', 'Mai', 'Juuni', 'Juuli', 'Aug', 'Sept', 'Okt', 'Nov', 'Dets'];
    const mSum = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const allVals = Array.from(daysMap.values());
    for (let i = 0; i < allVals.length; i++) {
      const sp = allVals[i].date.split('-');
      if (sp[0] === tp[0]) {
        const mi = (Number(sp[1]) || 1) - 1;
        mSum[mi] += allVals[i].steps || 0;
      }
    }
    for (let i = 0; i < 12; i++) {
      const st = mSum[i];
      pSteps += st;
      bars.push({
        label: mos[i],
        steps: st,
        km: +((st * strideM) / 1000).toFixed(2),
        cal: Math.round(st * 0.04)
      });
    }
    axis = ['Jaan', 'Juuni', 'Dets'];
  }

  let maxBar = 1;
  let peakIdx = Math.floor(bars.length / 2);
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].steps > maxBar) {
      maxBar = bars[i].steps;
      peakIdx = i;
    }
  }
  if (activeBarIdx < 0 || activeBarIdx >= bars.length) {
    activeBarIdx = peakIdx;
  }

  let barsHtml = '';
  for (let i = 0; i < bars.length; i++) {
    const hPct = bars[i].steps > 0 ? Math.max(16, Math.round((bars[i].steps / maxBar) * 100)) : 10;
    const cls = i === activeBarIdx ? 'gw-bcol active' : 'gw-bcol';
    barsHtml +=
      '<div class="' + cls + '" data-bidx="' + i + '">' +
      '<div class="gw-bfill" style="height:' + hPct + '%;"></div>' +
      '</div>';
  }

  const actBar = bars[activeBarIdx] || { label: '', steps: 0, km: 0, cal: 0 };
  const tipLeft = Math.min(80, Math.max(20, Math.round(((activeBarIdx + 0.5) / bars.length) * 100)));

  const sortedDays = Array.from(daysMap.values());
  sortedDays.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });

  let totalStepsAll = 0;
  let activeDays = 0;
  let histHtml = '';

  for (let i = 0; i < sortedDays.length; i++) {
    const r = sortedDays[i];
    totalStepsAll += r.steps || 0;
    if ((r.steps || 0) > 0) activeDays++;
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

  const pKm = ((pSteps * strideM) / 1000).toFixed(2);
  const gKm = ((pGoal * strideM) / 1000).toFixed(2);
  const pCal = Math.round(pSteps * 0.04);
  const gCal = Math.round(pGoal * 0.04);
  const speed = pSteps > 0 ? '4.8 km/h' : '0.0 km/h';
  const totalKmAll = ((totalStepsAll * strideM) / 1000).toFixed(1);
  const streakCount = Math.max(1, activeDays);

  box.innerHTML = `
    <div class="gw-act-wrap">
      <div class="gw-tabs">
        <button type="button" class="gw-tab ${activePeriod === 'day' ? 'active' : ''}" data-period="day">Päev</button>
        <button type="button" class="gw-tab ${activePeriod === 'week' ? 'active' : ''}" data-period="week">Nädal</button>
        <button type="button" class="gw-tab ${activePeriod === 'month' ? 'active' : ''}" data-period="month">Kuu</button>
        <button type="button" class="gw-tab ${activePeriod === 'year' ? 'active' : ''}" data-period="year">Aasta</button>
      </div>

      <div class="gw-strip">${pillsHtml}</div>

      <div class="gw-card">
        <div class="gw-mrow">
          <div class="gw-mico c1"><i data-lucide="footprints"></i></div>
          <div>
            <span class="gw-mval">${pSteps.toLocaleString('et-EE')}</span>
            <span class="gw-mgoal">/ ${pGoal.toLocaleString('et-EE')} sammu</span>
          </div>
        </div>
        <div class="gw-mrow">
          <div class="gw-mico c2"><i data-lucide="map-pin"></i></div>
          <div>
            <span class="gw-mval">${pKm}</span>
            <span class="gw-mgoal">/ ${gKm} km</span>
          </div>
        </div>
        <div class="gw-mrow">
          <div class="gw-mico c3"><i data-lucide="flame"></i></div>
          <div>
            <span class="gw-mval">${pCal.toLocaleString('et-EE')}</span>
            <span class="gw-mgoal">/ ${gCal.toLocaleString('et-EE')} kcal</span>
          </div>
        </div>
        <div class="gw-srow">
          <span>Keskm. kiirus</span>
          <svg class="gw-wave" viewBox="0 0 160 24" preserveAspectRatio="none">
            <path d="M2,18 C30,17 45,10 70,15 C95,18 110,5 135,11 C145,14 152,7 158,9" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <strong>${speed}</strong>
        </div>
      </div>

      <div class="gw-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#fff;">Statistika</strong>
          <span style="font-size:0.76rem;color:#c084fc;font-weight:600;">${subTitle}</span>
        </div>
        <div class="gw-cstage">
          <div class="gw-tip" style="left:${tipLeft}%;">
            <div style="color:#94a3b8;font-size:0.64rem;">${actBar.label}</div>
            <div>
              <span style="color:#22d3ee;">●</span> ${actBar.steps} &nbsp;
              <span style="color:#fb7185;">●</span> ${actBar.km} km &nbsp;
              <span style="color:#fb923c;">●</span> ${actBar.cal} kcal
            </div>
          </div>
          <div class="gw-bars">${barsHtml}</div>
        </div>
        <div class="gw-axis">
          <span>${axis[0]}</span>
          <span>${axis[1]}</span>
          <span>${axis[2]}</span>
        </div>
      </div>

      <div class="gw-grid2">
        <div class="gw-lbox">
          <span class="gw-llbl">Kokku sammud</span>
          <span class="gw-lval">${totalStepsAll.toLocaleString('et-EE')}</span>
        </div>
        <div class="gw-lbox">
          <span class="gw-llbl">Läbitud distants</span>
          <span class="gw-lval">${totalKmAll} km</span>
        </div>
        <div class="gw-lbox">
          <span class="gw-llbl">Aktiivne seeria (Streak)</span>
          <span class="gw-lval">${streakCount} päeva</span>
        </div>
        <div class="gw-lbox">
          <span class="gw-llbl">Salvestatud päevi</span>
          <span class="gw-lval">${streakCount}</span>
        </div>
      </div>

      <h4 class="section-subtitle" style="margin-top:4px;">Salvestatud päevade ajalugu</h4>
      <div id="historyList" class="history-list">${histHtml}</div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  box.onclick = function (e) {
    const tab = e.target.closest('.gw-tab');
    if (tab) {
      activePeriod = tab.getAttribute('data-period') || 'day';
      activeBarIdx = -1;
      renderStatsAndHistory();
      return;
    }

    const pill = e.target.closest('.gw-pill');
    if (pill && !pill.classList.contains('future')) {
      selectedDateKey = pill.getAttribute('data-date');
      activePeriod = 'day';
      activeBarIdx = -1;
      renderStatsAndHistory();
      return;
    }

    const bcol = e.target.closest('.gw-bcol');
    if (bcol) {
      activeBarIdx = parseInt(bcol.getAttribute('data-bidx'), 10) || 0;
      renderStatsAndHistory();
      return;
    }

    const hrow = e.target.closest('.gw-hrow');
    if (hrow) {
      selectedDateKey = hrow.getAttribute('data-hdate');
      activePeriod = 'day';
      activeBarIdx = -1;
      renderStatsAndHistory();
    }
  };
}

export function initStatsModule() {
  cleanAndMergeHistoryRecords();
}
