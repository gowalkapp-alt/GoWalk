/* ==========================================================================
   GOWALK PRO — 3. LEAFLET MAP, LAYERS, SAFE LIT LOOP GENERATOR & OSRM ROUTING
   ========================================================================== */

import { LUCIDE_SVGS } from './config.js';
import { state, plannedRoute, saveState, getMissingSteps } from './state.js';

export let map = null;
let tileLayers = {};
let activeLayer = null;
let waypoints = [];
let markers = [];
let routeLine = null;

let lastGeneratedBearing = Math.random() * 2 * Math.PI;
let routeVariantCounter = 0;
let lastTargetSteps = 0;
let floatingShuffleBtn = null;
let cachedSafeNodes = { key: '', nodes: [] };
let hudUpdateCallback = null;

export function initMapAndRouting(onHudUpdate) {
  hudUpdateCallback = onHudUpdate;

  const mapEl = document.getElementById('map');
  if (!mapEl || !window.L) return;

  map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([58.3859, 24.4971], 14);

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

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => switchMapLayer(chip.dataset.layer));
  });

  map.on('click', e => {
    waypoints.push(e.latlng);
    rebuildWaypoints();
  });

  const undoBtn = document.getElementById('undoWaypointBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
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
      waypoints = [];
      routeLine.setLatLngs([]);
      markers.forEach(m => map.removeLayer(m));
      markers = [];
      plannedRoute.steps = 0;
      plannedRoute.distanceKm = 0;
      setFloatingShuffleVisible(false);
      if (hudUpdateCallback) hudUpdateCallback();
    });
  }

  const locateBtn = document.getElementById('locateMeBtn');
  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(pos => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        map.setView(latlng, 15);
        if (waypoints.length === 0) {
          waypoints.push(latlng);
          rebuildWaypoints();
        } else {
          waypoints[0] = latlng;
          rebuildWaypoints();
        }
      });
    });
  }

  setupRouteGeneratorUI();
  switchMapLayer(state.settings.mapLayer || 'dark');
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

function updateFloatingShuffleLabel() {
  if (!floatingShuffleBtn) return;
  const isSafe = state.settings.safeLitOnly !== false;
  const modeSvg = isSafe ? LUCIDE_SVGS.flashlight : LUCIDE_SVGS.trees;
  const routeText =
    plannedRoute.steps > 0
      ? `Rada: ${plannedRoute.steps.toLocaleString('et-EE')} sammu (${plannedRoute.distanceKm.toFixed(2)} km)`
      : 'Valitud rada';

  floatingShuffleBtn.innerHTML = `
    <span class="shuffle-mode-icon">${modeSvg}</span>
    <span>${routeText}</span>
    <span class="shuffle-action-tag">
      ${LUCIDE_SVGS.refreshCw}
      <span>Teine suund</span>
    </span>
  `;
}

function setFloatingShuffleVisible(visible) {
  if (floatingShuffleBtn) {
    updateFloatingShuffleLabel();
    floatingShuffleBtn.classList.toggle('visible', visible);
  }
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
  const safeToggleIconBox = document.getElementById('safeToggleIconBox');
  const safeToggleSubtext = document.getElementById('safeToggleSubtext');
  const safeToggleBadge = document.getElementById('safeToggleBadge');

  safeToggleBtn.addEventListener('click', () => {
    state.settings.safeLitOnly = !(state.settings.safeLitOnly !== false);
    const active = state.settings.safeLitOnly;
    safeToggleBtn.classList.toggle('active', active);
    safeToggleIconBox.innerHTML = active ? LUCIDE_SVGS.flashlight : LUCIDE_SVGS.trees;
    safeToggleSubtext.textContent = active
      ? 'Väldib pimedaid metsaradu, eelistab tänavaid'
      : 'Metsa-, pargi- ja loodusrajad on lubatud';
    safeToggleBadge.textContent = active ? 'SEES' : 'VÄLJAS';
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
      generateLoopRouteForSteps(val);
      popover.classList.remove('open');
    });
  });

  document.getElementById('generateSmartRouteBtn').addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || fallback);
    lastTargetSteps = targetSteps;
    generateLoopRouteForSteps(targetSteps);
    popover.classList.remove('open');
  });

  document.getElementById('shuffleRoutePopoverBtn').addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || lastTargetSteps || fallback);
    lastTargetSteps = targetSteps;
    generateLoopRouteForSteps(targetSteps);
  });

  floatingShuffleBtn.addEventListener('click', () => {
    const fallback = getMissingSteps() >= 300 ? getMissingSteps() : 3000;
    const targetSteps = lastTargetSteps || fallback;
    generateLoopRouteForSteps(targetSteps);
  });
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
      way(around:${radius},${startPoint.lat},${startPoint.lng})["lit"="yes"]["highway"!~"motorway|trunk|track|path|bridleway|steps|construction"];
      way(around:${radius},${startPoint.lat},${startPoint.lng})["highway"~"residential|living_street|pedestrian|tertiary|secondary"]["lit"!="no"];
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
  safeNodes = []
) {
  const loopCenter = offsetCoordinate(startPoint, loopRadiusMeters, centerBearingRad);
  const angleA = centerBearingRad + Math.PI;

  const angle1 = angleA + turnSign * (Math.PI * 0.5);
  const angle2 = angleA + turnSign * Math.PI;
  const angle3 = angleA + turnSign * (Math.PI * 1.5);

  let p1 = offsetCoordinate(loopCenter, loopRadiusMeters * aspectRatio, angle1);
  let p2 = offsetCoordinate(loopCenter, loopRadiusMeters * 1.08, angle2);
  let p3 = offsetCoordinate(loopCenter, loopRadiusMeters * aspectRatio, angle3);

  if (safeNodes && safeNodes.length > 0) {
    const snapLimit = Math.max(180, loopRadiusMeters * 0.65);
    p1 = snapPointToSafeStreet(p1, safeNodes, snapLimit);
    p2 = snapPointToSafeStreet(p2, safeNodes, snapLimit);
    p3 = snapPointToSafeStreet(p3, safeNodes, snapLimit);
  }

  return [startPoint, p1, p2, p3];
}

function removeDeadEndSpurs(latlngs) {
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

async function fetchLoopRouteGeometry(pointsList, safeLitOnly) {
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

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.routes && data.routes[0]) {
        return data.routes[0];
      }
    } catch (e) {}
  }
  return null;
}

export async function generateLoopRouteForSteps(targetSteps) {
  if (!map) return;
  const strideMeters = (state.settings.strideCm || 76) / 100;
  const targetMeters = targetSteps * strideMeters;
  const safeLitOnly = state.settings.safeLitOnly !== false;
  lastTargetSteps = targetSteps;

  const startPoint = waypoints.length > 0 ? waypoints[0] : map.getCenter();

  const angleShift = Math.PI * 0.53 + Math.random() * (Math.PI * 0.38);
  lastGeneratedBearing = (lastGeneratedBearing + angleShift) % (2 * Math.PI);

  routeVariantCounter += 1;
  const turnSign = routeVariantCounter % 2 === 0 ? 1 : -1;
  const aspectRatios = [0.95, 0.82, 1.12];
  const aspectRatio = aspectRatios[routeVariantCounter % aspectRatios.length];

  let loopRadiusMeters = Math.max(100, targetMeters / 8.0);

  if (floatingShuffleBtn) {
    floatingShuffleBtn.classList.add('visible');
    floatingShuffleBtn.innerHTML = `${LUCIDE_SVGS.loader}<span>Otsin ohutut ringrada...</span>`;
  }

  const safeNodes = safeLitOnly
    ? await fetchSafeLitStreetNodes(startPoint, loopRadiusMeters)
    : [];

  waypoints = buildTrueCircularWaypoints(
    startPoint,
    loopRadiusMeters,
    lastGeneratedBearing,
    turnSign,
    aspectRatio,
    safeNodes
  );

  try {
    let route = await fetchLoopRouteGeometry(waypoints, safeLitOnly);

    if (route && route.distance > 80) {
      const ratio = targetMeters / route.distance;
      if (ratio < 0.82 || ratio > 1.18) {
        const clampedRatio = Math.max(0.55, Math.min(1.65, ratio));
        loopRadiusMeters = loopRadiusMeters * clampedRatio;
        waypoints = buildTrueCircularWaypoints(
          startPoint,
          loopRadiusMeters,
          lastGeneratedBearing,
          turnSign,
          aspectRatio,
          safeNodes
        );
        const refinedRoute = await fetchLoopRouteGeometry(waypoints, safeLitOnly);
        if (refinedRoute) route = refinedRoute;
      }
    }

    if (route) {
      let latlngs = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
      latlngs = removeDeadEndSpurs(latlngs);

      if (latlngs.length >= 12) {
        const q1 = latlngs[Math.floor(latlngs.length * 0.25)];
        const q2 = latlngs[Math.floor(latlngs.length * 0.5)];
        const q3 = latlngs[Math.floor(latlngs.length * 0.75)];
        waypoints = [startPoint, q1, q2, q3];
      }

      rebuildWaypoints(latlngs, true);
      setPlannedRouteMetrics(targetMeters);
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
