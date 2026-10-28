/* ==========================================================================
   GOWALK PRO — MAP.JS (VÕTMEVABA TUME KAART, TÄPPIS-GPS & MARSRUUDID)
   ========================================================================== */

import { state, saveState, getMissingSteps } from './state.js';

export let map = null;

let currentTileLayer = null;
let currentLabelsLayer = null;
let pinAMarker = null;
let waypointMarkers = [];
let waypoints = [];
let routePolyline = null;
let routeGlowPolyline = null;
let lastGeneratedSteps = 0;
let lastLoopAngleRad = null;
let globalRunPrecisionGps = null;

// Kui kasutaja on juba varem asukoha lukustanud, avame kaardi kohe seal
function getInitialStartCoords() {
  try {
    const raw = localStorage.getItem('gowalk_last_precise_gps');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.lat === 'number' &&
        typeof parsed.lng === 'number' &&
        !Number.isNaN(parsed.lat) &&
        !Number.isNaN(parsed.lng)
      ) {
        return [parsed.lat, parsed.lng];
      }
    }
  } catch (e) {}
  return [61.17, 25.55]; // Vaikimisi varuasukoht enne GPS-i lukustumist
}

let startCoords = getInitialStartCoords();

// 100% API-võtmevabad kaardiserverid (ei mingit "API KEY REQUIRED" viga)
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      className: 'gw-dark-osm-tiles'
    }
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      className: 'gw-light-osm-tiles'
    }
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19 }
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17 }
  }
};

function injectMapAndHudFixes() {
  if (document.getElementById('gw-map-route-bar-fixes')) return;
  const st = document.createElement('style');
  st.id = 'gw-map-route-bar-fixes';
  st.textContent = [
    /* 1. Midnight Indigo tume filter OSM kaardile (väldib Carto API KEY REQUIRED viga) */
    '.gw-dark-osm-tiles {',
    '  filter: invert(100%) hue-rotate(195deg) brightness(92%) contrast(92%) saturate(130%) !important;',
    '}',
    '.leaflet-container {',
    '  background: #0b0f22 !important;',
    '}',

    /* 2. Tagame, et alumine sammulugeja HUD kaart on alati nähtav */
    '.hud-card, .bottom-hud, #bottomHud {',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  visibility: visible !important;',
    '  opacity: 1 !important;',
    '  z-index: 2200 !important;',
    '  bottom: 74px !important;',
    '}',

    /* 3. Parempoolsete kaardinuppude paigutus ("Maastik" nupust allapoole) */
    '.map-controls, .floating-controls, .right-controls, .map-actions, .map-tools {',
    '  top: 132px !important;',
    '}',

    /* 4. Pin A ja teekonnapunktide ikoonid */
    '.gw-pin-a-marker {',
    '  width: 34px; height: 34px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #7c3aed, #ec4899);',
    '  border: 3px solid #ffffff;',
    '  color: #ffffff; font-weight: 800; font-size: 0.92rem;',
    '  display: flex; align-items: center; justify-content: center;',
    '  box-shadow: 0 4px 16px rgba(236, 72, 153, 0.75);',
    '}',
    '.gw-wp-marker {',
    '  width: 28px; height: 28px; border-radius: 50%;',
    '  background: rgba(124, 58, 237, 0.95);',
    '  border: 2px solid #ffffff;',
    '  color: #ffffff; font-weight: 800; font-size: 0.78rem;',
    '  display: flex; align-items: center; justify-content: center;',
    '  box-shadow: 0 3px 12px rgba(124, 58, 237, 0.65);',
    '}',

    /* 5. "Rada: ... | Teine suund" kasti puhas paigutus HUD kaardi kohal */
    '#routeInfoBar, #routeInfoPill, .route-info-bar, .route-info-pill, .route-summary-pill, .gw-route-bar-fixed {',
    '  position: fixed !important;',
    '  left: 50% !important;',
    '  transform: translateX(-50%) !important;',
    '  bottom: 268px !important;',
    '  width: calc(100% - 24px) !important;',
    '  max-width: 396px !important;',
    '  background: linear-gradient(160deg, rgba(26, 31, 66, 0.96) 0%, rgba(14, 18, 38, 0.98) 100%) !important;',
    '  border: 1px solid rgba(236, 72, 153, 0.55) !important;',
    '  border-radius: 999px !important;',
    '  padding: 6px 10px !important;',
    '  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 18px rgba(168, 85, 247, 0.3) !important;',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: space-between !important;',
    '  gap: 8px !important;',
    '  z-index: 2500 !important;',
    '  box-sizing: border-box !important;',
    '}',
    '#routeInfoBar.hidden, #routeInfoPill.hidden, .route-info-bar.hidden, .gw-route-bar-fixed.hidden {',
    '  display: none !important;',
    '}',
    '#routeInfoText, .route-info-text, .gw-route-bar-text {',
    '  font-size: 0.8rem !important;',
    '  font-weight: 700 !important;',
    '  color: #f8fafc !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '  flex: 1 1 auto !important;',
    '  text-align: left !important;',
    '  padding-left: 4px !important;',
    '}',
    '#altRouteBtn, #changeDirectionBtn, .alt-route-btn, .gw-alt-route-btn {',
    '  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%) !important;',
    '  border: 1px solid rgba(244, 114, 182, 0.65) !important;',
    '  color: #ffffff !important;',
    '  border-radius: 999px !important;',
    '  padding: 6px 12px !important;',
    '  font: 700 0.76rem inherit !important;',
    '  white-space: nowrap !important;',
    '  flex-shrink: 0 !important;',
    '  cursor: pointer !important;',
    '  box-shadow: 0 3px 12px rgba(236, 72, 153, 0.35) !important;',
    '}'
  ].join('\n');
  document.head.appendChild(st);
}

export function alignRouteInfoBarAboveHud() {
  const hudCard = document.querySelector('.hud-card, .bottom-hud, #bottomHud');
  if (hudCard) {
    hudCard.classList.remove('hidden');
  }

  let routeBar =
    document.getElementById('routeInfoBar') ||
    document.getElementById('routeInfoPill') ||
    document.querySelector('.route-info-bar, .route-info-pill, .route-summary-pill, .gw-route-bar-fixed');

  if (!routeBar) {
    const allEls = document.querySelectorAll('button, span, div');
    for (let i = 0; i < allEls.length; i++) {
      const txt = (allEls[i].textContent || '').trim();
      if (txt === 'Teine suund' && allEls[i].parentElement) {
        routeBar = allEls[i].parentElement;
        allEls[i].classList.add('gw-alt-route-btn');
        break;
      }
    }
  }

  if (routeBar && hudCard) {
    routeBar.classList.add('gw-route-bar-fixed');
    const hudRect = hudCard.getBoundingClientRect();
    if (hudRect.height > 40) {
      const bottomPx = Math.max(245, Math.round(window.innerHeight - hudRect.top + 10));
      routeBar.style.setProperty('bottom', bottomPx + 'px', 'important');
    }
  }
}

export function invalidateMapSize() {
  if (map) {
    setTimeout(function () {
      map.invalidateSize();
      alignRouteInfoBarAboveHud();
    }, 120);
  }
}

export function switchMapLayer(layerKey) {
  if (!map || !window.L) return;
  const key = TILE_LAYERS[layerKey] ? layerKey : 'dark';
  const cfg = TILE_LAYERS[key];

  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
    currentTileLayer = null;
  }
  if (currentLabelsLayer) {
    map.removeLayer(currentLabelsLayer);
    currentLabelsLayer = null;
  }

  currentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(map);
  if (cfg.labelsUrl) {
    currentLabelsLayer = L.tileLayer(cfg.labelsUrl, { maxZoom: 19 }).addTo(map);
  }

  if (state && state.settings) {
    state.settings.mapLayer = key;
    saveState();
  }

  const pills = document.querySelectorAll('.map-style-pill, .layer-btn, [data-layer], [data-style]');
  for (let i = 0; i < pills.length; i++) {
    const pKey = pills[i].getAttribute('data-layer') || pills[i].getAttribute('data-style');
    if (pKey) {
      pills[i].classList.toggle('active', pKey === key);
    }
  }

  const selectEl = document.getElementById('settingMapStyle');
  if (selectEl && selectEl.value !== key) {
    selectEl.value = key;
  }
}

function createPinAIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="gw-pin-a-marker">A</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function createWaypointIcon(num) {
  return L.divIcon({
    className: '',
    html: '<div class="gw-wp-marker">' + num + '</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function getOrCreateRouteInfoBar() {
  let bar =
    document.getElementById('routeInfoBar') ||
    document.getElementById('routeInfoPill') ||
    document.querySelector('.route-info-bar, .route-info-pill, .route-summary-pill');

  if (!bar) {
    const allBtns = document.querySelectorAll('button');
    for (let i = 0; i < allBtns.length; i++) {
      if ((allBtns[i].textContent || '').trim().indexOf('Teine suund') !== -1) {
        bar = allBtns[i].parentElement;
        break;
      }
    }
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'routeInfoBar';
    bar.className = 'gw-route-bar-fixed hidden';
    bar.innerHTML = [
      '<span id="routeInfoText" class="gw-route-bar-text">Rada: 0 sammu (0.00 km)</span>',
      '<button type="button" id="altRouteBtn" class="gw-alt-route-btn">Teine suund ↻</button>'
    ].join('');
    document.body.appendChild(bar);

    const altBtn = bar.querySelector('#altRouteBtn');
    if (altBtn) {
      altBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        generateAlternativeRoute();
      });
    }
  } else {
    bar.classList.add('gw-route-bar-fixed');
    const existingAltBtn =
      bar.querySelector('button') ||
      document.getElementById('altRouteBtn') ||
      document.getElementById('changeDirectionBtn');
    if (existingAltBtn && !existingAltBtn.dataset.gwBound) {
      existingAltBtn.dataset.gwBound = '1';
      existingAltBtn.classList.add('gw-alt-route-btn');
      existingAltBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        generateAlternativeRoute();
      });
    }
  }

  alignRouteInfoBarAboveHud();
  return bar;
}

function updateRouteSummaryBar(distanceMeters) {
  const bar = getOrCreateRouteInfoBar();
  if (!bar) return;

  if (!distanceMeters || distanceMeters <= 0) {
    bar.classList.add('hidden');
    bar.style.setProperty('display', 'none', 'important');
    return;
  }

  const strideMeters = ((state.settings && state.settings.strideCm) || 76) / 100;
  const steps = Math.round(distanceMeters / strideMeters);
  const km = (distanceMeters / 1000).toFixed(2);

  let textEl =
    bar.querySelector('#routeInfoText, .route-info-text, .gw-route-bar-text') ||
    bar.querySelector('span');

  if (textEl) {
    textEl.classList.add('gw-route-bar-text');
    textEl.textContent = 'Rada: ' + steps.toLocaleString('et-EE') + ' sammu (' + km + ' km)';
  }

  bar.classList.remove('hidden');
  bar.style.setProperty('display', 'flex', 'important');
  alignRouteInfoBarAboveHud();
}

function drawRouteLines(coordsLatLng, distanceMeters) {
  if (!map || !window.L) return;

  if (routeGlowPolyline) {
    map.removeLayer(routeGlowPolyline);
    routeGlowPolyline = null;
  }
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }

  if (!coordsLatLng || coordsLatLng.length < 2) {
    updateRouteSummaryBar(0);
    return;
  }

  routeGlowPolyline = L.polyline(coordsLatLng, {
    color: '#ec4899',
    weight: 12,
    opacity: 0.28,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  routePolyline = L.polyline(coordsLatLng, {
    color: '#a855f7',
    weight: 5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  updateRouteSummaryBar(distanceMeters);
}

function rebuildWaypointMarkers() {
  if (!map || !window.L) return;
  for (let i = 0; i < waypointMarkers.length; i++) {
    map.removeLayer(waypointMarkers[i]);
  }
  waypointMarkers = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const m = L.marker(wp, { icon: createWaypointIcon(i + 1) }).addTo(map);
    waypointMarkers.push(m);
  }
}

async function fetchAndDrawOsrmRoute(pointsArray, fitMapBounds) {
  if (!pointsArray || pointsArray.length < 2) {
    drawRouteLines([], 0);
    return;
  }

  const coordString = pointsArray
    .map(function (pt) {
      return pt[1].toFixed(6) + ',' + pt[0].toFixed(6);
    })
    .join(';');

  const url =
    'https://router.project-osrm.org/route/v1/foot/' +
    coordString +
    '?overview=full&geometries=geojson';

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.routes && data.routes[0]) {
      const route = data.routes[0];
      const latLngs = route.geometry.coordinates.map(function (c) {
        return [c[1], c[0]];
      });
      drawRouteLines(latLngs, route.distance);
      if (fitMapBounds && routePolyline) {
        map.fitBounds(routePolyline.getBounds(), { padding: [54, 54], maxZoom: 17 });
      }
      return;
    }
  } catch (e) {}

  let fallbackDist = 0;
  for (let i = 1; i < pointsArray.length; i++) {
    fallbackDist += map.distance(pointsArray[i - 1], pointsArray[i]);
  }
  drawRouteLines(pointsArray, fallbackDist * 1.25);
}

export async function generateLoopRouteForSteps(targetSteps, routeTypeOverride, numStopsOverride) {
  if (!map || !window.L) return;

  const steps = Math.max(300, parseInt(targetSteps, 10) || 3000);
  lastGeneratedSteps = steps;

  const strideMeters = ((state.settings && state.settings.strideCm) || 76) / 100;
  const targetDistanceMeters = steps * strideMeters;

  const effectiveCircumference = targetDistanceMeters / 1.38;
  const radiusMeters = Math.max(80, effectiveCircumference / (2 * Math.PI));

  if (lastLoopAngleRad === null) {
    lastLoopAngleRad = Math.random() * 2 * Math.PI;
  } else {
    lastLoopAngleRad = (lastLoopAngleRad + (95 * Math.PI) / 180) % (2 * Math.PI);
  }

  const baseAngle = lastLoopAngleRad;
  const stopsCount = Math.max(2, Math.min(6, parseInt(numStopsOverride, 10) || 3));

  const lat0 = startCoords[0];
  const lng0 = startCoords[1];
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);

  const centerLat = lat0 + (radiusMeters * Math.cos(baseAngle)) / metersPerDegLat;
  const centerLng = lng0 + (radiusMeters * Math.sin(baseAngle)) / metersPerDegLng;

  const startAngleFromCenter = baseAngle + Math.PI;
  const generatedWaypoints = [];

  for (let i = 1; i <= stopsCount; i++) {
    const frac = i / (stopsCount + 1);
    const theta = startAngleFromCenter + frac * 2 * Math.PI;
    const wpLat = centerLat + (radiusMeters * Math.cos(theta)) / metersPerDegLat;
    const wpLng = centerLng + (radiusMeters * Math.sin(theta)) / metersPerDegLng;
    generatedWaypoints.push([wpLat, wpLng]);
  }

  waypoints = generatedWaypoints;
  rebuildWaypointMarkers();

  const fullLoopPoints = [startCoords].concat(waypoints).concat([startCoords]);
  await fetchAndDrawOsrmRoute(fullLoopPoints, true);
}

export function generateAlternativeRoute() {
  const stepsToUse = lastGeneratedSteps > 0 ? lastGeneratedSteps : Math.max(1500, getMissingSteps());
  return generateLoopRouteForSteps(stepsToUse);
}

export function clearCurrentRoute() {
  waypoints = [];
  lastGeneratedSteps = 0;
  rebuildWaypointMarkers();
  drawRouteLines([], 0);
}

export function undoLastWaypoint() {
  if (waypoints.length === 0) return;
  waypoints.pop();
  rebuildWaypointMarkers();
  if (waypoints.length === 0) {
    drawRouteLines([], 0);
  } else {
    const pts = [startCoords].concat(waypoints);
    fetchAndDrawOsrmRoute(pts, false);
  }
}

export function initMapAndRouting(updateHudFn) {
  injectMapAndHudFixes();

  const mapContainer = document.getElementById('map');
  if (!mapContainer || !window.L) return;

  if (!map) {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView(startCoords, 15);
  }

  const initialLayer = (state.settings && state.settings.mapLayer) || 'dark';
  switchMapLayer(initialLayer);

  pinAMarker = L.marker(startCoords, {
    draggable: true,
    icon: createPinAIcon()
  }).addTo(map);

  pinAMarker.on('dragend', function () {
    const pos = pinAMarker.getLatLng();
    startCoords = [pos.lat, pos.lng];
    if (waypoints.length > 0) {
      const pts = [startCoords].concat(waypoints).concat([startCoords]);
      fetchAndDrawOsrmRoute(pts, false);
    }
  });

  map.on('click', function (e) {
    waypoints.push([e.latlng.lat, e.latlng.lng]);
    rebuildWaypointMarkers();
    const pts = [startCoords].concat(waypoints);
    fetchAndDrawOsrmRoute(pts, false);
  });

  const layerPills = document.querySelectorAll('.map-style-pill, .layer-btn, [data-layer], [data-style]');
  for (let i = 0; i < layerPills.length; i++) {
    layerPills[i].addEventListener('click', function () {
      const lKey = this.getAttribute('data-layer') || this.getAttribute('data-style') || 'dark';
      switchMapLayer(lKey);
    });
  }

  const undoBtn =
    document.getElementById('undoWaypointBtn') ||
    document.getElementById('undoRouteBtn') ||
    document.getElementById('undoBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', function (e) {
      e.preventDefault();
      undoLastWaypoint();
    });
  }

  const clearBtn =
    document.getElementById('clearRouteBtn') ||
    document.getElementById('deleteRouteBtn') ||
    document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      clearCurrentRoute();
    });
  }

  getOrCreateRouteInfoBar();

  if (typeof updateHudFn === 'function') {
    updateHudFn();
  }

  // Küsi kohe äpi avamisel kasutaja päris asukohta
  if (typeof globalRunPrecisionGps === 'function') {
    setTimeout(function () {
      globalRunPrecisionGps(null, null);
    }, 300);
  }
}

/* ==========================================================================
   TÄPPIS-GPS MOOTOR & AUTOMAATNE ASUKOHA TUVASTUS AVAMISEL
   ========================================================================== */

export function setupPrecisionGpsLocator() {
  injectMapAndHudFixes();

  window.addEventListener('resize', alignRouteInfoBarAboveHud);
  document.addEventListener('click', function () {
    setTimeout(alignRouteInfoBarAboveHud, 80);
    setTimeout(alignRouteInfoBarAboveHud, 450);
  });

  if (!navigator.geolocation) return;

  const origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  const origWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const origClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);

  let activeRefineWatchId = null;
  let activeRefineTimer = null;
  let toastHideTimer = null;
  let hasMovedToRealLocationThisSession = false;

  function getGpsToast() {
    let t = document.getElementById('gwGpsStatusToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gwGpsStatusToast';
      t.className = 'gw-gps-toast';
      t.innerHTML =
        '<span class="gw-gps-dot"></span><span id="gwGpsToastText">Otsin sinu asukohta...</span>';
      document.body.appendChild(t);
    }
    return t;
  }

  function showGpsToast(msg, isLocked) {
    const t = getGpsToast();
    const txt = document.getElementById('gwGpsToastText');
    if (txt) txt.textContent = msg;
    t.classList.toggle('locked', Boolean(isLocked));
    t.classList.add('visible');
    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (isLocked) {
      toastHideTimer = setTimeout(function () {
        t.classList.remove('visible');
      }, 2800);
    }
  }

  function findLocateButton() {
    const byId =
      document.getElementById('locateBtn') ||
      document.getElementById('locateMeBtn') ||
      document.getElementById('gpsBtn') ||
      document.getElementById('centerMapBtn');
    if (byId) return byId;

    const iconEl = document.querySelector(
      '[data-lucide="crosshair"], [data-lucide="locate"], [data-lucide="locate-fixed"], svg.lucide-crosshair, svg.lucide-locate, svg.lucide-locate-fixed'
    );
    if (iconEl) return iconEl.closest('button');
    return null;
  }

  function setGpsButtonAnimating(active) {
    const btn = findLocateButton();
    if (!btn) return;
    btn.classList.toggle('gw-gps-searching', Boolean(active));
  }

  function movePinAMarkerOnMap(lat, lng) {
    startCoords = [lat, lng];
    if (pinAMarker && typeof pinAMarker.setLatLng === 'function') {
      pinAMarker.setLatLng([lat, lng]);
    }
    if (!window.L || !map || !map._layers) return;
    const latlng = L.latLng(lat, lng);
    const layerIds = Object.keys(map._layers);

    for (let i = 0; i < layerIds.length; i++) {
      const lyr = map._layers[layerIds[i]];
      if (lyr && typeof lyr.setLatLng === 'function' && lyr.options && lyr.options.icon) {
        const htmlStr = String((lyr.options.icon.options && lyr.options.icon.options.html) || '');
        const isDraggable = Boolean(
          lyr.options.draggable || (lyr.dragging && lyr.dragging._enabled)
        );
        if (isDraggable || htmlStr.indexOf('>A<') !== -1 || htmlStr.indexOf('pin-a') !== -1) {
          lyr.setLatLng(latlng);
          break;
        }
      }
    }
  }

  function stopActiveRefinement() {
    if (activeRefineWatchId !== null) {
      origClearWatch(activeRefineWatchId);
      activeRefineWatchId = null;
    }
    if (activeRefineTimer) {
      clearTimeout(activeRefineTimer);
      activeRefineTimer = null;
    }
    setGpsButtonAnimating(false);
  }

  function applyPositionToMapAndPin(pos, callbackFn) {
    hasMovedToRealLocationThisSession = true;
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    movePinAMarkerOnMap(lat, lng);
    if (map) {
      map.setView([lat, lng], Math.max(map.getZoom() || 15, 16), { animate: true });
    }
    if (typeof callbackFn === 'function') {
      callbackFn(pos);
    }
    try {
      localStorage.setItem(
        'gowalk_last_precise_gps',
        JSON.stringify({ lat: lat, lng: lng, acc: pos.coords.accuracy, ts: Date.now() })
      );
    } catch (e) {}
  }

  function runHighPrecisionLocationLock(successCallback, errorCallback) {
    stopActiveRefinement();
    setGpsButtonAnimating(true);
    showGpsToast('Otsin sinu täpset asukohta...', false);

    let bestPos = null;
    let bestAccuracy = Infinity;

    activeRefineWatchId = origWatchPosition(
      function (pos) {
        const acc = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : 999;

        if (!hasMovedToRealLocationThisSession || !bestPos || acc < bestAccuracy) {
          bestAccuracy = Math.min(bestAccuracy, acc);
          bestPos = pos;
          applyPositionToMapAndPin(pos, successCallback);

          if (acc <= 20) {
            stopActiveRefinement();
            showGpsToast('Täpne asukoht lukustatud (±' + Math.round(acc) + ' m) ✓', true);
          } else {
            showGpsToast('Täpsustan GPS-signaali (±' + Math.round(acc) + ' m)...', false);
          }
        }
      },
      function (err) {
        if (!bestPos && typeof errorCallback === 'function') {
          errorCallback(err);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );

    activeRefineTimer = setTimeout(function () {
      if (bestPos) {
        applyPositionToMapAndPin(bestPos, successCallback);
        showGpsToast('Asukoht leitud (±' + Math.round(bestAccuracy) + ' m) ✓', true);
      } else {
        origGetCurrentPosition(
          function (fallbackPos) {
            applyPositionToMapAndPin(fallbackPos, successCallback);
            showGpsToast('Asukoht leitud ✓', true);
          },
          function (err) {
            showGpsToast('Kontrolli, et asukoht on brauseris lubatud', true);
            if (typeof errorCallback === 'function') errorCallback(err);
          },
          { enableHighAccuracy: false, maximumAge: 60000, timeout: 6000 }
        );
      }
      stopActiveRefinement();
    }, 6000);
  }

  globalRunPrecisionGps = runHighPrecisionLocationLock;

  navigator.geolocation.getCurrentPosition = function (success, error) {
    runHighPrecisionLocationLock(success, error);
  };

  document.addEventListener(
    'click',
    function (e) {
      const locateBtn = findLocateButton();
      if (locateBtn && locateBtn.contains(e.target)) {
        e.preventDefault();
        runHighPrecisionLocationLock(null, null);
      }
    },
    true
  );
}

/* ==========================================================================
   "LOO JALUTUSRING" TÄISVAATE MOODUL
   ========================================================================== */

export function setupRouteBuilderModal(appState, getMissingStepsFn, goHomeFn) {
  if (document.getElementById('gwRouteBuilderModal')) return;

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
  let rbType = 'loop';

  const sliderEl = document.getElementById('gwRbSlider');
  const valEl = document.getElementById('gwRbValText');
  const unitEl = document.getElementById('gwRbUnitText');

  function updateRbDisplay() {
    const strideM = ((appState.settings && appState.settings.strideCm) || 76) / 100;
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
      if (typeof goHomeFn === 'function') goHomeFn();
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
      rbType = tCard.getAttribute('data-rtype') || 'loop';
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
      rbStops = Math.min(6, rbStops + 1);
      document.getElementById('gwStopCount').textContent = String(rbStops);
      return;
    }
    if (e.target.closest('#gwRbCreateBtn')) {
      const currentSliderSteps = parseInt(sliderEl.value, 10) || rbSteps || 5000;
      rb.classList.remove('open');
      if (typeof goHomeFn === 'function') goHomeFn();
      generateLoopRouteForSteps(currentSliderSteps, rbType, rbStops);
    }
  });
}

/* ==========================================================================
   ABI & KASUTUSJUHEND + TÄPSE GPS-I SEADISTUSJUHEND
   ========================================================================== */

export function setupHelpAndGpsGuide() {
  const helpModal = document.getElementById('helpModal');
  if (!helpModal) return;

  const bodyEl =
    helpModal.querySelector('.subview-body') ||
    helpModal.querySelector('.modal-body') ||
    helpModal;

  if (!bodyEl || document.getElementById('gwHelpGuideWrap')) return;

  bodyEl.innerHTML = [
    '<div class="gw-help-wrap" id="gwHelpGuideWrap">',
      '<div class="gw-help-card gps-highlight">',
        '<div class="gw-help-head">',
          '<div class="gw-help-ico"><i data-lucide="crosshair"></i></div>',
          '<div>',
            '<div class="gw-help-title">Täpne GPS-asukoht (Toas & õues)</div>',
            '<span class="gw-help-badge">Oluline täpse ringi loomiseks</span>',
          '</div>',
        '</div>',
        '<p class="gw-help-desc">',
          'Et GoWalk leiaks ka toas diivanil marsruuti koostades sinu täpse asukoha, veendu, et telefonis on sisse lülitatud <strong>Täpne asukoht (Precise Location)</strong>:',
        '</p>',
        '<div class="gw-gps-os-tabs">',
          '<button type="button" class="gw-gps-os-tab active" data-gpsos="android"><i data-lucide="smartphone"></i> Android / Samsung</button>',
          '<button type="button" class="gw-gps-os-tab" data-gpsos="ios"><i data-lucide="compass"></i> iPhone (Safari)</button>',
        '</div>',
        '<div id="gwGpsGuideAndroid" class="gw-gps-steps">',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">1</span>',
            '<div>Ava telefoni <strong>Seaded (Settings)</strong> → <strong>Asukoht (Location)</strong> ja kontrolli, et asukoht on sees.</div>',
          '</div>',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">2</span>',
            '<div>Vajuta <strong>Asukoha täpsuse parandamine (Improve accuracy)</strong> ning lülita sisse <strong>Wi-Fi otsimine</strong> ja <strong>Bluetoothi otsimine</strong>.</div>',
          '</div>',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">3</span>',
            '<div><strong>Chrome / Samsung Internet:</strong> vajuta aadressiribal luku ikoonile → <strong>Load (Permissions)</strong> → <strong>Asukoht</strong> ja lülita sisse <strong>Täpne asukoht (Use precise location)</strong>.</div>',
          '</div>',
        '</div>',
        '<div id="gwGpsGuideIos" class="gw-gps-steps" style="display:none;">',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">1</span>',
            '<div>Ava iPhone\'i <strong>Settings</strong> → <strong>Privacy & Security</strong> → <strong>Location Services</strong>.</div>',
          '</div>',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">2</span>',
            '<div>Keri alla ja vali <strong>Safari Websites</strong> (või <strong>Chrome</strong>).</div>',
          '</div>',
          '<div class="gw-gps-step">',
            '<span class="gw-gps-snum">3</span>',
            '<div>Vali <strong>While Using the App</strong> ja lülita sisse <strong>Precise Location (Täpne asukoht)</strong>.</div>',
          '</div>',
        '</div>',
        '<button type="button" class="gw-gps-test-btn" id="gwTestGpsNowBtn">',
          '<i data-lucide="locate-fixed"></i>',
          '<span>Testi ja lukusta täpne GPS kohe</span>',
        '</button>',
      '</div>',
      '<div class="gw-help-card">',
        '<div class="gw-help-head">',
          '<div class="gw-help-ico"><i data-lucide="map-pin"></i></div>',
          '<div class="gw-help-title">Alguspunkti (Pin A) liigutamine</div>',
        '</div>',
        '<p class="gw-help-desc">',
          'Hoia näppu alguspunktil (<strong>A</strong>) ja lohista see kaardil täpselt sinna, kust soovid oma jalutuskäiku alustada, või vajuta paremal servas <strong>GPS-sihiku nupule</strong>.',
        '</p>',
      '</div>',
      '<div class="gw-help-card">',
        '<div class="gw-help-head">',
          '<div class="gw-help-ico"><i data-lucide="route"></i></div>',
          '<div class="gw-help-title">Loo jalutusring & Teine suund</div>',
        '</div>',
        '<p class="gw-help-desc">',
          'Ava alt ribalt <strong>Marsruudid</strong> ja vali soovitud sammude arv. Kui soovid ringi teises ilmakaares, vajuta kaardil nupule <strong>Teine suund</strong>.',
        '</p>',
      '</div>',
    '</div>'
  ].join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }

  bodyEl.addEventListener('click', function (e) {
    const osTab = e.target.closest('.gw-gps-os-tab');
    if (osTab) {
      const targetOs = osTab.getAttribute('data-gpsos');
      const allTabs = bodyEl.querySelectorAll('.gw-gps-os-tab');
      for (let i = 0; i < allTabs.length; i++) allTabs[i].classList.remove('active');
      osTab.classList.add('active');

      const androidPane = document.getElementById('gwGpsGuideAndroid');
      const iosPane = document.getElementById('gwGpsGuideIos');
      if (androidPane) androidPane.style.display = targetOs === 'android' ? 'flex' : 'none';
      if (iosPane) iosPane.style.display = targetOs === 'ios' ? 'flex' : 'none';
      return;
    }

    if (e.target.closest('#gwTestGpsNowBtn')) {
      helpModal.classList.remove('open');
      if (typeof globalRunPrecisionGps === 'function') {
        globalRunPrecisionGps(null, null);
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupHelpAndGpsGuide);
} else {
  setupHelpAndGpsGuide();
}
