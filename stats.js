/* ==========================================================================
   GOWALK PRO — STATS.JS (MODULAR ACTIVITY DASHBOARD & HISTORY CLEANER)
   ========================================================================== */

import { state, saveState } from './state.js';

let activeStatsPeriod = 'day'; // 'day' | 'week' | 'month' | 'year'
let selectedStatsDateKey = '';
let activeChartBarIndex = null;

// 1. Kuupäevade normaliseerimine kujule YYYY-MM-DD
export function normalizeDateKey(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') {
    return state?.today?.date || new Date().toISOString().slice(0, 10);
  }
  const clean = rawStr.trim();

  // ISO formaat: YYYY-MM-DD
  const isoMatch = clean.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Eesti formaat: DD.MM.YYYY (nt "21.10.2026, 07:19:29")
  const eeMatch = clean.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (eeMatch) {
    const dd = String(eeMatch[1]).padStart(2, '0');
    const mm = String(eeMatch[2]).padStart(2, '0');
    const yyyy = eeMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return state?.today?.date || new Date().toISOString().slice(0, 10);
}

// 2. Ajaloo puhastamine ja sama kuupäeva kirjete ühendamine
export function cleanAndMergeHistoryRecords() {
  const allDaysMap = new Map();

  try {
    const strideMeters = ((state?.settings?.strideCm || 76) / 100);
    const todayKey = state?.today?.date || new Date().toISOString().slice(0, 10);
    const byDate = new Map();

    if (Array.isArray(state.history)) {
      state.history.forEach(item => {
        if (!item) return;
        const key = normalizeDateKey(item.date);
        const steps = Math.max(0, Number(item.steps) || 0);
        const existing = byDate.get(key);

        if (!existing || steps > existing.steps) {
          byDate.set(key, {
            date: key,
            steps,
            distanceKm: +((steps * strideMeters) / 1000).toFixed(2),
            calories: Math.round(steps * 0.04)
          });
        }
      });
    }

    // Sünkrooni tänane päev, kui ajaloos oli suurem number
    const todayFromHist = byDate.get(todayKey);
    if (todayFromHist && todayFromHist.steps > (state.today.steps || 0)) {
      state.today.steps = todayFromHist.steps;
    }

    // Eemalda tänane päev varasema ajaloo massiivist, et vältida topeltridu
    byDate.delete(todayKey);
    const cleanedPast = Array.from(byDate.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    const needsSave =
      !Array.isArray(state.history) ||
      state.history.length !== cleanedPast.length ||
      state.history.some((r, i) => r.date !== cleanedPast[i]?.date);

    state.history = cleanedPast;
    if (needsSave) {
      saveState();
    }

    cleanedPast.forEach(rec => allDaysMap.set(rec.date, rec));

    const todaySteps = Math.max(0, Number(state.today.steps) || 0);
    allDaysMap.set(todayKey, {
      date: todayKey,
      steps: todaySteps,
      distanceKm: +((todaySteps * strideMeters) / 1000).toFixed(2),
      calories: Math.round(todaySteps * 0.04),
      durationSec: state.today.durationSec || 0
    });
  } catch (err) {
    console.warn('Ajaloo korrastamise info:', err);
  }

  return allDaysMap;
}

// 3. Activity armatuurlaua CSS stiilid
function ensureStatsStyles() {
  if (document.getElementById('gw-stats-module-styles')) return;
  const style = document.createElement('style');
  style.id = 'gw-stats-module-styles';
  style.textContent = `
    .gw-activity-dashboard {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 20px;
    }
    .gw-period-tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: rgba(14, 10, 29, 0.78);
      border: 1px solid rgba(139, 92, 246, 0.22);
      border-radius: 999px;
      padding: 4px;
      gap: 4px;
    }
    .gw-period-tab {
      background: transparent;
      border: 1px solid transparent;
      color: rgba(203, 213, 225, 0.72);
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 8px 4px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .gw-period-tab.active {
      background: rgba(139, 92, 246, 0.18);
      border-color: rgba(168, 85, 247, 0.9);
      color: #ffffff;
      box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
    }
    .gw-date-strip {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 7px;
    }
    .gw-date-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 10px 2px;
      border-radius: 999px;
      background: rgba(20, 15, 38, 0.76);
      border: 1px solid rgba(139, 92, 246, 0.18);
      color: rgba(226, 232, 240, 0.8);
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
    }
    .gw-pill-num {
      font-size: 0.9rem;
      font-weight: 700;
      line-height: 1.1;
    }
    .gw-pill-day {
      font-size: 0.68rem;
      font-weight: 600;
      opacity: 0.75;
    }
    .gw-date-pill.has-steps:not(.active) {
      border-color: rgba(168, 85, 247, 0.45);
    }
    .gw-date-pill.active {
      background: linear-gradient(180deg, #ec4899 0%, #8b5cf6 52%, #06b6d4 100%);
      border-color: rgba(255, 255, 255, 0.5);
      color: #ffffff;
      box-shadow: 0 6px 18px rgba(168, 85, 247, 0.5), 0 0 12px rgba(6, 182, 212, 0.4);
      transform: translateY(-2px);
    }
    .gw-date-pill.future {
      opacity: 0.35;
      pointer-events: none;
    }
    .gw-summary-card {
      background: linear-gradient(160deg, rgba(27, 20, 52, 0.9) 0%, rgba(14, 10, 28, 0.94) 100%);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 22px;
      padding: 18px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .gw-metric-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .gw-metric-icon {
      width: 36px;
      height: 36px;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .gw-metric-icon svg {
      width: 18px;
      height: 18px;
    }
    .gw-metric-icon.steps {
      background: rgba(6, 182, 212, 0.16);
      color: #22d3ee;
    }
    .gw-metric-icon.dist {
      background: rgba(244, 63, 94, 0.16);
      color: #fb7185;
    }
    .gw-metric-icon.cal {
      background: rgba(249, 115, 22, 0.16);
      color: #fb923c;
    }
    .gw-metric-val {
      font-size: 1.25rem;
      font-weight: 800;
      color: #ffffff;
    }
    .gw-metric-goal {
      font-size: 0.82rem;
      color: rgba(148, 163, 184, 0.78);
      margin-left: 4px;
    }
    .gw-speed-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(139, 92, 246, 0.15);
    }
    .gw-speed-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(148, 163, 184, 0.85);
      white-space: nowrap;
    }
    .gw-speed-wave {
      flex: 1;
      height: 24px;
    }
    .gw-speed-val {
      font-size: 0.84rem;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
    }
    .gw-chart-card {
      background: linear-gradient(160deg, rgba(24, 18, 46, 0.86) 0%, rgba(13, 10, 26, 0.92) 100%);
      border: 1px solid rgba(139, 92, 246, 0.22);
      border-radius: 22px;
      padding: 16px;
    }
    .gw-chart-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .gw-chart-title {
      font-size: 1rem;
      font-weight: 700;
      color: #ffffff;
    }
    .gw-chart-sub {
      font-size: 0.76rem;
      font-weight: 600;
      color: #c084fc;
    }
    .gw-chart-stage {
      position: relative;
      height: 156px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding-top: 46px;
    }
    .gw-chart-tooltip {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      background: rgba(18, 13, 38, 0.95);
      border: 1px solid rgba(168, 85, 247, 0.55);
      border-radius: 12px;
      padding: 6px 10px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
      pointer-events: none;
      z-index: 4;
      white-space: nowrap;
      transition: left 0.2s ease;
    }
    .gw-tooltip-time {
      font-size: 0.66rem;
      color: rgba(148, 163, 184, 0.88);
      font-weight: 600;
      margin-bottom: 2px;
    }
    .gw-tooltip-metrics {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.72rem;
      font-weight: 700;
      color: #ffffff;
    }
    .gw-bars-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      height: 100px;
      gap: 5px;
    }
    .gw-bar-col {
      flex: 1;
      height: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      cursor: pointer;
      position: relative;
    }
    .gw-bar-fill {
      width: 100%;
      max-width: 9px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.22);
      min-height: 8px;
      transition: height 0.25s ease, background 0.2s ease;
    }
    .gw-bar-col.active .gw-bar-fill {
      background: linear-gradient(180deg, #ec4899 0%, #8b5cf6 52%, #22d3ee 100%);
      box-shadow: 0 0 12px rgba(236, 72, 153, 0.6), 0 0 14px rgba(34, 211, 238, 0.45);
    }
    .gw-chart-axis {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 0.68rem;
      color: rgba(148, 163, 184, 0.7);
      font-weight: 600;
    }
    .gw-lifetime-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .gw-lifetime-box {
      background: rgba(20, 15, 38, 0.75);
      border: 1px solid rgba(139, 92, 246, 0.18);
      border-radius: 16px;
      padding: 12px 14px;
    }
    .gw-lifetime-label {
      font-size: 0.72rem;
      color: rgba(148, 163, 184, 0.8);
      display: block;
      margin-bottom: 4px;
    }
    .gw-lifetime-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #ffffff;
    }
    .gw-history-row {
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .gw-history-row.selected-day {
      border-color: rgba(168, 85, 247, 0.7) !important;
      background: rgba(139, 92, 246, 0.14) !important;
    }
  `;
  document.head.appendChild(style);
}

function formatEstonianDayLabel(dateKey, todayKey) {
  const parts = dateKey.split('-').map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  const weekdays = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
  const months = [
    'jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni',
    'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'
  ];
  const wd = weekdays[d.getDay()];
  const mName = months[(parts[1] || 1) - 1];
  if (dateKey === todayKey) {
    return `Täna (${wd}, ${parts[2]}. ${mName})`;
  }
  return `${wd}, ${parts[2]}. ${mName} ${parts[0]}`;
}

// 4. Peamine renderdamisfunktsioon
export function renderStatsAndHistory() {
  try {
    ensureStatsStyles();

    const statsModal = document.getElementById('statsModal');
    if (!statsModal) return;

    // Leia sisukonteiner nii, et modaali päis ja sulgemisnupp (X) jäävad alati alles
    const historyListOrig = document.getElementById('historyList');
    let bodyContainer =
      statsModal.querySelector('.subview-body') ||
      statsModal.querySelector('.modal-body') ||
      (historyListOrig ? historyListOrig.parentElement : null);

    if (!bodyContainer) return;

    const allDaysMap = cleanAndMergeHistoryRecords();
    const todayKey = state?.today?.date || new Date().toISOString().slice(0, 10);

    if (!selectedStatsDateKey || !allDaysMap.has(selectedStatsDateKey)) {
      selectedStatsDateKey = todayKey;
    }

    const strideMeters = (state?.settings?.strideCm || 76) / 100;
    const dailyGoal = state?.settings?.stepGoal || 10000;

    // Kuupäevade kapslid (5 eelmist päeva + täna + homme)
    const [tY, tM, tD] = todayKey.split('-').map(Number);
    const todayObj = new Date(tY, tM - 1, tD);
    const wdShort = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
    const datePills = [];

    for (let offset = -5; offset <= 1; offset++) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() + offset);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rec = allDaysMap.get(key);
      datePills.push({
        key,
        dayNum: String(d.getDate()).padStart(2, '0'),
        dayName: wdShort[d.getDay()],
        isFuture: offset > 0,
        hasSteps: (rec?.steps || 0) > 0,
        isActive: key === selectedStatsDateKey
      });
    }

    // Arvuta valitud perioodi andmed ja tulpdiagramm
    let periodSteps = 0;
    let periodGoalSteps = dailyGoal;
    let periodSubLabel = '';
    let chartBars = [];
    let axisLabels = ['00:00', '12:00', '23:59'];

    const selectedDayRec = allDaysMap.get(selectedStatsDateKey) || {
      date: selectedStatsDateKey,
      steps: 0,
      distanceKm: 0,
      calories: 0
    };

    if (activeStatsPeriod === 'day') {
      periodSteps = selectedDayRec.steps || 0;
      periodGoalSteps = dailyGoal;
      periodSubLabel = formatEstonianDayLabel(selectedStatsDateKey, todayKey);

      const weights = [0, 0, 0, 0, 0.05, 0.1, 0.14, 0.1, 0.08, 0.12, 0.18, 0.11, 0.08, 0.04, 0, 0, 0, 0];
      chartBars = weights.map((w, idx) => {
        const h1 = Math.floor((idx * 24) / 18);
        const h2 = Math.floor(((idx + 1) * 24) / 18);
        const st = periodSteps > 0 ? Math.round(periodSteps * w) : 0;
        return {
          label: `${String(h1).padStart(2, '0')}:00 - ${String(h2).padStart(2, '0')}:00`,
          steps: st,
          distanceKm: +((st * strideMeters) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        };
      });
      axisLabels = ['00:00', '12:00', '23:59'];
    } else if (activeStatsPeriod === 'week') {
      periodGoalSteps = dailyGoal * 7;
      periodSubLabel = 'Viimased 7 päeva';
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayObj);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const st = allDaysMap.get(key)?.steps || 0;
        periodSteps += st;
        chartBars.push({
          label: `${wdShort[d.getDay()]} (${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')})`,
          steps: st,
          distanceKm: +((st * strideMeters) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        });
      }
      axisLabels = [chartBars[0].label.split(' ')[0], 'Nädala keskpaik', 'Täna'];
    } else if (activeStatsPeriod === 'month') {
      periodGoalSteps = dailyGoal * 30;
      periodSubLabel = 'Viimased 30 päeva';
      for (let i = 14; i >= 0; i--) {
        const d1 = new Date(todayObj);
        d1.setDate(d1.getDate() - i * 2);
        const d2 = new Date(todayObj);
        d2.setDate(d2.getDate() - (i * 2 + 1));
        const k1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
        const k2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
        const st = (allDaysMap.get(k1)?.steps || 0) + (allDaysMap.get(k2)?.steps || 0);
        periodSteps += st;
        chartBars.push({
          label: `${String(d1.getDate()).padStart(2, '0')}.${String(d1.getMonth() + 1).padStart(2, '0')}`,
          steps: st,
          distanceKm: +((st * strideMeters) / 1000).toFixed(2),
          calories: Math.round(st * 0.04)
        });
      }
      axisLabels = ['30 p tagasi', '15 p tagasi', 'Täna'];
    } else {
      periodGoalSteps = dailyGoal * 365;
      periodSubLabel = `Aasta ${tY}`;
      const mNames = ['Jaan', 'Veebr', 'Märts', 'Apr', 'Mai', 'Juuni', 'Juuli', 'Aug', 'Sept', 'Okt', 'Nov', 'Dets'];
      const mTotals = new Array(12).fill(0);
      allDaysMap.forEach(rec => {
        const [yStr, mStr] = rec.date.split('-');
        if (Number(yStr) === tY) {
          mTotals[(Number(mStr) || 1) - 1] += rec.steps || 0;
        }
      });
      periodSteps = mTotals.reduce((a, b) => a + b, 0);
      chartBars = mTotals.map((st, idx) => ({
        label: `${mNames[idx]} ${tY}`,
        steps: st,
        distanceKm: +((st * strideMeters) / 1000).toFixed(2),
        calories: Math.round(st * 0.04)
      }));
      axisLabels = ['Jaan', 'Juuni', 'Dets'];
    }

    const periodDistKm = +((periodSteps * strideMeters) / 1000).toFixed(2);
    const periodGoalKm = +((periodGoalSteps * strideMeters) / 1000).toFixed(2);
    const periodCal = Math.round(periodSteps * 0.04);
    const periodGoalCal = Math.round(periodGoalSteps * 0.04);

    const avgSpeed = periodSteps > 0 ? 4.8 : 0.0;

    const maxBarSteps = Math.max(1, ...chartBars.map(b => b.steps));
    if (
      activeChartBarIndex === null ||
      activeChartBarIndex < 0 ||
      activeChartBarIndex >= chartBars.length
    ) {
      let peak = chartBars.findIndex(b => b.steps === maxBarSteps && b.steps > 0);
      if (peak === -1) peak = Math.floor(chartBars.length / 2);
      activeChartBarIndex = peak;
    }

    const activeBar = chartBars[activeChartBarIndex] || chartBars[0];
    const tooltipLeftPct = Math.min(
      82,
      Math.max(18, Math.round(((activeChartBarIndex + 0.5) / chartBars.length) * 100))
    );

    const allSortedDays = Array.from(allDaysMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const totalStepsAll = allSortedDays.reduce((s, r) => s + (r.steps || 0), 0);
    const totalKmAll = ((totalStepsAll * strideMeters) / 1000).toFixed(1);
    const activeDaysCount = Math.max(1, allSortedDays.filter(r => (r.steps || 0) > 0).length);

    bodyContainer.innerHTML = `
      <div class="gw-activity-dashboard">
        <!-- 1. Perioodi vahetaja -->
        <div class="gw-period-tabs">
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'day' ? 'active' : ''}" data-period="day">Päev</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'week' ? 'active' : ''}" data-period="week">Nädal</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'month' ? 'active' : ''}" data-period="month">Kuu</button>
          <button type="button" class="gw-period-tab ${activeStatsPeriod === 'year' ? 'active' : ''}" data-period="year">Aasta</button>
        </div>

        <!-- 2. Kuupäevade kapslid -->
        <div class="gw-date-strip">
          ${datePills
            .map(
              p => `
            <div class="gw-date-pill ${p.isActive ? 'active' : ''} ${p.isFuture ? 'future' : ''} ${p.hasSteps ? 'has-steps' : ''}" data-date="${p.key}">
              <span class="gw-pill-num">${p.dayNum}</span>
              <span class="gw-pill-day">${p.dayName}</span>
            </div>
          `
            )
            .join('')}
        </div>

        <!-- 3. Koondkaart (Activity Summary Card) -->
        <div class="gw-summary-card">
          <div class="gw-metric-row">
            <div class="gw-metric-icon steps"><i data-lucide="footprints"></i></div>
            <div>
              <span class="gw-metric-val">${periodSteps.toLocaleString('et-EE')}</span>
              <span class="gw-metric-goal">/ ${periodGoalSteps.toLocaleString('et-EE')} sammu</span>
            </div>
          </div>

          <div class="gw-metric-row">
            <div class="gw-metric-icon dist"><i data-lucide="map-pin"></i></div>
            <div>
              <span class="gw-metric-val">${periodDistKm.toFixed(2)}</span>
              <span class="gw-metric-goal">/ ${periodGoalKm.toFixed(2)} km</span>
            </div>
          </div>

          <div class="gw-metric-row">
            <div class="gw-metric-icon cal"><i data-lucide="flame"></i></div>
            <div>
              <span class="gw-metric-val">${periodCal.toLocaleString('et-EE')}</span>
              <span class="gw-metric-goal">/ ${periodGoalCal.toLocaleString('et-EE')} kcal</span>
            </div>
          </div>

          <div class="gw-speed-row">
            <span class="gw-speed-label">Keskm. kiirus</span>
            <svg class="gw-speed-wave" viewBox="0 0 160 24" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gwWaveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ec4899" stop-opacity="0.25" />
                  <stop offset="50%" stop-color="#a855f7" stop-opacity="0.95" />
                  <stop offset="100%" stop-color="#22d3ee" stop-opacity="1" />
                </linearGradient>
              </defs>
              <path d="M2,18 C25,17 38,12 58,15 C80,18 96,4 118,11 C134,16 146,6 158,9" fill="none" stroke="url(#gwWaveGrad)" stroke-width="2.5" stroke-linecap="round" />
            </svg>
            <span class="gw-speed-val">${avgSpeed.toFixed(1)} km/h</span>
          </div>
        </div>

        <!-- 4. Tulpdiagramm ("Statistika") -->
        <div class="gw-chart-card">
          <div class="gw-chart-head">
            <span class="gw-chart-title">Statistika</span>
            <span class="gw-chart-sub">${periodSubLabel}</span>
          </div>

          <div class="gw-chart-stage">
            <div class="gw-chart-tooltip" style="left: ${tooltipLeftPct}%;">
              <div class="gw-tooltip-time">${activeBar.label}</div>
              <div class="gw-tooltip-metrics">
                <span><b style="color:#22d3ee;">●</b> ${activeBar.steps.toLocaleString('et-EE')}</span>
                <span><b style="color:#fb7185;">●</b> ${activeBar.distanceKm} km</span>
                <span><b style="color:#fb923c;">●</b> ${activeBar.calories} kcal</span>
              </div>
            </div>

            <div class="gw-bars-row">
              ${chartBars
                .map((bar, idx) => {
                  const hPct =
                    bar.steps > 0
                      ? Math.max(16, Math.round((bar.steps / maxBarSteps) * 100))
                      : 10;
                  return `
                  <div class="gw-bar-col ${idx === activeChartBarIndex ? 'active' : ''}" data-bar-idx="${idx}">
                    <div class="gw-bar-fill" style="height: ${hPct}%;"></div>
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>

          <div class="gw-chart-axis">
            <span>${axisLabels[0]}</span>
            <span>${axisLabels[1]}</span>
            <span>${axisLabels[2]}</span>
          </div>
        </div>

        <!-- 5. Üldsaavutused ja puhastatud ajalugu -->
        <div class="gw-lifetime-grid">
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Kokku sammud</span>
            <span class="gw-lifetime-val" id="statTotalSteps">${totalStepsAll.toLocaleString('et-EE')}</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Läbitud distants</span>
            <span class="gw-lifetime-val" id="statTotalKm">${totalKmAll} km</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Aktiivne seeria (Streak)</span>
            <span class="gw-lifetime-val" id="statStreak">${activeDaysCount} päeva</span>
          </div>
          <div class="gw-lifetime-box">
            <span class="gw-lifetime-label">Salvestatud päevi</span>
            <span class="gw-lifetime-val" id="statTotalWalks">${activeDaysCount}</span>
          </div>
        </div>

        <h4 class="section-subtitle" style="margin-top: 4px;">Salvestatud päevade ajalugu</h4>
        <div id="historyList" class="history-list">
          ${allSortedDays
            .map(
              rec => `
            <div class="history-item gw-history-row ${rec.date === selectedStatsDateKey ? 'selected-day' : ''}" data-history-date="${rec.date}">
              <div class="history-item-left">
                <span class="history-date">${formatEstonianDayLabel(rec.date, todayKey)}</span>
                <span class="history-meta">${Number(rec.distanceKm \vert{}\vert{} 0).toFixed(2)} km • ${rec.calories || 0} kcal</span>
              </div>
              <span class="history-steps-badge">${Number(rec.steps || 0).toLocaleString('et-EE')} sammu</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    bodyContainer.querySelectorAll('.gw-period-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeStatsPeriod = btn.getAttribute('data-period') || 'day';
        activeChartBarIndex = null;
        renderStatsAndHistory();
      });
    });

    bodyContainer.querySelectorAll('.gw-date-pill:not(.future)').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedStatsDateKey = pill.getAttribute('data-date');
        activeStatsPeriod = 'day';
        activeChartBarIndex = null;
        renderStatsAndHistory();
      });
    });

    bodyContainer.querySelectorAll('.gw-bar-col').forEach(col => {
      col.addEventListener('click', () => {
        activeChartBarIndex = parseInt(col.getAttribute('data-bar-idx'), 10) || 0;
        renderStatsAndHistory();
      });
    });

    bodyContainer.querySelectorAll('.gw-history-row').forEach(row => {
      row.addEventListener('click', () => {
        const dKey = row.getAttribute('data-history-date');
        if (dKey) {
          selectedStatsDateKey = dKey;
          activeStatsPeriod = 'day';
          activeChartBarIndex = null;
          renderStatsAndHistory();
        }
      });
    });
  } catch (err) {
    console.error('Statistika vaate viga:', err);
  }
}

export function initStatsModule() {
  cleanAndMergeHistoryRecords();
}
