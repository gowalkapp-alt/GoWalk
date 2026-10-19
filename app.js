// =========================================================
// 1. SUPABASE SEADISTUS
// =========================================================
const SUPABASE_URL = 'https://bktvebmplrabwbgwawao.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO'; // <-- Pane oma Supabase Publishable Key siia!

let supabaseClient = null;
if (window.supabase && SUPABASE_KEY !== 'KLEEBI_OMA_PUBLISHABLE_KEY_SIIA') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Globaalsed olekud
let currentUser = null;
let userDisplayName = '';
let authMode = 'login';

// Kaardi ja marsruudi olekud
let map = null;
let currentTileLayer = null;
let currentMapStyle = 'dark';
let routeLayer = null;
let userMarker = null;
let waypoints = []; // [{ lat, lng, marker }]
let returnToStart = true;
let userCoords = { lat: 58.3859, lng: 24.4971 }; // Vaikimisi Pärnu, kuni GPS leiab asukoha

// Sammulugeja ja taimeri olekud
let isTracking = false;
let completedBaseSteps = 0; // Kasutaja käsitsi sisestatud juba tehtud sammud
let liveSteps = 0;          // Treeningu käigus kogutud sammud
let startTime = null;
let timerInterval = null;
let wakeLockSentinel = null;
let lastAccelTime = 0;
let deferredPwaPrompt = null;

// Google Mapsi paanide kihid (töötavad ilma API võtmeta)
const MAP_STYLES = {
  dark: {
    name: '🌙 Tume',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    className: 'gmap-dark-tiles',
    attribution: '&copy; Google Maps'
  },
  light: {
    name: '☀️ Hele',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    className: '',
    attribution: '&copy; Google Maps'
  },
  hybrid: {
    name: '🛰️ Hübriid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    className: '',
    attribution: '&copy; Google Maps Satellite'
  },
  terrain: {
    name: '⛰️ Maastik',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    className: '',
    attribution: '&copy; Google Maps Terrain'
  }
};

// =========================================================
// 2. RAKENDUSE KÄIVITAMINE JA DÜNAAMILINE UI
// =========================================================
window.addEventListener('DOMContentLoaded', async () => {
  injectCustomStylesAndControls();
  loadSavedSettings();
  setupInputListeners();
  setupPwaInstallListener();

  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      showAppView();
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      if (currentUser) {
        showAppView();
      }
    });
  }
});

// Lisame automaatselt puuduvad UI elemendid ja stiilid, et index.html faili ei peaks muutma
function injectCustomStylesAndControls() {
  const style = document.createElement('style');
  style.textContent = `
    /* Puhas Google Mapsi tume režiim ainult tumeda kaardikihi plaatidele */
    .leaflet-layer .gmap-dark-tiles {
      filter: invert(90%) hue-rotate(180deg) brightness(92%) contrast(92%);
    }
    .map-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
      justify-content: space-between;
      align-items: center;
    }
    .map-style-group, .map-action-group {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .map-chip-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #e2e8f0;
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .map-chip-btn.active {
      background: linear-gradient(135deg, #ff1e8e, #9333ea);
      border-color: #ff1e8e;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(255, 30, 142, 0.4);
    }
    .map-chip-btn:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .map-info-bar {
      font-size: 12px;
      color: #cbd5e1;
      background: rgba(15, 10, 30, 0.75);
      border: 1px solid rgba(255, 30, 142, 0.25);
      border-radius: 10px;
      padding: 8px 12px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .custom-pin-start {
      width: 28px;
      height: 28px;
      background: #ff1e8e;
      border: 3px solid #ffffff;
      border-radius: 50%;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 10px rgba(255, 30, 142, 0.7);
    }
    .custom-pin-wp {
      width: 26px;
      height: 26px;
      background: #8b5cf6;
      border: 2px solid #ffffff;
      border-radius: 50%;
      color: #ffffff;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    }
    .extra-steps-row {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .extra-steps-row label {
      font-size: 13px;
      color: #cbd5e1;
      flex: 1;
    }
    .extra-steps-row input {
      width: 120px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 8px 10px;
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
    }
    .user-profile-pill {
      background: rgba(255, 30, 142, 0.15);
      border: 1px solid rgba(255, 30, 142, 0.4);
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  // 1. Lisame "Juba tehtud sammud" välja sammude eesmärgi juurde
  const targetInput = document.getElementById('target-steps');
  if (targetInput && !document.getElementById('completed-steps-input')) {
    const parentGrid = targetInput.closest('.input-grid') || targetInput.parentElement.parentElement;
    if (parentGrid) {
      const extraRow = document.createElement('div');
      extraRow.className = 'extra-steps-row';
      extraRow.innerHTML = `
        <label for="completed-steps-input">✅ Juba tehtud sammud (täna):</label>
        <input type="number" id="completed-steps-input" value="0" min="0" step="100" />
      `;
      parentGrid.insertAdjacentElement('afterend', extraRow);
    }
  }

  // 2. Lisame kaardi kohale stiilivaliku (Hele, Tume, Hübriid, Maastik) ja punktide tööriistad
  const mapEl = document.getElementById('map');
  if (mapEl && !document.getElementById('map-custom-toolbar')) {
    const toolbar = document.createElement('div');
    toolbar.id = 'map-custom-toolbar';
    toolbar.innerHTML = `
      <div class="map-toolbar">
        <div class="map-style-group">
          <button type="button" class="map-chip-btn active" data-style="dark" onclick="setMapStyle('dark')">🌙 Tume</button>
          <button type="button" class="map-chip-btn" data-style="light" onclick="setMapStyle('light')">☀️ Hele</button>
          <button type="button" class="map-chip-btn" data-style="hybrid" onclick="setMapStyle('hybrid')">🛰️ Hübriid</button>
          <button type="button" class="map-chip-btn" data-style="terrain" onclick="setMapStyle('terrain')">⛰️ Maastik</button>
        </div>
        <div class="map-action-group">
          <button type="button" class="map-chip-btn" id="loop-mode-btn" onclick="toggleLoopMode()">🔄 Ring: SEES</button>
          <button type="button" class="map-chip-btn" onclick="centerOnUserGPS()">🎯 GPS</button>
          <button type="button" class="map-chip-btn" onclick="clearWaypoints()">🗑️ Puhasta</button>
        </div>
      </div>
      <div class="map-info-bar" id="map-helper-bar">
        <span>💡 <b>Lohista roosat punkti (A)</b> või <b>kliki kaardil</b> vahepunktide lisamiseks.</span>
        <span id="route-summary-badge"></span>
      </div>
    `;
    mapEl.insertAdjacentElement('beforebegin', toolbar);
  }

  // 3. Lisame päisesse kasutaja nime märgise (kui seda veel pole)
  const streakBadge = document.getElementById('streak-count')?.parentElement;
  if (streakBadge && !document.getElementById('user-name-pill')) {
    const pill = document.createElement('button');
    pill.id = 'user-name-pill';
    pill.type = 'button';
    pill.className = 'user-profile-pill';
    pill.textContent = '👤 Profiil';
    pill.title = 'Kliki nime muutmiseks';
    pill.onclick = promptChangeUserName;
    streakBadge.insertAdjacentElement('beforebegin', pill);
  }
}

function setupInputListeners() {
  const targetEl = document.getElementById('target-steps');
  const strideEl = document.getElementById('stride-length');
  const completedEl = document.getElementById('completed-steps-input');

  if (targetEl) {
    targetEl.addEventListener('input', () => {
      localStorage.setItem('gowalk_target_steps', targetEl.value);
      updateDistancePreview();
      updateLiveTrackerUI();
    });
  }

  if (completedEl) {
    completedEl.addEventListener('input', (e) => {
      completedBaseSteps = Math.max(0, parseInt(e.target.value, 10) || 0);
      localStorage.setItem('gowalk_completed_base', completedBaseSteps);
      updateDistancePreview();
      updateLiveTrackerUI();
    });
  }

  if (strideEl) {
    strideEl.addEventListener('input', (e) => {
      localStorage.setItem('gowalk_stride', e.target.value);
      updateDistancePreview();
      updateLiveTrackerUI();
    });
  }

  const genderEl = document.getElementById('calc-gender');
  const heightEl = document.getElementById('calc-height');
  if (genderEl) genderEl.addEventListener('change', previewCalculatedStride);
  if (heightEl) heightEl.addEventListener('input', previewCalculatedStride);

  updateDistancePreview();
  updateLiveTrackerUI();
}

// =========================================================
// 3. AUTENTIMINE JA KASUTAJA PROFIIL
// =========================================================
function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent =
    mode === 'login' ? 'Logi sisse' : 'Loo konto';
  setAuthMessage('');
}

function setAuthMessage(msg, isError = false) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#ff4d6d' : '#10b981';
}

async function handleEmailAuth(e) {
  e.preventDefault();
  if (!supabaseClient) {
    setAuthMessage('Lisa esmalt app.js faili oma Supabase Publishable key või kasuta testvaadet!', true);
    return;
  }

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  setAuthMessage('Ühendan...');

  if (authMode === 'signup') {
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return setAuthMessage(error.message, true);
    setAuthMessage('Konto loodud! Kontrolli e-posti või logi sisse.');
  } else {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return setAuthMessage(error.message, true);
  }
}

async function handleGoogleLogin() {
  if (!supabaseClient) {
    setAuthMessage('Lisa esmalt app.js faili oma Supabase Publishable key!', true);
    return;
  }

  const redirectToUrl = 'https://gowalk-eight.vercel.app/';

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectToUrl }
  });

  if (error) {
    setAuthMessage(error.message, true);
  }
}

function enterGuestMode() {
  currentUser = { id: 'guest', email: 'külaline' };
  showAppView();
}

async function handleLogout() {
  if (supabaseClient && currentUser?.id !== 'guest') {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  document.getElementById('app-view').classList.remove('active');
  document.getElementById('auth-view').classList.add('active');
}

function showAppView() {
  document.getElementById('auth-view').classList.remove('active');
  document.getElementById('app-view').classList.add('active');
  initMap();
  loadUserProfile();
  loadWalkHistory();
}

function switchAppTab(tab) {
  document.getElementById('nav-walk').classList.toggle('active', tab === 'walk');
  document.getElementById('nav-stats').classList.toggle('active', tab === 'stats');
  document.getElementById('tab-content-walk').classList.toggle('active', tab === 'walk');
  document.getElementById('tab-content-stats').classList.toggle('active', tab === 'stats');
  if (tab === 'walk' && map) {
    setTimeout(() => map.invalidateSize(), 150);
  } else if (tab === 'stats') {
    loadWalkHistory();
  }
}

function updateHeaderUserName() {
  const pill = document.getElementById('user-name-pill');
  if (!pill) return;

  const savedCustomName = localStorage.getItem('gowalk_custom_name');
  const metaName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    (currentUser?.email ? currentUser.email.split('@')[0] : 'Külaline');

  userDisplayName = savedCustomName || metaName || 'Kasutaja';
  pill.textContent = `👤 ${userDisplayName}`;
}

async function promptChangeUserName() {
  const newName = prompt('Sisesta oma nimi või hüüdnimi:', userDisplayName || '');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (trimmed) {
    localStorage.setItem('gowalk_custom_name', trimmed);
    updateHeaderUserName();
  }
}

// =========================================================
// 4. SAMMUPIKKUSE JA EESMÄRGI ARVUTAMINE
// =========================================================
function loadSavedSettings() {
  const savedStride = localStorage.getItem('gowalk_stride');
  if (savedStride) {
    document.getElementById('stride-length').value = savedStride;
  }

  const savedTarget = localStorage.getItem('gowalk_target_steps');
  if (savedTarget) {
    document.getElementById('target-steps').value = savedTarget;
  }

  const savedCompleted = localStorage.getItem('gowalk_completed_base');
  if (savedCompleted) {
    completedBaseSteps = parseInt(savedCompleted, 10) || 0;
    const compInput = document.getElementById('completed-steps-input');
    if (compInput) compInput.value = completedBaseSteps;
  }
}

function previewCalculatedStride() {
  const gender = document.getElementById('calc-gender').value;
  const height = parseFloat(document.getElementById('calc-height').value) || 175;
  const factor = gender === 'male' ? 0.415 : 0.413;
  const stride = Math.round(height * factor);
  document.getElementById('calc-result-preview').textContent = `${stride} cm`;
  return stride;
}

async function applyCalculatedStride() {
  const stride = previewCalculatedStride();
  const gender = document.getElementById('calc-gender').value;
  const height = parseInt(document.getElementById('calc-height').value, 10) || 175;

  document.getElementById('stride-length').value = stride;
  localStorage.setItem('gowalk_stride', stride);
  updateDistancePreview();
  updateLiveTrackerUI();
  closeModal('stride-modal');

  if (supabaseClient && currentUser && currentUser.id !== 'guest') {
    await supabaseClient.from('profiles').upsert({
      id: currentUser.id,
      gender,
      height_cm: height,
      stride_cm: stride,
      updated_at: new Date().toISOString()
    });
  }
}

async function loadUserProfile() {
  updateHeaderUserName();
  if (!supabaseClient || !currentUser || currentUser.id === 'guest') return;

  const { data } = await supabaseClient
    .from('profiles')
    .select('stride_cm, height_cm, gender')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (data?.stride_cm) {
    document.getElementById('stride-length').value = data.stride_cm;
    localStorage.setItem('gowalk_stride', data.stride_cm);
  }
  if (data?.height_cm && document.getElementById('calc-height')) {
    document.getElementById('calc-height').value = data.height_cm;
  }
  if (data?.gender && document.getElementById('calc-gender')) {
    document.getElementById('calc-gender').value = data.gender;
  }
  updateDistancePreview();
  updateLiveTrackerUI();
}

function getRemainingStepsNeeded() {
  const targetSteps = parseInt(document.getElementById('target-steps').value, 10) || 0;
  const totalDone = completedBaseSteps + liveSteps;
  return Math.max(0, targetSteps - totalDone);
}

function updateDistancePreview() {
  const targetSteps = parseInt(document.getElementById('target-steps').value, 10) || 0;
  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const totalDone = completedBaseSteps + liveSteps;
  const remainingSteps = Math.max(0, targetSteps - totalDone);

  // Kui kasutaja on sisestanud tehtud sammud, näitame puuduolevat distantsi (või kogu eesmärki, kui tehtud on 0)
  const stepsToCalculate = totalDone > 0 && remainingSteps > 0 ? remainingSteps : targetSteps;
  const km = (stepsToCalculate * (strideCm / 100)) / 1000;
  const minutes = Math.max(1, Math.round(km * 10));

  const kmEl = document.getElementById('estimated-km');
  const minEl = document.getElementById('estimated-min');

  if (kmEl && minEl) {
    if (totalDone > 0 && remainingSteps > 0) {
      kmEl.textContent = `${km.toFixed(2)} km (jäänud ${remainingSteps} sammu)`;
    } else if (totalDone >= targetSteps && targetSteps > 0) {
      kmEl.textContent = `0.00 km (eesmärk täidetud! 🎉)`;
    } else {
      kmEl.textContent = `${km.toFixed(2)} km`;
    }
    minEl.textContent = minutes;
  }
}

// =========================================================
// 5. EKRAANI ÄRKVEL HOIDMINE (Screen Wake Lock)
// =========================================================
async function toggleWakeLock(enabled) {
  if (!('wakeLock' in navigator)) {
    alert('Sinu brauser ei toeta kahjuks Screen Wake Lock funktsiooni.');
    document.getElementById('wakelock-toggle').checked = false;
    return;
  }

  try {
    if (enabled) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } else if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (err) {
    console.warn('Wake Lock viga:', err);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && document.getElementById('wakelock-toggle')?.checked) {
    toggleWakeLock(true);
  }
});

// =========================================================
// 6. KAART (4 Google Maps kihti, lohistatav Pin ja Vahepunktid)
// =========================================================
function initMap() {
  if (map) {
    setTimeout(() => map.invalidateSize(), 150);
    return;
  }

  map = L.map('map').setView([userCoords.lat, userCoords.lng], 15);

  // Laeme salvestatud või vaikimisi tumeda Google Mapsi stiili
  const savedStyle = localStorage.getItem('gowalk_map_style') || 'dark';
  setMapStyle(savedStyle);

  // Kaardil klikkimine lisab vahepunkti (pin-i)
  map.on('click', (e) => {
    addWaypoint(e.latlng.lat, e.latlng.lng);
  });

  // Tuvastame kasutaja GPS asukoha
  centerOnUserGPS(false);
}

function setMapStyle(styleKey) {
  if (!map || !MAP_STYLES[styleKey]) return;
  currentMapStyle = styleKey;
  localStorage.setItem('gowalk_map_style', styleKey);

  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
  }

  const cfg = MAP_STYLES[styleKey];
  currentTileLayer = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    className: cfg.className,
    maxZoom: 20
  }).addTo(map);

  // Uuendame nuppude aktiivset olekut
  document.querySelectorAll('.map-style-group .map-chip-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.style === styleKey);
  });
}

function centerOnUserGPS(showAlertOnFail = true) {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (map) map.setView([userCoords.lat, userCoords.lng], 15);
        placeUserMarker();
        if (waypoints.length > 0) calculateRouteThroughWaypoints();
      },
      () => {
        placeUserMarker();
        if (showAlertOnFail) {
          alert('GPS asukohta ei õnnestunud lugeda. Võid roosat alguspunkti (A) kaardil ise lohistada!');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    placeUserMarker();
  }
}

function placeUserMarker() {
  if (!map) return;
  if (userMarker) map.removeLayer(userMarker);

  const startIcon = L.divIcon({
    className: '',
    html: '<div class="custom-pin-start" title="Alguspunkt (lohista mind)">A</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  userMarker = L.marker([userCoords.lat, userCoords.lng], {
    draggable: true,
    icon: startIcon
  })
    .addTo(map)
    .bindPopup('<b>Alguspunkt (A)</b><br>Lohista mind sobivasse kohta!');

  // Kui kasutaja lohistab alguspunkti uude kohta, uuendame koordinaate ja marsruuti
  userMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    userCoords = { lat: pos.lat, lng: pos.lng };
    if (waypoints.length > 0) {
      calculateRouteThroughWaypoints();
    }
  });
}

function addWaypoint(lat, lng) {
  if (!map) return;

  const wpObj = { lat, lng, marker: null };
  waypoints.push(wpObj);
  renderWaypointMarkers();
  calculateRouteThroughWaypoints();
}

function renderWaypointMarkers() {
  waypoints.forEach((wp, idx) => {
    if (wp.marker) map.removeLayer(wp.marker);

    const wpIcon = L.divIcon({
      className: '',
      html: `<div class="custom-pin-wp">${idx + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([wp.lat, wp.lng], {
      draggable: true,
      icon: wpIcon
    }).addTo(map);

    // Lohistamine uuendab vahepunkti asukohta ja arvutab teekonna uuesti
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      wp.lat = pos.lat;
      wp.lng = pos.lng;
      calculateRouteThroughWaypoints();
    });

    // Vahepunktil klikkimine eemaldab selle
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      map.removeLayer(marker);
      waypoints.splice(idx, 1);
      renderWaypointMarkers();
      if (waypoints.length > 0) {
        calculateRouteThroughWaypoints();
      } else {
        if (routeLayer) map.removeLayer(routeLayer);
        updateRouteSummaryBadge(0);
      }
    });

    wp.marker = marker;
  });
}

function clearWaypoints() {
  waypoints.forEach((wp) => {
    if (wp.marker && map) map.removeLayer(wp.marker);
  });
  waypoints = [];
  if (routeLayer && map) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  updateRouteSummaryBadge(0);
}

function toggleLoopMode() {
  returnToStart = !returnToStart;
  const btn = document.getElementById('loop-mode-btn');
  if (btn) {
    btn.textContent = returnToStart ? '🔄 Ring: SEES' : '➡️ Üks suund';
    btn.classList.toggle('active', returnToStart);
  }
  if (waypoints.length > 0) {
    calculateRouteThroughWaypoints();
  }
}

function updateRouteSummaryBadge(distanceMeters) {
  const badge = document.getElementById('route-summary-badge');
  if (!badge) return;
  if (!distanceMeters || distanceMeters <= 0) {
    badge.textContent = '';
    return;
  }
  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const routeSteps = Math.round(distanceMeters / (strideCm / 100));
  const km = (distanceMeters / 1000).toFixed(2);
  badge.innerHTML = `📏 Teekond: <b>${km} km</b> (~${routeSteps.toLocaleString('et-EE')} sammu)`;
}

// Arvutab marsruudi läbi kasutaja pandud vahepunktide
async function calculateRouteThroughWaypoints() {
  if (waypoints.length === 0) return;

  const pts = [{ lat: userCoords.lat, lng: userCoords.lng }, ...waypoints];
  if (returnToStart) {
    pts.push({ lat: userCoords.lat, lng: userCoords.lng });
  }

  const coordsString = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${coordsString}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes[0]?.geometry) {
      drawRouteGeoJSON(data.routes[0].geometry, false);
      updateRouteSummaryBadge(data.routes[0].distance);
      return;
    }
  } catch (err) {
    console.warn('OSRM vahepunktide viga, joonistan sirgjooned:', err);
  }

  // Varulahendus: ühendame punktid joonega, kui marsruudiserver ei vasta
  if (routeLayer) map.removeLayer(routeLayer);
  const latLngs = pts.map((p) => [p.lat, p.lng]);
  routeLayer = L.polyline(latLngs, {
    color: '#ff1e8e',
    weight: 5,
    dashArray: '8, 8'
  }).addTo(map);

  let totalM = 0;
  for (let i = 1; i < pts.length; i++) {
    totalM += map.distance([pts[i - 1].lat, pts[i - 1].lng], [pts[i].lat, pts[i].lng]);
  }
  updateRouteSummaryBadge(totalM);
}

// Genereerib automaatse sammuringi (või uuendab vahepunktidega ringi)
async function generateLoopRoute() {
  const errEl = document.getElementById('route-error');
  if (errEl) errEl.classList.add('hidden');

  // Kui kasutaja on juba kaardile oma vahepunktid pannud, arvutame marsruudi nende järgi
  if (waypoints.length > 0) {
    await calculateRouteThroughWaypoints();
    if (routeLayer && map) map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
    return;
  }

  const targetSteps = parseInt(document.getElementById('target-steps').value, 10) || 0;
  const remainingSteps = getRemainingStepsNeeded();
  const stepsForRoute = remainingSteps > 0 ? remainingSteps : targetSteps;

  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const totalDistanceMeters = stepsForRoute * (strideCm / 100);

  if (stepsForRoute < 200 || totalDistanceMeters < 150) {
    if (errEl) {
      errEl.textContent = '⚠️ Vahemaa on tänavavõrgu jaoks liiga lühike (alla 200 sammu). Joonistasin sulle sümboolse miniringi!';
      errEl.classList.remove('hidden');
    }
    drawFallbackCircle(Math.max(totalDistanceMeters, 80));
    updateRouteSummaryBadge(totalDistanceMeters);
    return;
  }

  const btn = document.getElementById('generate-route-btn');
  btn.textContent = '⏳ Arvutan marsruuti...';
  btn.disabled = true;

  try {
    // Tänavavõrgu käänakute tõttu kasutame ~0.72 kordajat, et ringi tegelik pikkus klapiks eesmärgiga
    const radiusMeters = (totalDistanceMeters / (2 * Math.PI)) * 0.72;
    const generatedPts = createCircleWaypoints(userCoords.lat, userCoords.lng, radiusMeters, 3);
    const coordsString = generatedPts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

    const url = `https://router.project-osrm.org/route/v1/foot/${coordsString}?overview=full&geometries=geojson`;
    const response = await fetch(url);

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('Marsruudiserver on hetkel hõivatud.');
    }

    const data = await response.json();
    if (!data.routes || !data.routes[0]?.geometry) {
      throw new Error('Selles asukohas ei leitud sobivat teerada.');
    }

    drawRouteGeoJSON(data.routes[0].geometry, true);
    updateRouteSummaryBadge(data.routes[0].distance);
  } catch (error) {
    if (errEl) {
      errEl.textContent = `ℹ️ Kasutan lokaalset ringmarsruuti (${error.message})`;
      errEl.classList.remove('hidden');
    }
    drawFallbackCircle(totalDistanceMeters);
    updateRouteSummaryBadge(totalDistanceMeters);
  } finally {
    btn.textContent = '🗺️ Genereeri sammuring kaardil';
    btn.disabled = false;
  }
}

function createCircleWaypoints(lat, lng, radiusM, count) {
  const points = [{ lat, lng }];
  const startAngle = Math.random() * 2 * Math.PI;
  const latDegPerMeter = 1 / 111320;
  const lngDegPerMeter = 1 / (111320 * Math.cos((lat * Math.PI) / 180));

  for (let i = 1; i <= count; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / (count + 1);
    const dLat = Math.sin(angle) * radiusM * latDegPerMeter;
    const dLng = Math.cos(angle) * radiusM * lngDegPerMeter;
    points.push({ lat: lat + dLat, lng: lng + dLng });
  }
  points.push({ lat, lng });
  return points;
}

function drawRouteGeoJSON(geometry, fitMap = true) {
  if (!map) return;
  if (routeLayer) map.removeLayer(routeLayer);

  routeLayer = L.geoJSON(geometry, {
    style: {
      color: '#ff1e8e',
      weight: 5,
      opacity: 0.92
    }
  }).addTo(map);

  if (fitMap) {
    map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
  }
}

function drawFallbackCircle(totalDistanceMeters) {
  if (!map) return;
  if (routeLayer) map.removeLayer(routeLayer);

  const radius = Math.max(totalDistanceMeters / (2 * Math.PI), 25);
  const circlePoints = createCircleWaypoints(userCoords.lat, userCoords.lng, radius, 24)
    .map((p) => [p.lat, p.lng]);

  routeLayer = L.polyline(circlePoints, {
    color: '#ff1e8e',
    weight: 5,
    dashArray: '8, 8'
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

// =========================================================
// 7. REAALAJAS SAMMULUGEJA JA EESMÄRGI SÜNKROONIMINE
// =========================================================
async function toggleWalkTracking() {
  const startBtn = document.getElementById('start-walk-btn');
  const finishBtn = document.getElementById('finish-walk-btn');

  if (!isTracking) {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') alert('Anna luba liikumisandurile sammude lugemiseks!');
      } catch (e) {
        console.warn(e);
      }
    }

    isTracking = true;
    if (!startTime) startTime = Date.now();
    window.addEventListener('devicemotion', handleMotionEvent);
    timerInterval = setInterval(updateTimerUI, 1000);

    // Lülitame automaatselt sisse ka Wake Locki, kui lüliti on märgitud
    if (document.getElementById('wakelock-toggle')?.checked) {
      toggleWakeLock(true);
    }

    startBtn.textContent = '⏸️ Pane pausile';
    finishBtn.classList.remove('hidden');
  } else {
    isTracking = false;
    window.removeEventListener('devicemotion', handleMotionEvent);
    clearInterval(timerInterval);
    startBtn.textContent = '▶️ Jätka kõndimist';
  }
}

function handleMotionEvent(event) {
  if (!isTracking) return;
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
  const now = Date.now();

  if (magnitude > 12.4 && now - lastAccelTime > 320) {
    lastAccelTime = now;
    liveSteps++;
    updateLiveTrackerUI();
    updateDistancePreview();
  }
}

function simulateSteps(amount) {
  if (!startTime) startTime = Date.now();
  liveSteps += amount;
  updateLiveTrackerUI();
  updateDistancePreview();
  document.getElementById('finish-walk-btn').classList.remove('hidden');
}

function updateLiveTrackerUI() {
  const strideCm = parseFloat(document.getElementById('stride-length')?.value) || 76;
  const totalCurrentSteps = completedBaseSteps + liveSteps;
  const km = (totalCurrentSteps * (strideCm / 100)) / 1000;
  const kcal = Math.round(totalCurrentSteps * 0.04);

  const stepsEl = document.getElementById('live-steps');
  const kmEl = document.getElementById('live-km');
  const kcalEl = document.getElementById('live-kcal');

  if (stepsEl) stepsEl.textContent = totalCurrentSteps.toLocaleString('et-EE');
  if (kmEl) kmEl.textContent = km.toFixed(2);
  if (kcalEl) kcalEl.textContent = kcal;
}

function updateTimerUI() {
  if (!startTime) return;
  const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  document.getElementById('live-time').textContent = `${mins}:${secs}`;
}

async function finishAndSaveWalk() {
  const totalWalkedSteps = completedBaseSteps + liveSteps;
  if (totalWalkedSteps === 0) {
    alert('Sul pole veel samme kogutud!');
    return;
  }

  isTracking = false;
  window.removeEventListener('devicemotion', handleMotionEvent);
  clearInterval(timerInterval);

  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const distanceKm = parseFloat(((totalWalkedSteps * (strideCm / 100)) / 1000).toFixed(2));
  const durationMinutes = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 60000)) : Math.max(1, Math.round(distanceKm * 10));

  const walkRecord = {
    steps: totalWalkedSteps,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    created_at: new Date().toISOString()
  };

  const localHistory = JSON.parse(localStorage.getItem('gowalk_history') || '[]');
  localHistory.unshift(walkRecord);
  localStorage.setItem('gowalk_history', JSON.stringify(localHistory.slice(0, 50)));

  if (supabaseClient && currentUser && currentUser.id !== 'guest') {
    await supabaseClient.from('walks').insert({
      user_id: currentUser.id,
      ...walkRecord
    });
  }

  // Nullime jooksvad loendurid
  liveSteps = 0;
  completedBaseSteps = 0;
  localStorage.setItem('gowalk_completed_base', '0');
  const compInput = document.getElementById('completed-steps-input');
  if (compInput) compInput.value = 0;

  startTime = null;
  updateLiveTrackerUI();
  updateDistancePreview();
  document.getElementById('live-time').textContent = '00:00';
  document.getElementById('start-walk-btn').textContent = '▶️ Alusta kõndimist';
  document.getElementById('finish-walk-btn').classList.add('hidden');

  await loadWalkHistory();
  switchAppTab('stats');
}

// =========================================================
// 8. STATISTIKA, STREAK JA AJALUGU
// =========================================================
async function loadWalkHistory() {
  let walks = JSON.parse(localStorage.getItem('gowalk_history') || '[]');

  if (supabaseClient && currentUser && currentUser.id !== 'guest') {
    const { data, error } = await supabaseClient
      .from('walks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data && data.length > 0) {
      walks = data;
    }
  }

  renderStatsAndHistory(walks);
}

function renderStatsAndHistory(walks) {
  const totalSteps = walks.reduce((sum, w) => sum + (Number(w.steps) || 0), 0);
  const totalKm = walks.reduce((sum, w) => sum + (Number(w.distance_km) || 0), 0);

  document.getElementById('total-steps-stat').textContent = totalSteps.toLocaleString('et-EE');
  document.getElementById('total-km-stat').textContent = totalKm.toFixed(1);
  document.getElementById('streak-count').textContent = `${calculateStreak(walks)}p`;

  const listEl = document.getElementById('walks-history-list');
  if (walks.length === 0) {
    listEl.innerHTML = '<p class="muted-text">Sul pole veel salvestatud jalutuskäike. Tee esimene ring!</p>';
    return;
  }

  listEl.innerHTML = walks
    .map((w) => {
      const dateStr = new Date(w.created_at).toLocaleDateString('et-EE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `
        <div class="history-item">
          <div>
            <strong>${Number(w.steps).toLocaleString('et-EE')} sammu</strong>
            <div class="history-date">${dateStr} • ${w.duration_minutes || 1} min</div>
          </div>
          <strong>${Number(w.distance_km).toFixed(2)} km</strong>
        </div>
      `;
    })
    .join('');
}

function calculateStreak(walks) {
  if (!walks.length) return 0;
  const uniqueDays = [...new Set(walks.map((w) => new Date(w.created_at).toDateString()))];
  return uniqueDays.length;
}

// =========================================================
// 9. MODAALAKNAD JA PWA PAIGALDAMINE
// =========================================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'stride-modal') previewCalculatedStride();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function setupPwaInstallListener() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    document.getElementById('native-pwa-btn').classList.remove('hidden');
  });
}

async function triggerNativePwaInstall() {
  if (!deferredPwaPrompt) return;
  deferredPwaPrompt.prompt();
  await deferredPwaPrompt.userChoice;
  deferredPwaPrompt = null;
  document.getElementById('native-pwa-btn').classList.add('hidden');
  closeModal('pwa-modal');
}
