/* ==========================================================================
   GOWALK PRO — 3. LEAFLET MAP, LAYERS, SAFE LIT LOOP GENERATOR & OSRM ROUTING
   ========================================================================== */

import { pickBestRoute } from './route-quality.js';
import { legAnchors, extraRoadMeters, detourOptions, fillersFor, buildStopWaypoints } from './route-stops.js';
import { LUCIDE_SVGS } from './config.js';
import { state, plannedRoute, saveState, getMissingSteps } from './state.js';

export let map = null;
let tileLayers = {};
let activeLayer = null;
let waypoints = [];
// Kasutaja peatused (pood jms): {id, latlng, when: 'first'|'last', marker}
let userStops = [];
let stopIdCounter = 0;
let stopSheetEl = null;
let pendingTapMarker = null;
let isGenerating = false;
let regenQueued = false;
let markers = [];
let routeLine = null;

let walkedTrackPolyline = null;
let walkedCoordinates = [];

let lastGeneratedBearing = Math.random() * 2 * Math.PI;
let routeVariantCounter = 0;
let lastTargetSteps = 0;
let lastRouteType = 'loop';
let lastStopsCount = 3;
let floatingShuffleBtn = null;
let cachedSafeNodes = { key: '', nodes: [] };
let hudUpdateCallback = null;

function getSavedOrDefaultStartLatLng() {
  try {
    const raw = localStorage.getItem('gowalk_last_precise_gps');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return [parsed.lat, parsed.lng];
      }
    }
  } catch (e) {}
  return [58.3859, 24.4971];
}

export function initMapAndRouting(onHudUpdate) {
  hudUpdateCallback = onHudUpdate;

  const mapEl = document.getElementById('map');
  if (!mapEl || !window.L) return;

  const initialCoords = getSavedOrDefaultStartLatLng();

  map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView(initialCoords, 15);

  tileLayers = {
    dark: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      className: 'map-tiles-dark',
      attribution: '© Google Maps'
    }),
    light: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps'
    }),
    hybrid: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps'
    }),
    terrain: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps'
    })
  };

  activeLayer = tileLayers[state.settings.mapLayer] || tileLayers.dark;
  activeLayer.addTo(map);

  routeLine = L.polyline([], {
    color: '#8b5cf6',
    weight: 5,
    opacity: 0.92
  }).addTo(map);

  waypoints = [L.latLng(initialCoords[0], initialCoords[1])];
  rebuildWaypoints();

  // Taasta varem salvestatud kõnnijälg, kui see olemas
  if (state.today && Array.isArray(state.today.walkTrack)) {
    restoreWalkedTrack(state.today.walkTrack);
  }

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => switchMapLayer(chip.dataset.layer));
  });

  map.on('click', e => {
    openStopSheet({ latlng: e.latlng });
  });

  const undoBtn = document.getElementById('undoWaypointBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (userStops.length > 0) {
        removeStop(userStops[userStops.length - 1].id);
        return;
      }
      if (waypoints.length > 0) {
        waypoints.pop();
        rebuildWaypoints();
        if (waypoints.length <= 1) {
          plannedRoute.steps = 0;
          plannedRoute.distanceKm = 0;
          setFloatingShuffleVisible(false);
          if (hudUpdateCallback) hudUpdateCallback();
        }
      }
    });
  }

  const clearBtn = document.getElementById('clearRouteBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      closeStopSheet();
      userStops.forEach(st => st.marker && map.removeLayer(st.marker));
      userStops = [];
      const startPt = waypoints.length > 0 ? [waypoints[0]] : [];
      waypoints = startPt;
      routeLine.setLatLngs([]);
      rebuildWaypoints();
      plannedRoute.steps = 0;
      plannedRoute.distanceKm = 0;
      setFloatingShuffleVisible(false);
      if (hudUpdateCallback) hudUpdateCallback();
    });
  }

  const locateUserOnMap = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView(latlng, Math.max(map.getZoom(), 15));
      if (waypoints.length === 0) {
        waypoints.push(latlng);
        rebuildWaypoints();
      } else {
        waypoints[0] = latlng;
        rebuildWaypoints();
      }
    });
  };

  const locateBtn = document.getElementById('locateMeBtn');
  if (locateBtn) {
    locateBtn.addEventListener('click', locateUserOnMap);
  }

  setupRouteGeneratorUI();
  switchMapLayer(state.settings.mapLayer || 'dark');

  setTimeout(locateUserOnMap, 350);
}

export function clearWalkedTrack() {
  walkedCoordinates = [];
  if (walkedTrackPolyline && map) {
    map.removeLayer(walkedTrackPolyline);
    walkedTrackPolyline = null;
  }
}

export function appendWalkedTrackPoint(latlng) {
  if (!map) return;
  walkedCoordinates.push(latlng);
  
  if (!walkedTrackPolyline) {
    walkedTrackPolyline = L.polyline(walkedCoordinates, {
      color: '#38bdf8',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    walkedTrackPolyline.setLatLngs(walkedCoordinates);
  }
}

export function getWalkedTrackGeoJson() {
  return walkedCoordinates.map(pt => [pt.lat, pt.lng]);
}

export function restoreWalkedTrack(coordsArray) {
  clearWalkedTrack();
  if (Array.isArray(coordsArray) && coordsArray.length > 0) {
    walkedCoordinates = coordsArray.map(c => L.latLng(c[0], c[1]));
    if (map) {
      walkedTrackPolyline = L.polyline(walkedCoordinates, {
        color: '#38bdf8',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }
  }
}

export function switchMapLayer(layerKey) {
  if (!map || !tileLayers[layerKey]) return;
  if (activeLayer) map.removeLayer(activeLayer);
  activeLayer = tileLayers[layerKey];
  activeLayer.addTo(map);
  state.settings.mapLayer = layerKey;
  saveState();

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.layer === layerKey);
  });
  const styleSelect = document.getElementById('settingMapStyle');
  if (styleSelect) styleSelect.value = layerKey;
}

export function invalidateMapSize() {
  if (map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

function syncSafeToggleUI() {
  const active = state.settings.safeLitOnly !== false;
  const safeToggleBtn = document.getElementById('safeLitRouteToggleBtn');
  const safeToggleIconBox = document.getElementById('safeToggleIconBox');
  const safeToggleSubtext = document.getElementById('safeToggleSubtext');
  const safeToggleBadge = document.getElementById('safeToggleBadge');

  if (safeToggleBtn) safeToggleBtn.classList.toggle('active', active);
  if (safeToggleIconBox) {
    safeToggleIconBox.innerHTML = active ? LUCIDE_SVGS.flashlight : LUCIDE_SVGS.trees;
  }
  if (safeToggleSubtext) {
    safeToggleSubtext.textContent = active
      ? 'Väldib pimedaid metsaradu, eelistab tänavaid'
      : 'Metsa-, pargi- ja loodusrajad on lubatud';
  }
  if (safeToggleBadge) {
    safeToggleBadge.textContent = active ? 'SEES' : 'VÄLJAS';
  }
}

function updateFloatingShuffleLabel() {
  if (!floatingShuffleBtn) return;
  const isSafe = state.settings.safeLitOnly !== false;
  const modeSvg = isSafe ? LUCIDE_SVGS.flashlight : LUCIDE_SVGS.trees;
  const stopsLabel = userStops.length ? ' · ' + userStops.length + (userStops.length === 1 ? ' peatus' : ' peatust') : '';
  if (plannedRoute.steps === 0) {
    const missing = getMissingSteps();
    floatingShuffleBtn.innerHTML = `
    <span class="shuffle-mode-icon">${LUCIDE_SVGS.sparkles}</span>
    <span>Tee mulle rada${missing >= 300 ? ' (' + missing.toLocaleString('et-EE') + ' sammu)' : ''}${stopsLabel}</span>
  `;
    return;
  }
  const routeText = `Rada: ${plannedRoute.steps.toLocaleString('et-EE')} sammu (${plannedRoute.distanceKm.toFixed(2)} km)${stopsLabel}`;

  floatingShuffleBtn.innerHTML = `
    <span class="shuffle-mode-icon">${modeSvg}</span>
    <span>${routeText}</span>
    <span class="shuffle-action-tag">
      ${LUCIDE_SVGS.refreshCw}
      <span>Teine suund</span>
    </span>
  `;
}

// Hoiab "Rada / Teine suund" nupu alati alumise paneeli kohal,
// ka siis kui paneel kõndimise ajal kõrgemaks läheb (Paus nupp jms).
function keepShufflePillAboveHud(viewport) {
  const hud = document.querySelector('.bottom-hud');
  if (!hud || !floatingShuffleBtn) return;
  const GAP = 10;
  const reposition = () => {
    const vpRect = viewport.getBoundingClientRect();
    const hudRect = hud.getBoundingClientRect();
    const bottom = Math.max(0, vpRect.bottom - hudRect.top + GAP);
    floatingShuffleBtn.style.bottom = `${Math.round(bottom)}px`;
  };
  reposition();
  if (window.ResizeObserver) new ResizeObserver(reposition).observe(hud);
  window.addEventListener('resize', reposition);
  document.addEventListener('click', () => requestAnimationFrame(reposition), true);
}

function setFloatingShuffleVisible(visible) {
  if (floatingShuffleBtn) {
    updateFloatingShuffleLabel();
    // Kui rada pole, näitame nuppu "Tee mulle rada", kui samme on puudu.
    const hint = plannedRoute.steps === 0 && getMissingSteps() >= 300;
    floatingShuffleBtn.classList.toggle('visible', visible || hint);
  }
}

// Avaleht kutsub seda, kui sammud muutuvad (nupu tekst ja nähtavus).
export function refreshRouteHint() {
  setFloatingShuffleVisible(plannedRoute.steps > 0);
}

function createPinIcon(label, isStart = false) {
  const bg = isStart ? '#8b5cf6' : '#c084fc';
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${bg};color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;
      font-weight:800;font-size:12px;display:flex;align-items:center;
      justify-content:center;border:2px solid #fff;box-shadow:0 4px 14px rgba(139,92,246,0.65);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function setPlannedRouteMetrics(totalMeters) {
  const routeKm = totalMeters / 1000;
  const strideMeters = (state.settings.strideCm || 76) / 100;
  const routeSteps = Math.round(totalMeters / strideMeters);

  plannedRoute.steps = routeSteps;
  plannedRoute.distanceKm = +routeKm.toFixed(2);
  updateFloatingShuffleLabel();
  if (hudUpdateCallback) hudUpdateCallback();
}

function recalculateRouteMetrics() {
  if (!map || !routeLine) return;
  let totalMeters = 0;
  const latlngs = routeLine.getLatLngs();
  for (let i = 1; i < latlngs.length; i++) {
    totalMeters += map.distance(latlngs[i - 1], latlngs[i]);
  }
  if (latlngs.length > 1) {
    setPlannedRouteMetrics(totalMeters);
    setFloatingShuffleVisible(true);
  }
}

function rebuildWaypoints(customGeometry = null, skipMetricRecalc = false) {
  if (!map || !routeLine) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  routeLine.setLatLngs(customGeometry || waypoints);

  waypoints.forEach((latlng, idx) => {
    const label = idx === 0 ? 'A' : idx;
    const marker = L.marker(latlng, {
      draggable: true,
      icon: createPinIcon(label, idx === 0)
    }).addTo(map);

    marker.on('drag', e => {
      waypoints[idx] = e.target.getLatLng();
      routeLine.setLatLngs(waypoints);
      recalculateRouteMetrics();
    });

    markers.push(marker);
  });

  if (!skipMetricRecalc) {
    recalculateRouteMetrics();
  }
  notifyRouteChanged();
}

function setupRouteGeneratorUI() {
  const viewport = document.querySelector('.app-viewport');
  const toolsBar = document.querySelector('.map-floating-tools');
  if (!viewport || !toolsBar) return;

  const magicFab = document.createElement('button');
  magicFab.className = 'tool-fab magic-fab';
  magicFab.title = 'Genereeri puuduvate sammude trajektoor';
  magicFab.innerHTML = '<i data-lucide="sparkles"></i>';
  toolsBar.prepend(magicFab);

  floatingShuffleBtn = document.createElement('button');
  floatingShuffleBtn.id = 'floatingShuffleBtn';
  floatingShuffleBtn.className = 'floating-shuffle-pill';
  updateFloatingShuffleLabel();
  viewport.appendChild(floatingShuffleBtn);
  keepShufflePillAboveHud(viewport);

  const isSafeDefault = state.settings.safeLitOnly !== false;
  const initialMissing = getMissingSteps() || 3000;

  const popover = document.createElement('div');
  popover.id = 'routeGenPopover';
  popover.className = 'route-gen-popover';
  popover.innerHTML = `
    <div class="route-gen-header">
      <div class="route-gen-title">
        <span class="spark-icon-wrap">${LUCIDE_SVGS.sparkles}</span>
        <span>Automaatne Trajektoori Generaator</span>
      </div>
      <button id="closeRouteGenBtn" class="icon-btn" style="width:28px;height:28px;">
        ${LUCIDE_SVGS.close}
      </button>
    </div>
    <p class="route-gen-sub" id="routeGenMissingHint">
      Vali sammude arv ja GoWalk joonistab alguspunktist (Pin A) puhta ringtrajektoori:
    </p>

    <button type="button" id="safeLitRouteToggleBtn" class="safe-route-toggle ${isSafeDefault ? 'active' : ''}">
      <div class="safe-toggle-left">
        <span class="safe-toggle-icon-box" id="safeToggleIconBox">
          ${isSafeDefault ? LUCIDE_SVGS.flashlight : LUCIDE_SVGS.trees}
        </span>
        <div class="safe-toggle-text">
          <span class="safe-toggle-title">Ainult valgustatud tänavad / Ohutu ring</span>
          <span class="safe-toggle-sub" id="safeToggleSubtext">
            ${isSafeDefault ? 'Väldib pimedaid metsaradu, eelistab tänavaid' : 'Metsa-, pargi- ja loodusrajad on lubatud'}
          </span>
        </div>
      </div>
      <span class="safe-toggle-pill" id="safeToggleBadge">${isSafeDefault ? 'SEES' : 'VÄLJAS'}</span>
    </button>

    <div class="route-preset-pills">
      <button class="preset-pill active" data-steps="missing">Puuduvad</button>
      <button class="preset-pill" data-steps="3000">3 000</button>
      <button class="preset-pill" data-steps="5000">5 000</button>
      <button class="preset-pill" data-steps="10000">10 000</button>
    </div>
    <div class="route-custom-row">
      <input type="number" id="targetRouteStepsInput" class="route-custom-input" value="${initialMissing}" step="500" min="300" placeholder="Sammude arv..." />
      <button id="generateSmartRouteBtn" class="btn-generate-go">Genereeri rada</button>
    </div>
    <button id="shuffleRoutePopoverBtn" class="btn-shuffle-route">
      ${LUCIDE_SVGS.refreshCw}
      <span>Teine suund (Shuffle)</span>
    </button>
  `;
  viewport.appendChild(popover);

  if (window.lucide) window.lucide.createIcons();

  const stepsInput = document.getElementById('targetRouteStepsInput');
  const missingHint = document.getElementById('routeGenMissingHint');

  const togglePopover = () => {
    const missing = getMissingSteps();
    const suggested = missing >= 300 ? missing : 3000;
    stepsInput.value = suggested;
    if (missing > 0) {
      missingHint.textContent = `Sul on eesmärgist puudu ${missing.toLocaleString('et-EE')} sammu. Koosta täpselt puuduv ring:`;
    } else {
      missingHint.textContent = 'Päeva eesmärk on täis! Võid genereerida lisaringi:';
    }
    popover.classList.toggle('open');
  };

  magicFab.addEventListener('click', togglePopover);
  document.getElementById('closeRouteGenBtn').addEventListener('click', () => {
    popover.classList.remove('open');
  });

  const safeToggleBtn = document.getElementById('safeLitRouteToggleBtn');
  safeToggleBtn.addEventListener('click', () => {
    state.settings.safeLitOnly = !(state.settings.safeLitOnly !== false);
    syncSafeToggleUI();
    updateFloatingShuffleLabel();
    saveState();
  });

  popover.querySelectorAll('.preset-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      popover.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const rawAttr = pill.getAttribute('data-steps');
      const missing = getMissingSteps();
      const val =
        rawAttr === 'missing'
          ? missing >= 300
            ? missing
            : 3000
          : parseInt(rawAttr, 10);
      stepsInput.value = val;
      lastTargetSteps = val;
      generateLoopRouteForSteps(val, lastRouteType, lastStopsCount);
      popover.classList.remove('open');
    });
  });

  document.getElementById('generateSmartRouteBtn').addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || fallback);
    lastTargetSteps = targetSteps;
    generateLoopRouteForSteps(targetSteps, lastRouteType, lastStopsCount);
    popover.classList.remove('open');
  });

  document.getElementById('shuffleRoutePopoverBtn').addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || lastTargetSteps || fallback);
    lastTargetSteps = targetSteps;
    generateLoopRouteForSteps(targetSteps, lastRouteType, lastStopsCount);
  });

  floatingShuffleBtn.addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = plannedRoute.steps === 0 ? fallback : lastTargetSteps || fallback;
    generateLoopRouteForSteps(targetSteps, lastRouteType, lastStopsCount);
  });
  setFloatingShuffleVisible(false);
}

function offsetCoordinate(originLatLng, distanceMeters, bearingRad) {
  const R = 6378137;
  const lat1 = (originLatLng.lat * Math.PI) / 180;
  const lon1 = (originLatLng.lng * Math.PI) / 180;
  const dByR = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dByR) +
      Math.cos(lat1) * Math.sin(dByR) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2)
    );

  return L.latLng((lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI);
}

async function fetchSafeLitStreetNodes(startPoint, searchRadiusMeters) {
  const radius = Math.min(3500, Math.max(600, Math.round(searchRadiusMeters * 2.2)));
  const cacheKey = `${startPoint.lat.toFixed(3)}_${startPoint.lng.toFixed(3)}_${radius}`;
  if (cachedSafeNodes.key === cacheKey && cachedSafeNodes.nodes.length > 10) {
    return cachedSafeNodes.nodes;
  }

  const query = `
    [out:json][timeout:3];
    (
      way(around:${radius},${startPoint.lat},${startPoint.lng})["lit"="yes"]["highway"~"residential|living_street|pedestrian|footway|cycleway|service|unclassified"];
      way(around:${radius},${startPoint.lat},${startPoint.lng})["highway"~"residential|living_street|pedestrian|footway"]["lit"!="no"];
    );
    out geom;
  `;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2600);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();

    const nodes = [];
    if (data && Array.isArray(data.elements)) {
      data.elements.forEach(el => {
        const isLit = el.tags?.lit === 'yes';
        if (Array.isArray(el.geometry)) {
          for (let i = 0; i < el.geometry.length; i += 3) {
            const pt = el.geometry[i];
            if (pt && pt.lat && pt.lon) {
              nodes.push({ lat: pt.lat, lng: pt.lon, lit: isLit });
            }
          }
        }
      });
    }

    if (nodes.length > 0) {
      cachedSafeNodes = { key: cacheKey, nodes };
    }
    return nodes;
  } catch (e) {
    return [];
  }
}

function snapPointToSafeStreet(idealLatLng, safeNodes, maxSnapDistMeters) {
  if (!safeNodes || safeNodes.length === 0 || !map) return idealLatLng;
  let bestNode = null;
  let bestScore = Infinity;

  for (let i = 0; i < safeNodes.length; i++) {
    const n = safeNodes[i];
    const candidate = L.latLng(n.lat, n.lng);
    const dist = map.distance(idealLatLng, candidate);
    if (dist <= maxSnapDistMeters) {
      const score = n.lit ? dist * 0.72 : dist;
      if (score < bestScore) {
        bestScore = score;
        bestNode = candidate;
      }
    }
  }
  return bestNode || idealLatLng;
}

function buildTrueCircularWaypoints(
  startPoint,
  loopRadiusMeters,
  centerBearingRad,
  turnSign,
  aspectRatio = 1.0,
  safeNodes = [],
  numStops = 3
) {
  const stopsCount = Math.max(1, Math.min(8, parseInt(numStops, 10) || 3));
  const loopCenter = offsetCoordinate(startPoint, loopRadiusMeters, centerBearingRad);
  const angleA = centerBearingRad + Math.PI;
  // Ära lükka punkte kaugele: väike nihe tänavale, mitte ringi moonutamine.
  const snapLimit = Math.min(120, Math.max(40, loopRadiusMeters * 0.2));

  const resultPoints = [startPoint];

  for (let k = 1; k <= stopsCount; k++) {
    const fraction = k / (stopsCount + 1);
    const theta = angleA + turnSign * (fraction * 2 * Math.PI);
    const isFarHalf = Math.abs(fraction - 0.5) < 0.2;
    const radiusScale = isFarHalf ? 1.08 : aspectRatio;

    let pt = offsetCoordinate(loopCenter, loopRadiusMeters * radiusScale, theta);
    if (safeNodes && safeNodes.length > 0) {
      pt = snapPointToSafeStreet(pt, safeNodes, snapLimit);
    }
    resultPoints.push(pt);
  }

  return resultPoints;
}

function removeDeadEndSpurs(latlngs, protectedPts = []) {
  if (!Array.isArray(latlngs) || latlngs.length < 8 || !map) return latlngs;
  let pts = latlngs.slice();

  for (let pass = 0; pass < 3; pass++) {
    let cleaned = [];
    let i = 0;
    while (i < pts.length) {
      let jumpIndex = -1;
      const maxLookAhead = Math.min(pts.length - 1, i + 45);
      for (let j = maxLookAhead; j >= i + 3; j--) {
        if (i < 5 && j > pts.length - 6) continue;
        const distBetween = map.distance(pts[i], pts[j]);
        if (distBetween < 18) {
          // Ära lõika välja lõiku, mis läbib kasutaja peatust (nt pood tupikus)
          let touchesProtected = false;
          for (const q of protectedPts) {
            for (let k = i; k <= j; k++) {
              if (map.distance(pts[k], q) < 45) {
                touchesProtected = true;
                break;
              }
            }
            if (touchesProtected) break;
          }
          if (touchesProtected) continue;
          jumpIndex = j;
          break;
        }
      }
      cleaned.push(pts[i]);
      if (jumpIndex !== -1) {
        i = jumpIndex + 1;
      } else {
        i += 1;
      }
    }
    pts = cleaned;
  }
  return pts;
}

async function fetchLoopRouteGeometry(pointsList, safeLitOnly, allowUTurns = false) {
  const coordsQuery = [...pointsList, pointsList[0]]
    .map(pt => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`)
    .join(';');

  const endpoints = safeLitOnly
    ? [
        `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson&continue_straight=true`,
        `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson&continue_straight=true`,
        `https://router.project-osrm.org/route/v1/foot/${coordsQuery}?overview=full&geometries=geojson`
      ]
    : [
        `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson&continue_straight=true`,
        `https://router.project-osrm.org/route/v1/foot/${coordsQuery}?overview=full&geometries=geojson`
      ];

  for (const rawUrl of endpoints) {
    // Peatuses (pood) peab saama tagasi pöörata
    const url = allowUTurns ? rawUrl.replace('&continue_straight=true', '') : rawUrl;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.routes && data.routes[0]) {
        return data.routes[0];
      }
    } catch (e) {}
  }
  return null;
}

export async function generateLoopRouteForSteps(
  targetSteps,
  routeTypeOverride = null,
  numStopsOverride = null
) {
  if (!map) return;

  let chosenType = routeTypeOverride;
  if (!chosenType) {
    const activeTypeEl = document.querySelector('#gwRouteBuilderModal .gw-rb-type.active');
    chosenType = activeTypeEl ? activeTypeEl.getAttribute('data-rtype') : lastRouteType || 'loop';
  }
  lastRouteType = chosenType;

  let stopsCount = parseInt(numStopsOverride, 10);
  if (Number.isNaN(stopsCount) || stopsCount < 1) {
    const stopCountEl = document.getElementById('gwStopCount');
    stopsCount = stopCountEl ? parseInt(stopCountEl.textContent, 10) || 3 : lastStopsCount || 3;
  }
  stopsCount = Math.max(1, Math.min(8, stopsCount));
  lastStopsCount = stopsCount;

  if (chosenType === 'park') {
    state.settings.safeLitOnly = false;
  } else if (chosenType === 'loop') {
    state.settings.safeLitOnly = true;
  } else if (chosenType === 'surprise') {
    state.settings.safeLitOnly = Math.random() > 0.45;
  }
  syncSafeToggleUI();
  saveState();

  const strideMeters = (state.settings.strideCm || 76) / 100;
  const targetMeters = targetSteps * strideMeters;
  const safeLitOnly = state.settings.safeLitOnly !== false;
  lastTargetSteps = targetSteps;

  const startPoint = waypoints.length > 0 ? waypoints[0] : map.getCenter();

  if (userStops.length > 0) {
    await generateRouteThroughStops(startPoint, targetMeters, safeLitOnly);
    return;
  }

  const angleShift =
    chosenType === 'discover'
      ? Math.PI * 0.68 + Math.random() * (Math.PI * 0.45)
      : Math.PI * 0.53 + Math.random() * (Math.PI * 0.38);
  lastGeneratedBearing = (lastGeneratedBearing + angleShift) % (2 * Math.PI);

  routeVariantCounter += 1;
  const turnSign = routeVariantCounter % 2 === 0 ? 1 : -1;

  let aspectRatio = 0.96;
  if (chosenType === 'discover') {
    aspectRatio = 1.18;
  } else if (chosenType === 'surprise') {
    const surpriseRatios = [0.78, 1.0, 1.24];
    aspectRatio = surpriseRatios[routeVariantCounter % surpriseRatios.length];
  } else {
    const aspectRatios = [0.95, 0.85, 1.1];
    aspectRatio = aspectRatios[routeVariantCounter % aspectRatios.length];
  }

  const loopRadiusMeters = Math.max(100, targetMeters / 8.0);

  if (floatingShuffleBtn) {
    floatingShuffleBtn.classList.add('visible');
    const loadingLabel =
      chosenType === 'park'
        ? 'Otsin pargi- ja loodusrada...'
        : 'Otsin sobivat ringrada...';
    floatingShuffleBtn.innerHTML = `${LUCIDE_SVGS.loader}<span>${loadingLabel}</span>`;
  }

  const safeNodes = safeLitOnly
    ? await fetchSafeLitStreetNodes(startPoint, loopRadiusMeters)
    : [];

  // Teeme mitu kandidaatrada eri suundades, hindame neid (pikkus, tagasikäimine,
  // siksakid) ja valime parima. Vt route-quality.js.
  async function buildCandidate(bearing, sign, radius) {
    const wps = buildTrueCircularWaypoints(
      startPoint,
      radius,
      bearing,
      sign,
      aspectRatio,
      safeNodes,
      stopsCount
    );
    const route = await fetchLoopRouteGeometry(wps, safeLitOnly);
    if (!route || !route.geometry) return null;
    let pts = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
    pts = removeDeadEndSpurs(pts);
    return { pts, wps, bearing, sign, radius };
  }

  try {
    const bearings = [0, 1, 2].map(k => (lastGeneratedBearing + (k * 2 * Math.PI) / 3) % (2 * Math.PI));
    const found = await Promise.all(
      bearings.map(b => buildCandidate(b, turnSign, loopRadiusMeters).catch(() => null))
    );
    let best = pickBestRoute(found.filter(Boolean), targetMeters);

    // Kui pikkus on liiga kaugel soovitust, korda parima suunaga õige raadiusega
    if (best && best.quality.errFrac > 0.08 && best.quality.lengthM > 80) {
      const ratio = targetMeters / best.quality.lengthM;
      const radius = best.radius * Math.max(0.55, Math.min(1.65, ratio));
      const refined = await buildCandidate(best.bearing, best.sign, radius).catch(() => null);
      const pick = pickBestRoute([best, refined].filter(Boolean), targetMeters);
      if (pick) best = pick;
    }

    if (best) {
      lastGeneratedBearing = best.bearing;
      const latlngs = best.pts;

      if (latlngs.length >= stopsCount + 4) {
        const sampledWaypoints = [startPoint];
        for (let k = 1; k <= stopsCount; k++) {
          const idx = Math.min(
            latlngs.length - 2,
            Math.max(1, Math.floor((latlngs.length * k) / (stopsCount + 1)))
          );
          sampledWaypoints.push(latlngs[idx]);
        }
        waypoints = sampledWaypoints;
      } else {
        waypoints = best.wps;
      }

      rebuildWaypoints(latlngs, true);
      // Näita päris raja pikkust, mitte soovitud sihtarvu
      setPlannedRouteMetrics(best.quality.lengthM);
      map.fitBounds(routeLine.getBounds(), { padding: [54, 54] });
      setFloatingShuffleVisible(true);
      return;
    }
  } catch (err) {
    console.warn('Marsruudi varurežiim:', err);
  }

  waypoints.push(startPoint);
  rebuildWaypoints(null, true);
  setPlannedRouteMetrics(targetMeters);
  map.fitBounds(routeLine.getBounds(), { padding: [54, 54] });
  setFloatingShuffleVisible(true);
}

/* ==========================================================================
   KASUTAJA PEATUSED (pood jms) — lisamine, muutmine ja rada läbi nende
   ========================================================================== */

function notifyRouteChanged() {
  const hasRoute = routeLine && routeLine.getLatLngs().length > 1;
  const count = waypoints.length > 1 || hasRoute || userStops.length > 0 ? Math.max(2, waypoints.length) : 1;
  document.dispatchEvent(new CustomEvent('gw:route-changed', { detail: { count } }));
}

function createStopIcon(label, when) {
  const bg = when === 'last' ? '#14b8a6' : '#f59e0b';
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="
      width:32px;height:32px;border-radius:10px;
      background:${bg};color:#0b1020;font-family:'Plus Jakarta Sans',sans-serif;
      font-weight:800;font-size:14px;display:flex;align-items:center;
      justify-content:center;border:2px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.55);
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function refreshStopMarkers() {
  userStops.forEach((st, i) => {
    if (st.marker && st.marker.setIcon) st.marker.setIcon(createStopIcon(String(i + 1), st.when));
  });
}

function injectStopSheetStyle() {
  if (document.getElementById('gw-stop-sheet-style')) return;
  const st = document.createElement('style');
  st.id = 'gw-stop-sheet-style';
  st.textContent = [
    '.gw-stop-sheet { position: absolute; left: 12px; right: 12px; bottom: 262px; z-index: 30; display: none;',
    '  flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px;',
    '  background: rgba(17, 14, 32, 0.97); border: 1px solid var(--accent-secondary, #a855f7);',
    '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); color: #fff; font-family: var(--font-display, inherit); }',
    '.gw-stop-sheet.open { display: flex; }',
    '.gw-stop-title { font-size: 15px; font-weight: 800; }',
    '.gw-stop-sub { font-size: 12px; color: #cbd5e1; margin-top: -6px; }',
    '.gw-stop-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }',
    '.gw-stop-opt { display: flex; flex-direction: column; gap: 2px; align-items: center; padding: 10px 6px; cursor: pointer;',
    '  border-radius: 14px; border: 1px solid rgba(168, 85, 247, 0.4); background: rgba(30, 27, 75, 0.8); color: #fff; font: inherit; }',
    '.gw-stop-opt strong { font-size: 14px; }',
    '.gw-stop-opt small { font-size: 11px; color: #cbd5e1; }',
    '.gw-stop-opt.active { border-color: #ec4899; background: rgba(124, 58, 237, 0.35); }',
    '.gw-stop-opt:active { transform: scale(0.97); }',
    '.gw-stop-foot { display: flex; gap: 8px; }',
    '.gw-stop-foot button { flex: 1; padding: 10px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.35);',
    '  background: transparent; color: #e2e8f0; font: 700 13px inherit; cursor: pointer; }',
    '.gw-stop-foot .danger { color: #f87171; border-color: rgba(248, 113, 113, 0.5); }'
  ].join('\n');
  document.head.appendChild(st);
}

function ensureStopSheet() {
  if (stopSheetEl) return stopSheetEl;
  const viewport = document.querySelector('.app-viewport');
  if (!viewport) return null;
  injectStopSheetStyle();
  stopSheetEl = document.createElement('div');
  stopSheetEl.id = 'gwStopSheet';
  stopSheetEl.className = 'gw-stop-sheet';
  viewport.appendChild(stopSheetEl);

  const hud = document.querySelector('.bottom-hud');
  const reposition = () => {
    if (!hud) return;
    const vp = viewport.getBoundingClientRect();
    const h = hud.getBoundingClientRect();
    stopSheetEl.style.bottom = Math.max(0, Math.round(vp.bottom - h.top + 10)) + 'px';
  };
  reposition();
  if (window.ResizeObserver && hud) new ResizeObserver(reposition).observe(hud);
  window.addEventListener('resize', reposition);
  return stopSheetEl;
}

function clearPendingTapMarker() {
  if (pendingTapMarker && map) map.removeLayer(pendingTapMarker);
  pendingTapMarker = null;
}

function closeStopSheet() {
  if (stopSheetEl) stopSheetEl.classList.remove('open');
  clearPendingTapMarker();
}

// Avab peatuse lisamise (uus: {latlng}) või muutmise (olemasolev: {stopId}) kaardi
function openStopSheet({ latlng = null, stopId = null }) {
  const sheet = ensureStopSheet();
  if (!sheet || !map) return;
  clearPendingTapMarker();

  const existing = stopId != null ? userStops.find(s => s.id === stopId) : null;
  if (!existing && latlng) {
    pendingTapMarker = L.marker(latlng, { icon: createStopIcon('+', 'first'), interactive: false }).addTo(map);
  }
  const num = existing ? userStops.indexOf(existing) + 1 : userStops.length + 1;
  const current = existing ? existing.when : null;

  sheet.innerHTML = `
    <div class="gw-stop-title">${existing ? 'Peatus ' + num : 'Lisa peatus siia'}</div>
    <div class="gw-stop-sub">Millal tahad siit läbi käia?</div>
    <div class="gw-stop-row">
      <button type="button" class="gw-stop-opt${current === 'first' ? ' active' : ''}" data-when="first">
        <strong>Kohe</strong><small>Esimesena, siis ring</small>
      </button>
      <button type="button" class="gw-stop-opt${current === 'last' ? ' active' : ''}" data-when="last">
        <strong>Tagasiteel</strong><small>Viimasena enne koju</small>
      </button>
    </div>
    <div class="gw-stop-foot">
      ${existing ? '<button type="button" class="danger" data-act="remove">Eemalda</button>' : ''}
      <button type="button" data-act="close">${existing ? 'Sulge' : 'Tühista'}</button>
    </div>
  `;
  sheet.classList.add('open');

  sheet.onclick = e => {
    const opt = e.target.closest('.gw-stop-opt');
    const act = e.target.closest('[data-act]');
    if (opt) {
      const when = opt.getAttribute('data-when');
      if (existing) setStopWhen(existing.id, when);
      else addStop(latlng, when);
      closeStopSheet();
    } else if (act) {
      if (act.getAttribute('data-act') === 'remove' && existing) removeStop(existing.id);
      closeStopSheet();
    }
  };
}

function addStop(latlng, when) {
  const id = ++stopIdCounter;
  const marker = L.marker(latlng, {
    draggable: true,
    icon: createStopIcon(String(userStops.length + 1), when)
  }).addTo(map);
  const stop = { id, latlng: L.latLng(latlng.lat, latlng.lng), when, marker };
  marker.on('click', () => openStopSheet({ stopId: id }));
  marker.on('dragend', e => {
    const ll = e.target.getLatLng();
    stop.latlng = L.latLng(ll.lat, ll.lng);
    regenerateIfRoute();
  });
  userStops.push(stop);
  refreshStopMarkers();
  afterStopsChanged();
}

function setStopWhen(id, when) {
  const st = userStops.find(s => s.id === id);
  if (!st || st.when === when) return;
  st.when = when;
  refreshStopMarkers();
  afterStopsChanged();
}

function removeStop(id) {
  const i = userStops.findIndex(s => s.id === id);
  if (i < 0) return;
  if (userStops[i].marker) map.removeLayer(userStops[i].marker);
  userStops.splice(i, 1);
  refreshStopMarkers();
  afterStopsChanged();
}

function afterStopsChanged() {
  updateFloatingShuffleLabel();
  setFloatingShuffleVisible(plannedRoute.steps > 0);
  notifyRouteChanged();
  regenerateIfRoute();
}

// Kui rada juba on, arvuta see peatuste muutudes kohe uuesti
function regenerateIfRoute() {
  if (plannedRoute.steps <= 0) return;
  if (isGenerating) {
    regenQueued = true;
    return;
  }
  const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
  generateLoopRouteForSteps(lastTargetSteps || fallback, lastRouteType, lastStopsCount);
}

async function generateRouteThroughStops(startPoint, targetMeters, safeLitOnly) {
  isGenerating = true;
  lastGeneratedBearing = (lastGeneratedBearing + 1.3 + Math.random()) % (2 * Math.PI);
  if (floatingShuffleBtn) {
    floatingShuffleBtn.classList.add('visible');
    floatingShuffleBtn.innerHTML = `${LUCIDE_SVGS.loader}<span>Otsin rada läbi peatuste...</span>`;
  }
  try {
    const { firsts, lasts, from, to } = legAnchors(startPoint, userStops);
    const extra = extraRoadMeters(startPoint, firsts, lasts, targetMeters);
    const options = detourOptions(from, to, extra, lastGeneratedBearing);

    const build = async (desc, extraM) => {
      const fillers = fillersFor(desc, from, to, extraM);
      const wps = buildStopWaypoints(startPoint, firsts, fillers, lasts);
      const route = await fetchLoopRouteGeometry(wps, safeLitOnly, true);
      if (!route || !route.geometry) return null;
      let pts = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
      // Täitepunktid võivad tekitada "vurre" (tupikusse minek ja tagasi): lõika need ära,
      // aga jäta alles kõik lõigud, mis läbivad kasutaja peatust.
      pts = removeDeadEndSpurs(pts, userStops.map(st => st.latlng));
      return { pts, desc, extraM };
    };

    const found = (await Promise.all(options.map(d => build(d, extra).catch(() => null)))).filter(Boolean);
    let best = pickBestRoute(found, targetMeters);

    // Täpsusta pikkust (kuni 2 korda): lisa/võta ringilt puuduv/liigne.
    // Kui rada on liiga pikk ja ringi pole enam vaja, jäta ainult peatused.
    for (let attempt = 0; attempt < 2 && best && best.quality.errFrac > 0.08; attempt++) {
      const newExtra = best.extraM + (targetMeters - best.quality.lengthM);
      if (best.desc.none && newExtra <= 80) break;
      const desc =
        newExtra <= 80
          ? { none: true }
          : best.desc.none
            ? detourOptions(from, to, newExtra, lastGeneratedBearing)[0]
            : best.desc;
      const refined = await build(desc, Math.max(0, newExtra)).catch(() => null);
      const pick = pickBestRoute([best, refined].filter(Boolean), targetMeters);
      if (!pick || pick === best) break;
      best = pick;
    }

    if (!best) {
      if (floatingShuffleBtn) updateFloatingShuffleLabel();
      setFloatingShuffleVisible(false);
      return;
    }

    waypoints = [startPoint];
    rebuildWaypoints(best.pts, true);
    setPlannedRouteMetrics(best.quality.lengthM);
    map.fitBounds(routeLine.getBounds(), { padding: [54, 54] });
    setFloatingShuffleVisible(true);
    notifyRouteChanged();
  } finally {
    isGenerating = false;
    if (regenQueued) {
      regenQueued = false;
      regenerateIfRoute();
    }
  }
}
