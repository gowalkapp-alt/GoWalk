// =========================================================
// 1. SUPABASE SEADISTUS
// =========================================================
const SUPABASE_URL = 'https://bktvebmplrabwbgwawao.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO'; // <-- Pane oma võti siia!

let supabaseClient = null;
if (window.supabase && SUPABASE_KEY !== 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Globaalsed olekud
let currentUser = null;
let authMode = 'login';
let map = null;
let routeLayer = null;
let userMarker = null;
let userCoords = { lat: 59.437, lng: 24.7536 }; // Vaikimisi asukoht enne GPS-i

// Sammulugeja ja taimeri olekud
let isTracking = false;
let liveSteps = 0;
let startTime = null;
let timerInterval = null;
let wakeLockSentinel = null;
let lastAccelTime = 0;
let deferredPwaPrompt = null;

// =========================================================
// 2. RAKENDUSE KÄIVITAMINE
// =========================================================
window.addEventListener('DOMContentLoaded', async () => {
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

function setupInputListeners() {
  document.getElementById('target-steps').addEventListener('input', updateDistancePreview);
  document.getElementById('stride-length').addEventListener('input', (e) => {
    localStorage.setItem('gowalk_stride', e.target.value);
    updateDistancePreview();
  });
  document.getElementById('calc-gender').addEventListener('change', previewCalculatedStride);
  document.getElementById('calc-height').addEventListener('input', previewCalculatedStride);
  updateDistancePreview();
}

// =========================================================
// 3. AUTENTIMINE (Supabase + Külaline)
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
  await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
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

// =========================================================
// 4. KIIRE SAMMUPIKKUSE KALKULAATOR
// =========================================================
function loadSavedSettings() {
  const savedStride = localStorage.getItem('gowalk_stride');
  if (savedStride) {
    document.getElementById('stride-length').value = savedStride;
  }
}

function previewCalculatedStride() {
  const gender = document.getElementById('calc-gender').value;
  const height = parseFloat(document.getElementById('calc-height').value) || 175;
  // Biomehaaniline koefitsient: Mees 0.415, Naine 0.413
  const factor = gender === 'male' ? 0.415 : 0.413;
  const stride = Math.round(height * factor);
  document.getElementById('calc-result-preview').textContent = `${stride} cm`;
  return stride;
}

async function applyCalculatedStride() {
  const stride = previewCalculatedStride();
  const gender = document.getElementById('calc-gender').value;
  const height = parseInt(document.getElementById('calc-height').value, 10) || 183;

  document.getElementById('stride-length').value = stride;
  localStorage.setItem('gowalk_stride', stride);
  updateDistancePreview();
  closeModal('stride-modal');

  // Salvestame ka Supabase profiili alla, kui sisse logitud
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
  if (!supabaseClient || !currentUser || currentUser.id === 'guest') return;
  const { data } = await supabaseClient
    .from('profiles')
    .select('stride_cm, height_cm, gender')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (data?.stride_cm) {
    document.getElementById('stride-length').value = data.stride_cm;
    localStorage.setItem('gowalk_stride', data.stride_cm);
    updateDistancePreview();
  }
}

function updateDistancePreview() {
  const steps = parseInt(document.getElementById('target-steps').value, 10) || 0;
  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const km = (steps * (strideCm / 100)) / 1000;
  const minutes = Math.max(1, Math.round(km * 10)); // ~6 km/h keskmine tempo

  document.getElementById('estimated-km').textContent = `${km.toFixed(2)} km`;
  document.getElementById('estimated-min').textContent = minutes;
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
  if (document.visibilityState === 'visible' && document.getElementById('wakelock-toggle').checked) {
    toggleWakeLock(true);
  }
});

// =========================================================
// 6. KAART JA LÜHIKESTE VAHEMAADE VEAKINDEL GENERAATOR
// =========================================================
function initMap() {
  if (map) return;

  map = L.map('map').setView([userCoords.lat, userCoords.lng], 14);

  // Tume neoon-stiiliga sobiv aluskaart
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB',
    maxZoom: 19
  }).addTo(map);

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setView([userCoords.lat, userCoords.lng], 15);
        placeUserMarker();
      },
      () => placeUserMarker(),
      { enableHighAccuracy: true }
    );
  } else {
    placeUserMarker();
  }
}

function placeUserMarker() {
  if (!map) return;
  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.circleMarker([userCoords.lat, userCoords.lng], {
    radius: 8,
    fillColor: '#ff1e8e',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(map).bindPopup('Sinu alguspunkt');
}

async function generateLoopRoute() {
  const errEl = document.getElementById('route-error');
  errEl.classList.add('hidden');

  const steps = parseInt(document.getElementById('target-steps').value, 10) || 0;
  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const totalDistanceMeters = steps * (strideCm / 100);

  // PARANDUS: Lühikeste vahemaade kontroll (väldib OSRM JSON-viga!)
  if (steps < 200 || totalDistanceMeters < 150) {
    errEl.textContent = '⚠️ Vahemaa on tänavavõrgu jaoks liiga lühike (alla 200 sammu). Joonistasin sulle sümboolse miniringi!';
    errEl.classList.remove('hidden');
    drawFallbackCircle(Math.max(totalDistanceMeters, 80));
    return;
  }

  const btn = document.getElementById('generate-route-btn');
  btn.textContent = '⏳ Arvutan marsruuti...';
  btn.disabled = true;

  try {
    // Arvutame 3 vahepunkti ringi jaoks
    const radiusMeters = totalDistanceMeters / (2 * Math.PI) * 0.85;
    const waypoints = createCircleWaypoints(userCoords.lat, userCoords.lng, radiusMeters, 3);
    const coordsString = waypoints.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

    const url = `https://router.project-osrm.org/route/v1/foot/${coordsString}?overview=full&geometries=geojson`;
    const response = await fetch(url);

    // Kontrollime, kas server tagastas kehtiva JSON-i
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('Marsruudiserver on hetkel hõivatud.');
    }

    const data = await response.json();
    if (!data.routes || !data.routes[0]?.geometry) {
      throw new Error('Selles asukohas ei leitud sobivat teerada.');
    }

    drawRouteGeoJSON(data.routes[0].geometry);
  } catch (error) {
    // Kui OSRM ebaõnnestub, ei viska me koledat JSON-viga, vaid joonistame sujuva ringi
    errEl.textContent = `ℹ️ Kasutan lokaalset ringmarsruuti (${error.message})`;
    errEl.classList.remove('hidden');
    drawFallbackCircle(totalDistanceMeters);
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

function drawRouteGeoJSON(geometry) {
  if (!map) return;
  if (routeLayer) map.removeLayer(routeLayer);

  routeLayer = L.geoJSON(geometry, {
    style: {
      color: '#ff1e8e',
      weight: 5,
      opacity: 0.9
    }
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

function drawFallbackCircle(totalDistanceMeters) {
  if (!map) return;
  if (routeLayer) map.removeLayer(routeLayer);

  const radius = Math.max(totalDistanceMeters / (2 * Math.PI), 25);
  const circlePoints = createCircleWaypoints(userCoords.lat, userCoords.lng, radius, 24)
    .map(p => [p.lat, p.lng]);

  routeLayer = L.polyline(circlePoints, {
    color: '#ff1e8e',
    weight: 5,
    dashArray: '8, 8'
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

// =========================================================
// 7. REAALAJAS SAMMULUGEJA
// =========================================================
async function toggleWalkTracking() {
  const startBtn = document.getElementById('start-walk-btn');
  const finishBtn = document.getElementById('finish-walk-btn');

  if (!isTracking) {
    // iOS 13+ liikumisanduri luba
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

  // Tuvastame sammu kiirenduse tipu järgi (vähemalt 320ms vahega)
  if (magnitude > 12.6 && now - lastAccelTime > 320) {
    lastAccelTime = now;
    liveSteps++;
    updateLiveTrackerUI();
  }
}

function simulateSteps(amount) {
  if (!startTime) startTime = Date.now();
  liveSteps += amount;
  updateLiveTrackerUI();
  document.getElementById('finish-walk-btn').classList.remove('hidden');
}

function updateLiveTrackerUI() {
  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const km = (liveSteps * (strideCm / 100)) / 1000;
  const kcal = Math.round(liveSteps * 0.04);

  document.getElementById('live-steps').textContent = liveSteps;
  document.getElementById('live-km').textContent = km.toFixed(2);
  document.getElementById('live-kcal').textContent = kcal;
}

function updateTimerUI() {
  if (!startTime) return;
  const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  document.getElementById('live-time').textContent = `${mins}:${secs}`;
}

async function finishAndSaveWalk() {
  if (liveSteps === 0) {
    alert('Sul pole veel samme kogutud!');
    return;
  }

  isTracking = false;
  window.removeEventListener('devicemotion', handleMotionEvent);
  clearInterval(timerInterval);

  const strideCm = parseFloat(document.getElementById('stride-length').value) || 76;
  const distanceKm = parseFloat(((liveSteps * (strideCm / 100)) / 1000).toFixed(2));
  const durationMinutes = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 60000)) : 1;

  const walkRecord = {
    steps: liveSteps,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    created_at: new Date().toISOString()
  };

  // 1. Salvestame lokaalselt
  const localHistory = JSON.parse(localStorage.getItem('gowalk_history') || '[]');
  localHistory.unshift(walkRecord);
  localStorage.setItem('gowalk_history', JSON.stringify(localHistory.slice(0, 50)));

  // 2. Salvestame Supabase'i (kui kasutaja on sisse logitud)
  if (supabaseClient && currentUser && currentUser.id !== 'guest') {
    await supabaseClient.from('walks').insert({
      user_id: currentUser.id,
      ...walkRecord
    });
  }

  // Nullime loenduri
  liveSteps = 0;
  startTime = null;
  updateLiveTrackerUI();
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
  document.getElementById('streak-count').textContent = calculateStreak(walks);

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
  const uniqueDays = [...new Set(walks.map(w => new Date(w.created_at).toDateString()))];
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
