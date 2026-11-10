import { state, saveState } from '../state.js';
import { map, restoreWalkedTrack } from '../map.js';

// ==========================================================================
// KELLA & TELEFONI SAMMUDE JA GPX/TCX/CSV IMPORDIKESKUS (#syncModal)
// ==========================================================================

function calculateCoordsArrayDistanceMeters(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  const R = 6371000;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const p1 = coords[i - 1];
    const p2 = coords[i];
    const lat1 = (p1[0] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
    const dLon = ((p2[1] - p1[1]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const seg = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (!Number.isNaN(seg) && seg < 2500) total += seg;
  }
  return total;
}

export function setupWatchAndPhoneSyncModal(updateHudFn, closeAllModalsAndGoHomeFn) {
  let syncModal = document.getElementById('syncModal');
  if (!syncModal) {
    syncModal = document.createElement('section');
    syncModal.id = 'syncModal';
    syncModal.className = 'subview-modal';
    syncModal.innerHTML = [
      '<header class="subview-header">',
        '<h2>Kella & Telefoni Sünk</h2>',
        '<button class="icon-btn close-subview"><i data-lucide="x"></i></button>',
      '</header>',
      '<div class="subview-body"></div>'
    ].join('');
    const appShell = document.querySelector('.app-viewport, .app-shell') || document.body;
    appShell.appendChild(syncModal);
  }

  const titleEl = syncModal.querySelector('h2, h3, .subview-title');
  if (titleEl) titleEl.textContent = 'Kella & Telefoni Sünk';

  const bodyEl = syncModal.querySelector('.subview-body') || syncModal;
  const savedProvider = state.settings.syncProvider || 'Samsung Health';

  const providers = [
    { id: 'Samsung Health', icon: 'watch', sub: 'Galaxy Watch & telefon' },
    { id: 'Garmin Connect', icon: 'compass', sub: 'Garmin kellad & GPX' },
    { id: 'Apple Health', icon: 'heart', sub: 'Apple Watch & iPhone' },
    { id: 'Health Connect', icon: 'activity', sub: 'Google Fit & Android' },
    { id: 'Polar / Suunto', icon: 'mountain', sub: 'Spordikellad & TCX' },
    { id: 'Xiaomi / Zepp', icon: 'smartphone', sub: 'Mi Band & Amazfit' }
  ];

  let provHtml = '';
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const isAct = p.id === savedProvider ? 'active' : '';
    provHtml +=
      '<button type="button" class="gw-sync-prov ' + isAct + '" data-prov="' + p.id + '">' +
        '<div class="gw-sync-pico"><i data-lucide="' + p.icon + '"></i></div>' +
        '<div style="min-width:0;">' +
          '<div class="gw-sync-pname">' + p.id + '</div>' +
          '<div class="gw-sync-psub">' + p.sub + '</div>' +
        '</div>' +
      '</button>';
  }

  bodyEl.innerHTML = [
    '<div class="gw-sync-wrap">',
      '<div class="gw-sync-card">',
        '<div class="gw-sync-head">',
          '<span class="gw-sync-title"><i data-lucide="footprints" style="color:#ec4899;"></i> 1. Kiir-sünkroniseeri kella sammud</span>',
          '<span class="gw-sync-badge" id="gwActiveProviderBadge">' + savedProvider + '</span>',
        '</div>',
        '<p class="gw-sync-desc">Vali oma kell või terviseäpp ja kanna tänane sammude seis GoWalki üle (nt enne kõndi stardiseisu ühtlustamiseks):</p>',
        '<div class="gw-sync-mode-tabs">',
          '<button type="button" class="gw-smode-btn active" data-smode="replace">Määra tänaseks seisuks</button>',
          '<button type="button" class="gw-smode-btn" data-smode="add">Liida praegustele (+)</button>',
        '</div>',
        '<div class="gw-sync-input-row">',
          '<input type="number" id="gwSyncStepsInput" class="gw-calc-input" min="0" max="150000" step="100" value="' + (state.today.steps || 0) + '" placeholder="Sammude arv kellal..." />',
          '<button type="button" id="gwApplySyncStepsBtn" class="gw-sync-go-btn">Sünkroniseeri</button>',
        '</div>',
        '<div class="gw-sync-chips">',
          '<button type="button" class="gw-schip" data-add="1000">+1 000</button>',
          '<button type="button" class="gw-schip" data-add="2500">+2 500</button>',
          '<button type="button" class="gw-schip" data-add="5000">+5 000</button>',
          '<button type="button" class="gw-schip" data-add="10000">+10 000</button>',
        '</div>',
        '<div id="gwSyncFeedbackMsg" class="gw-sync-feedback"></div>',
      '</div>',

      '<div class="gw-sync-card">',
        '<div class="gw-sync-head">',
          '<span class="gw-sync-title"><i data-lucide="map-pin" style="color:#38bdf8;"></i> 2. Impordi kella GPS-rada või fail</span>',
        '</div>',
        '<p class="gw-sync-desc">Lae üles kellast või terviseäpist eksporditud treeningufail (<strong>.GPX, .TCX, .CSV, .JSON</strong>). GoWalk joonistab kella GPS-raja kaardile ja arvutab sammud ning kilomeetrid:</p>',
        '<input type="file" id="gwHealthFileInput" accept=".gpx,.tcx,.csv,.json,.xml" style="display:none;" />',
        '<button type="button" id="gwTriggerFileImportBtn" class="gw-file-drop-btn">',
          '<i data-lucide="upload-cloud"></i>',
          '<span>Vali fail telefonist (.GPX, .TCX, .CSV, .JSON)</span>',
        '</button>',
        '<div id="gwFileImportFeedback" class="gw-sync-feedback"></div>',
      '</div>',

      '<div class="gw-sync-card">',
        '<div class="gw-sync-head">',
          '<span class="gw-sync-title"><i data-lucide="watch" style="color:#a855f7;"></i> 3. Sinu ühendatud platvorm</span>',
        '</div>',
        '<div class="gw-sync-grid">' + provHtml + '</div>',
      '</div>',
    '</div>'
  ].join('');

  let syncMode = 'replace';

  bodyEl.addEventListener('click', function (e) {
    const modeBtn = e.target.closest('.gw-smode-btn');
    if (modeBtn) {
      syncMode = modeBtn.getAttribute('data-smode') || 'replace';
      const allM = bodyEl.querySelectorAll('.gw-smode-btn');
      for (let i = 0; i < allM.length; i++) allM[i].classList.remove('active');
      modeBtn.classList.add('active');
      const inp = document.getElementById('gwSyncStepsInput');
      if (inp) {
        inp.value = syncMode === 'replace' ? String(state.today.steps || 0) : '1000';
      }
      return;
    }

    const chip = e.target.closest('.gw-schip');
    if (chip) {
      const addVal = parseInt(chip.getAttribute('data-add'), 10) || 0;
      const inp = document.getElementById('gwSyncStepsInput');
      if (inp) {
        const cur = Math.max(0, parseInt(inp.value, 10) || 0);
        inp.value = String(cur + addVal);
      }
      return;
    }

    const provBtn = e.target.closest('.gw-sync-prov');
    if (provBtn) {
      const chosen = provBtn.getAttribute('data-prov') || 'Samsung Health';
      state.settings.syncProvider = chosen;
      saveState();
      const allP = bodyEl.querySelectorAll('.gw-sync-prov');
      for (let i = 0; i < allP.length; i++) allP[i].classList.remove('active');
      provBtn.classList.add('active');
      const badge = document.getElementById('gwActiveProviderBadge');
      if (badge) badge.textContent = chosen;
      return;
    }

    if (e.target.closest('#gwApplySyncStepsBtn')) {
      const inp = document.getElementById('gwSyncStepsInput');
      const fb = document.getElementById('gwSyncFeedbackMsg');
      const rawSteps = Math.max(0, parseInt(inp ? inp.value : '0', 10) || 0);

      if (syncMode === 'replace') {
        state.today.steps = rawSteps;
      } else {
        state.today.steps = (state.today.steps || 0) + rawSteps;
      }

      const strideM = (state.settings.strideCm || 76) / 100;
      state.today.distanceKm = +((state.today.steps * strideM) / 1000).toFixed(2);
      state.today.calories = Math.round(state.today.steps * 0.04);

      saveState();
      if (typeof updateHudFn === 'function') updateHudFn();

      if (fb) {
        fb.textContent =
          '✓ Sünkroniseeritud (' +
          (state.settings.syncProvider || 'Kell') +
          '): täna kokku ' +
          state.today.steps.toLocaleString('et-EE') +
          ' sammu (' +
          state.today.distanceKm.toFixed(2) +
          ' km).';
      }
      return;
    }

    if (e.target.closest('#gwTriggerFileImportBtn')) {
      const fileInp = document.getElementById('gwHealthFileInput');
      if (fileInp) fileInp.click();
    }
  });

  const fileInput = document.getElementById('gwHealthFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', function (ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const fb = document.getElementById('gwFileImportFeedback');
      if (fb) fb.textContent = 'Loen faili: ' + file.name + '...';

      const reader = new FileReader();
      reader.onload = function (loadEv) {
        const text = String(loadEv.target.result || '');
        const lowerName = file.name.toLowerCase();

        try {
          if (
            lowerName.endsWith('.gpx') ||
            lowerName.endsWith('.tcx') ||
            lowerName.endsWith('.xml') ||
            text.indexOf('<gpx') !== -1 ||
            text.indexOf('<TrainingCenterDatabase') !== -1
          ) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const coords = [];
            let firstTimeMs = 0;
            let lastTimeMs = 0;

            const trkpts = xml.querySelectorAll('trkpt, rtept');
            if (trkpts.length > 0) {
              for (let i = 0; i < trkpts.length; i++) {
                const lat = parseFloat(trkpts[i].getAttribute('lat'));
                const lon = parseFloat(trkpts[i].getAttribute('lon'));
                if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                  coords.push([lat, lon]);
                }
                const tEl = trkpts[i].querySelector('time');
                if (tEl && tEl.textContent) {
                  const tMs = Date.parse(tEl.textContent.trim());
                  if (!Number.isNaN(tMs)) {
                    if (!firstTimeMs) firstTimeMs = tMs;
                    lastTimeMs = tMs;
                  }
                }
              }
            } else {
              const tcxPts = xml.querySelectorAll('Trackpoint');
              for (let i = 0; i < tcxPts.length; i++) {
                const latEl = tcxPts[i].querySelector('LatitudeDegrees');
                const lonEl = tcxPts[i].querySelector('LongitudeDegrees');
                if (latEl && lonEl) {
                  const lat = parseFloat(latEl.textContent);
                  const lon = parseFloat(lonEl.textContent);
                  if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                    coords.push([lat, lon]);
                  }
                }
                const tEl = tcxPts[i].querySelector('Time');
                if (tEl && tEl.textContent) {
                  const tMs = Date.parse(tEl.textContent.trim());
                  if (!Number.isNaN(tMs)) {
                    if (!firstTimeMs) firstTimeMs = tMs;
                    lastTimeMs = tMs;
                  }
                }
              }
            }

            if (coords.length < 2) {
              if (fb) fb.textContent = 'Failist ei leitud GPS-teekonna punkte.';
              return;
            }

            const distMeters = calculateCoordsArrayDistanceMeters(coords);
            const strideM = (state.settings.strideCm || 76) / 100;
            const calcSteps = Math.round(distMeters / strideM);
            const durSec =
              lastTimeMs > firstTimeMs ? Math.round((lastTimeMs - firstTimeMs) / 1000) : 0;

            state.today.walkTrack = coords;
            if (calcSteps > 0) {
              state.today.steps = Math.max(state.today.steps || 0, calcSteps);
            }
            if (durSec > 0) {
              state.today.durationSec = Math.max(state.today.durationSec || 0, durSec);
            }

            restoreWalkedTrack(coords);
            if (map && window.L) {
              const bounds = L.latLngBounds(
                coords.map(function (c) {
                  return L.latLng(c[0], c[1]);
                })
              );
              map.fitBounds(bounds, { padding: [48, 48] });
            }

            saveState();
            if (typeof updateHudFn === 'function') updateHudFn();

            if (fb) {
              fb.textContent =
                '✓ Kella GPS-rada imporditud: ' +
                (distMeters / 1000).toFixed(2) +
                ' km (' +
                coords.length +
                ' punkti, ~' +
                calcSteps.toLocaleString('et-EE') +
                ' sammu)!';
            }
            return;
          }

          if (lowerName.endsWith('.json') || text.trim().startsWith('{')) {
            const parsed = JSON.parse(text);
            if (parsed.today && typeof parsed.today.steps === 'number') {
              state.today.steps = Math.max(state.today.steps || 0, parsed.today.steps);
              if (Array.isArray(parsed.today.walkTrack) && parsed.today.walkTrack.length > 0) {
                state.today.walkTrack = parsed.today.walkTrack;
                restoreWalkedTrack(parsed.today.walkTrack);
              }
            }
            if (Array.isArray(parsed.history)) {
              state.history = parsed.history.concat(state.history || []);
            }
            saveState();
            if (typeof updateHudFn === 'function') updateHudFn();
            if (fb) fb.textContent = '✓ JSON terviseandmed edukalt imporditud!';
            return;
          }

          const lines = text.split(/\r?\n/).filter(function (l) {
            return l.trim().length > 0;
          });
          let importedSteps = 0;
          for (let i = 0; i < lines.length; i++) {
            const nums = lines[i].match(/\b(\d{3,6})\b/g);
            if (nums) {
              for (let j = 0; j < nums.length; j++) {
                const n = parseInt(nums[j], 10);
                if (n >= 200 && n <= 95000 && n !== 2025 && n !== 2026) {
                  importedSteps = Math.max(importedSteps, n);
                }
              }
            }
          }

          if (importedSteps > 0) {
            state.today.steps = Math.max(state.today.steps || 0, importedSteps);
            saveState();
            if (typeof updateHudFn === 'function') updateHudFn();
            if (fb) {
              fb.textContent =
                '✓ CSV failist imporditud ' + importedSteps.toLocaleString('et-EE') + ' sammu!';
            }
          } else {
            if (fb) fb.textContent = 'Failist ei leitud sammude numbreid.';
          }
        } catch (err) {
          if (fb) fb.textContent = 'Faili lugemine ebaõnnestus. Kontrolli formaati.';
        }
      };
      reader.readAsText(file);
    });
  }

  const quickSyncBtn = document.getElementById('quickSyncBtn');
  if (quickSyncBtn) {
    quickSyncBtn.style.display = 'inline-flex';
    quickSyncBtn.onclick = function () {
      closeAllModalsAndGoHomeFn();
      const inp = document.getElementById('gwSyncStepsInput');
      if (inp) inp.value = String(state.today.steps || 0);
      syncModal.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    };
  }
}
