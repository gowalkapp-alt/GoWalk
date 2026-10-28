/* ==========================================================================
   GOWALK PRO — MAP.JS (STABIILNE KAART, TÄPPIS-GPS JA HUD ÜHENDUS)
   ========================================================================== */

import { state, saveState, getMissingSteps } from './state.js';

export let map = null;

let currentTileLayer = null;
let pinAMarker = null;
let waypointMarkers = [];
let waypoints = [];
let routePolyline = null;
let routeGlowPolyline = null;
let lastGeneratedSteps = 0;
let lastLoopAngleRad = null;
let globalRunPrecisionGps = null;

function getInitialStartCoords() {
  try {
    const raw = localStorage.getItem('gowalk_last_precise_gps');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return [parsed.lat, parsed.lng];
      }
    }
  } catch (e) {}
  return [58.3859, 24.4971]; // Pärnu varuasukoht enne GPS-i lukustumist
}

let startCoords = getInitialStartCoords();

const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 20, subdomains: 'abcd' }
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 20, subdomains: 'abcd' }
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19 }
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17 }
  }
};

function injectMapStyles() {
  if (document.getElementById('gw-map-styles')) return;
  const st = document.createElement('style');
  st.id = 'gw-map-styles';
  st.textContent = [
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
    '}'
  ].join('\n');
  document.head.appendChild(st);
}

export function invalidateMapSize() {
  if (map) {
    setTimeout(function () {
      map.invalidateSize();
    }, 100);
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
  currentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(map);

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

function drawRouteLines(coordsLatLng) {
  if (!map || !window.L) return;

  if (routeGlowPolyline) {
    map.removeLayer(routeGlowPolyline);
    routeGlowPolyline = null;
  }
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }

  if (!coordsLatLng || coordsLatLng.length < 2) return;

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
  if (!pointsArray || pointsArray.length < 2) return;

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
      drawRouteLines(latLngs);
      if (fitMapBounds && routePolyline) {
        map.fitBounds(routePolyline.getBounds(), { padding: [54, 54], maxZoom: 17 });
      }
      return;
    }
  } catch (e) {}

  drawRouteLines(pointsArray);
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

export function clearCurrentRoute() {
  waypoints = [];
  lastGeneratedSteps = 0;
  rebuildWaypointMarkers();
  drawRouteLines([]);
}

export function undoLastWaypoint() {
  if (waypoints.length === 0) return;
  waypoints.pop();
  rebuildWaypointMarkers();
  if (waypoints.length === 0) {
    drawRouteLines([]);
  } else {
    const pts = [startCoords].concat(waypoints);
    fetchAndDrawOsrmRoute(pts, false);
  }
}

export function initMapAndRouting(updateHudFn) {
  injectMapStyles();

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

  if (typeof updateHudFn === 'function') {
    updateHudFn();
  }

  if (typeof globalRunPrecisionGps === 'function') {
    setTimeout(function () {
      globalRunPrecisionGps(null, null);
    }, 300);
  }
}

export function setupPrecisionGpsLocator() {
  if (!navigator.geolocation) return;

  const origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  const origWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const origClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);

  let activeRefineWatchId = null;
  let activeRefineTimer = null;
  let hasMovedToRealLocationThisSession = false;

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
        const isDraggable = Boolean(lyr.options.draggable || (lyr.dragging && lyr.dragging._enabled));
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
          }
        }
      },
      function (err) {
        if (!bestPos && typeof errorCallback === 'function') {
          errorCallback(err);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    activeRefineTimer = setTimeout(function () {
      if (bestPos) {
        applyPositionToMapAndPin(bestPos, successCallback);
      } else {
        origGetCurrentPosition(
          function (fallbackPos) {
            applyPositionToMapAndPin(fallbackPos, successCallback);
          },
          function (err) {
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
}

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
      '</div>',
    '</div>',
    '<button type="button" class="gw-rb-cta" id="gwRbCreateBtn"><i data-lucide="sparkles"></i> Loo marsruut</button>'
  ].join('');
  document.body.appendChild(rb);

  let rbSteps = 5000;
  const sliderEl = document.getElementById('gwRbSlider');
  const valEl = document.getElementById('gwRbValText');

  if (sliderEl) {
    sliderEl.addEventListener('input', function () {
      rbSteps = parseInt(sliderEl.value, 10) || 5000;
      valEl.textContent = rbSteps.toLocaleString('et-EE');
    });
  }

  rb.addEventListener('click', function (e) {
    if (e.target.closest('#gwRbCloseBtn')) {
      rb.classList.remove('open');
      if (typeof goHomeFn === 'function') goHomeFn();
      return;
    }
    if (e.target.closest('#gwRbCreateBtn')) {
      rb.classList.remove('open');
      if (typeof goHomeFn === 'function') goHomeFn();
      generateLoopRouteForSteps(rbSteps);
    }
  });
}

export function setupHelpAndGpsGuide() {}
