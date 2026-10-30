/* ==========================================================================
   GOWALK PRO — STATS.JS ("SINU ARENG" — GPS-RAJAD, ÜLEVAATED JA KELLAVÕRDLUS)
   ========================================================================== */

import { state } from './state.js';

let activePeriod = 'day';
let selectedDateKey = '';
let historyFilterMode = 'all'; // 'all' | 'gps'
let detailLeafletMap = null;

function makePngGradientUrl(c1, c2, c3, vertical) {
  try {
    const cv = document.createElement('canvas');
    cv.width = vertical ? 32 : 240;
    cv.height = vertical ? 160 : 64;
    const ctx = cv.getContext('2d');
    const g = vertical
      ? ctx.createLinearGradient(0, 0, 0, cv.height)
      : ctx.createLinearGradient(0, 0, cv.width, 0);
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

export function normalizeDateKey(raw) {
  const fallback = (state.today && state.today.date) || new Date().toISOString().slice(0, 10);
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

// Arvutab GPS-punktide massiivist [[lat, lng], ...] täpse läbitud vahemaa kilomeetrites
function calculateTrackDistanceKm(track) {
  if (!Array.isArray(track) || track.length < 2) return 0;
  const R = 6371000;
  let totalMeters = 0;

  for (let i = 1; i < track.length; i++) {
    const p1 = track[i - 1];
    const p2 = track[i];
    if (!Array.isArray(p1) || !Array.isArray(p2)) continue;
    const lat1 = (Number(p1[0]) * Math.PI) / 180;
    const lat2 = (Number(p2[0]) * Math.PI) / 180;
    const dLat = ((Number(p2[0]) - Number(p1[0])) * Math.PI) / 180;
    const dLon = ((Number(p2[1]) - Number(p1[1])) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const seg = R * c;
    if (!Number.isNaN(seg) && seg < 2000) {
      totalMeters += seg;
    }
  }
  return +(totalMeters / 1000).toFixed(2);
}

function formatSecToClock(sec, fallbackSteps) {
  const totalSec =
    sec && sec > 0 ? Math.floor(sec) : Math.max(0, Math.round((fallbackSteps || 0) / 100) * 60);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

export function cleanAndMergeHistoryRecords() {
  const daysMap = new Map();
  const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
  const todayKey = (state.today && state.today.date) || new Date().toISOString().slice(0, 10);

  if (Array.isArray(state.history)) {
    for (let i = 0; i < state.history.length; i++) {
      const item = state.history[i];
      if (!item) continue;
      const k = normalizeDateKey(item.date);
      const st = Math.max(0, Number(item.steps) || 0);
      const dur = Math.max(0, Number(item.durationSec) || 0);
      const trk = Array.isArray(item.walkTrack) ? item.walkTrack : [];
      const prev = daysMap.get(k);

      if (!prev || st >= prev.steps || trk.length > (prev.walkTrack ? prev.walkTrack.length : 0)) {
        const bestSteps = prev ? Math.max(st, prev.steps) : st;
        const bestDur = prev ? Math.max(dur, prev.durationSec || 0) : dur;
        const bestTrack =
          prev && Array.isArray(prev.walkTrack) && prev.walkTrack.length > trk.length
            ? prev.walkTrack
            : trk;

        daysMap.set(k, {
          date: k,
          steps: bestSteps,
          distanceKm: +((bestSteps * strideM) / 1000).toFixed(2),
          calories: Math.round(bestSteps * 0.04),
          durationSec: bestDur,
          walkTrack: bestTrack
        });
      }
    }
  }

  const fromHist = daysMap.get(todayKey);
  if (fromHist) {
    if (fromHist.steps > (state.today.steps || 0)) {
      state.today.steps = fromHist.steps;
    }
    if ((fromHist.durationSec || 0) > (state.today.durationSec || 0)) {
      state.today.durationSec = fromHist.durationSec;
    }
    if (
      Array.isArray(fromHist.walkTrack) &&
      fromHist.walkTrack.length > (Array.isArray(state.today.walkTrack) ? state.today.walkTrack.length : 0)
    ) {
      state.today.walkTrack = fromHist.walkTrack;
    }
  }

  daysMap.delete(todayKey);
  const pastList = Array.from(daysMap.values());
  pastList.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
  state.history = pastList;

  const todaySteps = Math.max(0, Number(state.today.steps) || 0);
  const todayDur = Math.max(0, Number(state.today.durationSec) || 0);
  const todayTrack = Array.isArray(state.today.walkTrack) ? state.today.walkTrack : [];

  daysMap.set(todayKey, {
    date: todayKey,
    steps: todaySteps,
    distanceKm: +((todaySteps * strideM) / 1000).toFixed(2),
    calories: Math.round(todaySteps * 0.04),
    durationSec: todayDur,
    walkTrack: todayTrack
  });

  return daysMap;
}

// Joonistab päris salvestatud GPS-raja pisikaardi SVG sisse
function buildMiniMapSvgHtml(walkTrack) {
  const gridLines =
    '<line x1="0" y1="25" x2="140" y2="65" stroke="rgba(148,163,184,0.12)" stroke-width="1" />' +
    '<line x1="30" y1="0" x2="90" y2="90" stroke="rgba(148,163,184,0.12)" stroke-width="1" />' +
    '<line x1="0" y1="70" x2="140" y2="15" stroke="rgba(148,163,184,0.12)" stroke-width="1" />';

  if (!Array.isArray(walkTrack) || walkTrack.length < 2) {
    return (
      '<svg viewBox="0 0 140 90" style="width:100%;height:100%;">' +
      gridLines +
      '<polygon points="38,48 65,18 106,32 92,72 52,68" fill="rgba(148,163,184,0.06)" stroke="rgba(168,85,247,0.35)" stroke-dasharray="4 3" stroke-width="2" stroke-linejoin="round" />' +
      '<circle cx="38" cy="48" r="4" fill="#a855f7" />' +
      '</svg>' +
      '<span class="gw-map-badge muted">GPS-rada pole</span>'
    );
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (let i = 0; i < walkTrack.length; i++) {
    const pt = walkTrack[i];
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(midLatRad));

  const spanLat = Math.max(0.0004, maxLat - minLat);
  const spanLng = Math.max(0.0004, (maxLng - minLng) * cosLat);

  const padX = 16;
  const padY = 14;
  const availW = 140 - padX * 2;
  const availH = 90 - padY * 2;

  const scale = Math.min(availW / spanLng, availH / spanLat);
  const usedW = spanLng * scale;
  const usedH = spanLat * scale;
  const offsetX = (140 - usedW) / 2;
  const offsetY = (90 - usedH) / 2;

  const svgPts = [];
  for (let i = 0; i < walkTrack.length; i++) {
    const pt = walkTrack[i];
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const x = offsetX + (Number(pt[1]) - minLng) * cosLat * scale;
    const y = 90 - (offsetY + (Number(pt[0]) - minLat) * scale);
    svgPts.push(x.toFixed(1) + ',' + y.toFixed(1));
  }

  const firstXY = svgPts[0].split(',');
  const lastXY = svgPts[svgPts.length - 1].split(',');

  return (
    '<svg viewBox="0 0 140 90" style="width:100%;height:100%;">' +
    gridLines +
    '<polyline points="' +
    svgPts.join(' ') +
    '" fill="none" stroke="rgba(56,189,248,0.28)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />' +
    '<polyline points="' +
    svgPts.join(' ') +
    '" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />' +
    '<circle cx="' +
    firstXY[0] +
    '" cy="' +
    firstXY[1] +
    '" r="4.5" fill="#10b981" stroke="#fff" stroke-width="1.5" />' +
    '<circle cx="' +
    lastXY[0] +
    '" cy="' +
    lastXY[1] +
    '" r="4.5" fill="#ec4899" stroke="#fff" stroke-width="1.5" />' +
    '</svg>' +
    '<span class="gw-map-badge active">GPS-rada ✓</span>'
  );
}

function injectStatsCss() {
  if (document.getElementById('gw-sinu-areng-css')) return;
  const tabPng = makePngGradientUrl('#7c3aed', '#a855f7', '#ec4899', false);
  const barPng = makePngGradientUrl('#38bdf8', '#8b5cf6', '#ec4899', true);

  const st = document.createElement('style');
  st.id = 'gw-sinu-areng-css';
  const rules = [
    '.gw-areng-wrap { display:flex; flex-direction:column; gap:16px; padding-bottom:92px; color:#f8fafc; }',
    '.gw-areng-tabs { display:grid; grid-template-columns:repeat(4,1fr); background:rgba(15,20,42,0.9); border:1px solid rgba(168,85,247,0.32); border-radius:16px; padding:4px; gap:4px; }',
    '.gw-areng-tab { background:transparent; border:1px solid transparent; color:#94a3b8; font:600 0.84rem inherit; padding:9px 4px; border-radius:12px; cursor:pointer; transition:0.2s; }',
    '.gw-areng-tab.active { background-image:url("' + tabPng + '") !important; background-size:100% 100% !important; border-color:#f472b6 !important; color:#fff !important; box-shadow:0 0 14px rgba(236,72,153,0.45); }',
    '.gw-hero-grid { display:grid; grid-template-columns:1.1fr 1fr; gap:14px; align-items:center; background:linear-gradient(160deg,rgba(26,31,66,0.92),rgba(15,20,42,0.96)); border:1px solid rgba(168,85,247,0.3); border-radius:22px; padding:18px 14px; box-shadow:0 12px 30px rgba(0,0,0,0.35); }',
    '.gw-ring-box { position:relative; width:146px; height:146px; margin:0 auto; display:flex; align-items:center; justify-content:center; }',
    '.gw-ring-svg { width:146px; height:146px; transform:rotate(-90deg); }',
    '.gw-ring-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }',
    '.gw-ring-steps { font-size:1.55rem; font-weight:800; color:#fff; line-height:1.1; }',
    '.gw-ring-goal { font-size:0.72rem; color:#94a3b8; margin-top:2px; }',
    '.gw-ring-pct { font-size:0.86rem; font-weight:700; color:#f472b6; margin-top:4px; }',
    '.gw-side-metrics { display:flex; flex-direction:column; gap:11px; }',
    '.gw-smetric { display:flex; align-items:center; gap:10px; }',
    '.gw-sm-ico { width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }',
    '.gw-sm-ico svg { width:16px; height:16px; }',
    '.gw-sm-ico.pink { background:rgba(236,72,153,0.18); color:#f472b6; }',
    '.gw-sm-ico.cyan { background:rgba(56,189,248,0.18); color:#38bdf8; }',
    '.gw-sm-ico.blue { background:rgba(168,85,247,0.2); color:#c084fc; }',
    '.gw-sm-ico.orange { background:rgba(249,115,22,0.18); color:#fb923c; }',
    '.gw-sm-val { font-size:0.98rem; font-weight:800; color:#fff; }',
    '.gw-sm-lbl { font-size:0.75rem; color:#94a3b8; margin-left:3px; font-weight:500; }',
    '.gw-glass-card { background:linear-gradient(160deg,rgba(26,31,66,0.9),rgba(15,20,42,0.95)); border:1px solid rgba(168,85,247,0.28); border-radius:22px; padding:16px; box-shadow:0 10px 26px rgba(0,0,0,0.3); }',
    '.gw-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }',
    '.gw-card-title { font-size:0.98rem; font-weight:700; color:#fff; }',
    '.gw-card-link { background:none; border:none; padding:0; font:600 0.76rem inherit; color:#f472b6; display:inline-flex; align-items:center; gap:2px; cursor:pointer; }',
    '.gw-walk-grid { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; align-items:center; }',
    '.gw-mini-map { height:106px; border-radius:14px; background:#0b1022; border:1px solid rgba(168,85,247,0.35); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; cursor:pointer; }',
    '.gw-map-badge { position:absolute; bottom:6px; right:6px; font-size:0.62rem; font-weight:700; padding:2px 7px; border-radius:99px; pointer-events:none; }',
    '.gw-map-badge.active { background:rgba(16,185,129,0.22); border:1px solid rgba(16,185,129,0.55); color:#6ee7b7; }',
    '.gw-map-badge.muted { background:rgba(15,23,42,0.82); border:1px solid rgba(148,163,184,0.25); color:#94a3b8; }',
    '.gw-wk-list { display:flex; flex-direction:column; gap:7px; font-size:0.84rem; color:#e2e8f0; }',
    '.gw-wk-item { display:flex; align-items:center; gap:8px; font-weight:700; }',
    '.gw-wk-item svg { width:15px; height:15px; color:#f472b6; }',
    '.gw-wk-grid { display:grid; grid-template-columns:28px 1fr; gap:8px; align-items:end; height:112px; padding-top:8px; }',
    '.gw-yaxis { display:flex; flex-direction:column; justify-content:space-between; height:88px; font-size:0.66rem; color:#94a3b8; font-weight:600; padding-bottom:18px; }',
    '.gw-wbars { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; height:106px; align-items:end; }',
    '.gw-wcol { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:6px; cursor:pointer; }',
    '.gw-wbar { width:100%; max-width:14px; border-radius:99px; background-image:url("' + barPng + '") !important; background-size:100% 100% !important; min-height:10px; transition:height 0.25s ease; opacity:0.82; }',
    '.gw-wcol.active .gw-wbar { opacity:1; box-shadow:0 0 14px rgba(236,72,153,0.75); border:1px solid #f472b6; }',
    '.gw-wday { font-size:0.7rem; font-weight:600; color:#94a3b8; }',
    '.gw-wcol.active .gw-wday { color:#f472b6; font-weight:800; }',
    '.gw-motiv-card { display:flex; align-items:center; gap:14px; background:linear-gradient(135deg,rgba(46,29,89,0.9),rgba(20,24,52,0.96)); border:1px solid rgba(236,72,153,0.4); border-radius:22px; padding:14px 16px; }',
    '.gw-motiv-ico { width:46px; height:46px; border-radius:50%; background-image:url("' + tabPng + '") !important; background-size:100% 100% !important; display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 0 18px rgba(236,72,153,0.55); flex-shrink:0; }',
    '.gw-motiv-title { font-size:0.92rem; font-weight:800; color:#fff; margin-bottom:2px; }',
    '.gw-motiv-sub { font-size:0.76rem; color:#cbd5e1; line-height:1.35; }',
    '.gw-hist-head-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px; }',
    '.gw-hist-filters { display:flex; gap:6px; }',
    '.gw-hfilter-btn { background:rgba(15,20,42,0.9); border:1px solid rgba(168,85,247,0.3); color:#94a3b8; font:700 0.7rem inherit; padding:5px 10px; border-radius:99px; cursor:pointer; }',
    '.gw-hfilter-btn.active { background:rgba(236,72,153,0.22); border-color:#ec4899; color:#fff; }',
    '.gw-hrow { cursor:pointer; transition:0.2s; border-radius:16px !important; }',
    '.gw-hrow.selected-day { border-color:#ec4899 !important; background:rgba(124,58,237,0.24) !important; }',
    '.gw-gps-tag { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:6px; font-size:0.65rem; font-weight:700; background:rgba(56,189,248,0.18); color:#38bdf8; border:1px solid rgba(56,189,248,0.4); }',
    /* Detailvaate / Kellavõrdluse modaalaken */
    '.gw-detail-overlay { position:fixed; inset:0; z-index:3950; background:rgba(7,10,22,0.88); backdrop-filter:blur(14px); display:none; align-items:center; justify-content:center; padding:14px; }',
    '.gw-detail-overlay.open { display:flex; }',
    '.gw-detail-card { width:100%; max-width:410px; max-height:90dvh; overflow-y:auto; background:linear-gradient(165deg,rgba(26,31,68,0.98),rgba(12,16,34,0.99)); border:1px solid rgba(236,72,153,0.45); border-radius:26px; padding:18px; box-shadow:0 24px 60px rgba(0,0,0,0.8); display:flex; flex-direction:column; gap:14px; color:#f8fafc; }',
    '.gw-detail-map { width:100%; height:220px; border-radius:18px; border:1px solid rgba(56,189,248,0.4); overflow:hidden; background:#090d1a; position:relative; }',
    '.gw-detail-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }',
    '.gw-dbox { background:rgba(15,20,42,0.85); border:1px solid rgba(168,85,247,0.25); border-radius:14px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }',
    '.gw-dbox-lbl { font-size:0.68rem; color:#94a3b8; font-weight:600; }',
    '.gw-dbox-val { font-size:1.05rem; font-weight:800; color:#fff; }',
    '.gw-dbox-val.cyan { color:#38bdf8; }',
    '.gw-dbox-val.pink { color:#f472b6; }'
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

function openWalkDetailModal(dayRecord, todayKey) {
  let ov = document.getElementById('gwWalkDetailOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'gwWalkDetailOverlay';
    ov.className = 'gw-detail-overlay';
    document.body.appendChild(ov);
  }

  const track = Array.isArray(dayRecord.walkTrack) ? dayRecord.walkTrack : [];
  const steps = Number(dayRecord.steps || 0);
  const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
  const stepDistKm = +((steps * strideM) / 1000).toFixed(2);
  const gpsDistKm = calculateTrackDistanceKm(track);
  const primaryDistKm = gpsDistKm > 0 ? gpsDistKm : stepDistKm;

  const durationSec =
    dayRecord.durationSec && dayRecord.durationSec > 0
      ? Number(dayRecord.durationSec)
      : Math.round((steps / 100) * 60);

  const hours = durationSec / 3600;
  const avgSpeedKmh = hours > 0.01 && primaryDistKm > 0 ? (primaryDistKm / hours).toFixed(1) : '0.0';
  const paceMinPerKm =
    primaryDistKm > 0.05 && durationSec > 10
      ? (durationSec / 60 / primaryDistKm).toFixed(1)
      : '—';

  ov.innerHTML = [
    '<div class="gw-detail-card">',
      '<div class="gw-card-head" style="margin-bottom:0;">',
        '<div>',
          '<div class="gw-card-title" style="font-size:1.08rem;">' + prettyDay(dayRecord.date, todayKey) + '</div>',
          '<div style="font-size:0.72rem;color:#94a3b8;">Täpne ülevaade & nutikella võrdlus</div>',
        '</div>',
        '<button type="button" class="gw-calc-close" id="gwCloseDetailModalBtn"><i data-lucide="x"></i></button>',
      '</div>',

      '<div id="gwStatsDetailMap" class="gw-detail-map"></div>',

      '<div class="gw-detail-grid">',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">Sammud kokku</span>',
          '<span class="gw-dbox-val pink">' + steps.toLocaleString('et-EE') + '</span>',
        '</div>',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">Kõnni kestus</span>',
          '<span class="gw-dbox-val">' + formatSecToClock(dayRecord.durationSec, steps) + '</span>',
        '</div>',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">Distants (sammudest)</span>',
          '<span class="gw-dbox-val">' + stepDistKm.toFixed(2) + ' km</span>',
        '</div>',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">GPS-raja pikkus (kellaga võrdlus)</span>',
          '<span class="gw-dbox-val cyan">' + (gpsDistKm > 0 ? gpsDistKm.toFixed(2) + ' km' : 'Pole salvestatud') + '</span>',
        '</div>',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">Keskmine kiirus / Tempo</span>',
          '<span class="gw-dbox-val">' + avgSpeedKmh + ' km/h (' + paceMinPerKm + ' min/km)</span>',
        '</div>',
        '<div class="gw-dbox">',
          '<span class="gw-dbox-lbl">Kalorid / GPS-punkte</span>',
          '<span class="gw-dbox-val">' + (dayRecord.calories || Math.round(steps * 0.04)) + ' kcal • ' + track.length + ' p</span>',
        '</div>',
      '</div>',

      '<button type="button" class="gw-calc-apply" id="gwDetailCloseBottomBtn">Sulge ülevaade</button>',
    '</div>'
  ].join('');

  ov.classList.add('open');
  if (window.lucide) window.lucide.createIcons();

  // Initsialiseerime interaktiivse kaardi modaalakna sees
  setTimeout(function () {
    const mapBox = document.getElementById('gwStatsDetailMap');
    if (!mapBox || !window.L) return;

    if (detailLeafletMap) {
      try {
        detailLeafletMap.remove();
      } catch (e) {}
      detailLeafletMap = null;
    }

    let centerCoords = [58.3859, 24.4971];
    try {
      const savedGps = JSON.parse(localStorage.getItem('gowalk_last_precise_gps') || 'null');
      if (savedGps && savedGps.lat && savedGps.lng) {
        centerCoords = [savedGps.lat, savedGps.lng];
      }
    } catch (e) {}

    if (track.length > 0 && Array.isArray(track[0])) {
      centerCoords = [Number(track[0][0]), Number(track[0][1])];
    }

    detailLeafletMap = L.map('gwStatsDetailMap', {
      zoomControl: false,
      attributionControl: false
    }).setView(centerCoords, 15);

    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      className: 'map-tiles-dark'
    }).addTo(detailLeafletMap);

    if (track.length >= 2) {
      const latlngs = track.map(function (pt) {
        return L.latLng(Number(pt[0]), Number(pt[1]));
      });

      L.polyline(latlngs, {
        color: '#38bdf8',
        weight: 5,
        opacity: 0.95
      }).addTo(detailLeafletMap);

      // Alguspunkt (Roheline) ja Lõpp-punkt (Roosa)
      L.circleMarker(latlngs[0], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 1
      }).addTo(detailLeafletMap);

      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ec4899',
        fillOpacity: 1
      }).addTo(detailLeafletMap);

      detailLeafletMap.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
    }
  }, 60);

  ov.onclick = function (e) {
    if (
      e.target === ov ||
      e.target.closest('#gwCloseDetailModalBtn') ||
      e.target.closest('#gwDetailCloseBottomBtn')
    ) {
      if (detailLeafletMap) {
        try {
          detailLeafletMap.remove();
        } catch (err) {}
        detailLeafletMap = null;
      }
      ov.classList.remove('open');
    }
  };
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
  const todayKey = (state.today && state.today.date) || new Date().toISOString().slice(0, 10);

  if (!selectedDateKey || !daysMap.has(selectedDateKey)) {
    selectedDateKey = todayKey;
  }

  const strideM = ((state.settings && state.settings.strideCm) || 76) / 100;
  const dailyGoal = (state.settings && state.settings.stepGoal) || 10000;

  const tp = todayKey.split('-');
  const todayObj = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]));
  const wds = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];

  const selRec = daysMap.get(selectedDateKey) || {
    date: selectedDateKey,
    steps: 0,
    distanceKm: 0,
    calories: 0,
    durationSec: 0,
    walkTrack: []
  };

  let heroSteps = selRec.steps || 0;
  let heroGoal = dailyGoal;
  let heroDurSec = selRec.durationSec || 0;

  if (activePeriod === 'week') {
    heroSteps = 0;
    heroDurSec = 0;
    heroGoal = dailyGoal * 7;
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const ky =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      const r = daysMap.get(ky);
      if (r) {
        heroSteps += r.steps || 0;
        heroDurSec += r.durationSec || 0;
      }
    }
  } else if (activePeriod === 'month') {
    heroSteps = 0;
    heroDurSec = 0;
    heroGoal = dailyGoal * 30;
    for (let i = 0; i < 30; i++) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const ky =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      const r = daysMap.get(ky);
      if (r) {
        heroSteps += r.steps || 0;
        heroDurSec += r.durationSec || 0;
      }
    }
  } else if (activePeriod === 'year') {
    heroSteps = 0;
    heroDurSec = 0;
    heroGoal = dailyGoal * 365;
    const allV = Array.from(daysMap.values());
    for (let i = 0; i < allV.length; i++) {
      if (allV[i].date.indexOf(tp[0]) === 0) {
        heroSteps += allV[i].steps || 0;
        heroDurSec += allV[i].durationSec || 0;
      }
    }
  }

  const heroKm = ((heroSteps * strideM) / 1000).toFixed(2);
  const heroCal = Math.round(heroSteps * 0.04);
  const heroMin =
    heroDurSec > 0 ? Math.max(1, Math.round(heroDurSec / 60)) : Math.max(0, Math.round(heroSteps / 100));
  const pct = Math.min(100, Math.round((heroSteps / Math.max(1, heroGoal)) * 100));

  const ringCircumference = 352;
  const ringOffset = Math.round(ringCircumference - (pct / 100) * ringCircumference);

  const daySteps = selRec.steps || 0;
  const dayTrack = Array.isArray(selRec.walkTrack) ? selRec.walkTrack : [];
  const dayGpsKm = calculateTrackDistanceKm(dayTrack);
  const dayKm = dayGpsKm > 0 ? dayGpsKm.toFixed(2) : ((daySteps * strideM) / 1000).toFixed(2);
  const dayCal = Math.round(daySteps * 0.04);
  const dayTimeFormatted = formatSecToClock(selRec.durationSec, daySteps);

  let maxWeekSteps = dailyGoal;
  const weekItems = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() - i);
    const ky =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
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
      '<div class="' +
      cName +
      '" data-wdate="' +
      it.key +
      '">' +
      '<div class="gw-wbar" style="height:' +
      hPct +
      '%;"></div>' +
      '<span class="gw-wday">' +
      it.day +
      '</span>' +
      '</div>';
  }

  const sortedDays = Array.from(daysMap.values()).sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });

  const filteredDays =
    historyFilterMode === 'gps'
      ? sortedDays.filter(function (r) {
          return Array.isArray(r.walkTrack) && r.walkTrack.length >= 2;
        })
      : sortedDays;

  let histHtml = '';
  if (filteredDays.length === 0) {
    histHtml =
      '<div class="history-item" style="justify-content:center;color:#94a3b8;font-size:0.82rem;">Salvestatud GPS-rajaga kõnde veel pole. Vajuta avalehel "Alusta kõndimist"!</div>';
  } else {
    for (let i = 0; i < filteredDays.length; i++) {
      const r = filteredDays[i];
      const hasGps = Array.isArray(r.walkTrack) && r.walkTrack.length >= 2;
      const gpsBadge = hasGps ? '<span class="gw-gps-tag">📍 GPS-rada</span>' : '';
      const hCls =
        r.date === selectedDateKey ? 'history-item gw-hrow selected-day' : 'history-item gw-hrow';
      histHtml +=
        '<div class="' +
        hCls +
        '" data-hdate="' +
        r.date +
        '">' +
        '<div class="history-item-left">' +
        '<span class="history-date">' +
        prettyDay(r.date, todayKey) +
        gpsBadge +
        '</span>' +
        '<span class="history-meta">' +
        Number(r.distanceKm || 0).toFixed(2) +
        ' km • ' +
        (r.calories || 0) +
        ' kcal • ' +
        formatSecToClock(r.durationSec, r.steps) +
        '</span>' +
        '</div>' +
        '<span class="history-steps-badge">' +
        Number(r.steps || 0).toLocaleString('et-EE') +
        ' sammu</span>' +
        '</div>';
    }
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
            '<circle cx="65" cy="65" r="56" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="10" />',
            '<circle cx="65" cy="65" r="56" fill="none" stroke="#a855f7" stroke-width="11" stroke-linecap="round" stroke-dasharray="352" stroke-dashoffset="' + ringOffset + '" style="filter:drop-shadow(0 0 8px rgba(236,72,153,0.65));" />',
            '<circle cx="65" cy="65" r="56" fill="none" stroke="#ec4899" stroke-width="6" stroke-linecap="round" stroke-dasharray="352" stroke-dashoffset="' + Math.min(352, ringOffset + 45) + '" />',
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

      '<div class="gw-glass-card" id="gwSelectedDayCard">',
        '<div class="gw-card-head">',
          '<span class="gw-card-title">' + prettyDay(selectedDateKey, todayKey) + '</span>',
          '<button type="button" class="gw-card-link" id="gwOpenWalkDetailsBtn">Vaata detaile <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></button>',
        '</div>',
        '<div class="gw-walk-grid">',
          '<div class="gw-mini-map" id="gwMiniMapTrigger" title="Ava suurem kaardi ülevaade">',
            buildMiniMapSvgHtml(dayTrack),
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
          '<button type="button" class="gw-card-link" id="gwScrollToHistoryBtn">Vaata kõiki <i data-lucide="chevron-right" style="width:14px;height:18px;"></i></button>',
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
          '<div class="gw-motiv-sub">Vali ajaloost päev ja vajuta kaardile, et võrrelda GPS-rada kellaga.</div>',
        '</div>',
      '</div>',

      '<div class="gw-hist-head-row" id="gwHistorySectionAnchor">',
        '<h4 class="section-subtitle" style="margin:0;">Salvestatud päevad & rajad</h4>',
        '<div class="gw-hist-filters">',
          '<button type="button" class="gw-hfilter-btn ' + (historyFilterMode === 'all' ? 'active' : '') + '" data-hfilter="all">Kõik (' + sortedDays.length + ')</button>',
          '<button type="button" class="gw-hfilter-btn ' + (historyFilterMode === 'gps' ? 'active' : '') + '" data-hfilter="gps">📍 GPS-rajad</button>',
        '</div>',
      '</div>',
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

    if (e.target.closest('#gwOpenWalkDetailsBtn') || e.target.closest('#gwMiniMapTrigger')) {
      openWalkDetailModal(selRec, todayKey);
      return;
    }

    if (e.target.closest('#gwScrollToHistoryBtn')) {
      const anchor = document.getElementById('gwHistorySectionAnchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const filterBtn = e.target.closest('.gw-hfilter-btn');
    if (filterBtn) {
      historyFilterMode = filterBtn.getAttribute('data-hfilter') || 'all';
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
      const clickedDate = hrow.getAttribute('data-hdate');
      if (selectedDateKey === clickedDate) {
        const rec = daysMap.get(clickedDate);
        if (rec) openWalkDetailModal(rec, todayKey);
      } else {
        selectedDateKey = clickedDate;
        activePeriod = 'day';
        renderStatsAndHistory();
        const dayCard = document.getElementById('gwSelectedDayCard');
        if (dayCard) dayCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };
}

export function initStatsModule() {
  cleanAndMergeHistoryRecords();
}
