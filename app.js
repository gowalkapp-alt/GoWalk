/* ==========================================================================
   GOWALK PRO — APPLICATION LOGIC
   CLEAN MINIMAL HUD + DRAWER SETTINGS & STEP ENTRY + SAFE LIT ROUTE
   ========================================================================== */

const SUPABASE_URL = 'https://bktvebmplrabwbgwawao.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO';
const ADMIN_EMAILS = [
  'info.gowalk.app@gmail.com',
  'karmo.riiel@gmail.com'
];

let supabaseClient = null;
let currentUser = null;
let syncTimeout = null;

function ensureSupabaseSDK() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return Promise.resolve(window.supabase);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => resolve(window.supabase);
    script.onerror = () => reject(new Error('Supabase SDK laadimine ebaõnnestus'));
    document.head.appendChild(script);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Eemalda kellaühenduste nupud täielikult
  const syncNavBtn = document.querySelector('.nav-item[data-target="syncModal"]');
  if (syncNavBtn) syncNavBtn.remove();
  const syncModalEl = document.getElementById('syncModal');
  if (syncModalEl) syncModalEl.remove();

  if (window.lucide) {
    lucide.createIcons();
  }

  const STORAGE_KEY = 'gowalk_pro_permanent_v2';
  const DEVICE_UID_KEY = 'gowalk_pro_device_uid';

  function getOrCreateDeviceUid() {
    let uid = localStorage.getItem(DEVICE_UID_KEY);
    if (!uid) {
      uid = crypto.randomUUID
        ? crypto.randomUUID()
        : 'gw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_UID_KEY, uid);
    }
    return uid;
  }

  function detectCountryName() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Tallinn')) return '🇪🇪 Eesti';
    if (tz.includes('Helsinki')) return '🇫🇮 Soome';
    if (tz.includes('Riga')) return '🇱🇻 Läti';
    if (tz.includes('Vilnius')) return '🇱🇹 Leedu';
    if (tz.includes('Stockholm')) return '🇸🇪 Rootsi';
    if (tz.includes('London')) return '🇬🇧 Suurbritannia';
    if (tz.includes('Berlin')) return '🇩🇪 Saksamaa';
    return tz || '🌍 Rahvusvaheline';
  }

  const defaultPromoCodes = [
    { code: 'GOWALK30', discount: 30, label: '-30% Soodustus' },
    { code: 'GOWALK50', discount: 50, label: '-50% Soodustus' },
    { code: 'GOWALK70', discount: 70, label: '-70% Soodustus' },
    { code: 'VIPFREE', discount: 100, label: 'TASUTA (100% PRO)' }
  ];

  function createFreshState(customUserId = null) {
    return {
      userId: customUserId || getOrCreateDeviceUid(),
      isAdminUnlocked: false,
      profile: {
        name: 'Kõndija Pro',
        email: null,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoWalkPro',
        country: detectCountryName(),
        plan: 'Standard konto',
        activePromo: null
      },
      settings: {
        stepGoal: 10000,
        strideCm: 76,
        mapLayer: 'dark',
        safeLitOnly: true
      },
      today: {
        date: new Date().toISOString().slice(0, 10),
        steps: 0,
        distanceKm: 0,
        calories: 0,
        durationSec: 0
      },
      promoCodes: structuredClone(defaultPromoCodes),
      history: [],
      updatedAt: new Date().toISOString()
    };
  }

  let plannedRoute = { steps: 0, distanceKm: 0 };
  let state = loadLocalState();

  function loadLocalState() {
    try {
      const base = createFreshState();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);

      const currentDay = new Date().toISOString().slice(0, 10);
      if (parsed.today && parsed.today.date !== currentDay) {
        if (parsed.today.steps > 0) {
          parsed.history = parsed.history || [];
          parsed.history.unshift({ ...parsed.today });
        }
        parsed.today = {
          date: currentDay,
          steps: 0,
          distanceKm: 0,
          calories: 0,
          durationSec: 0
        };
      }

      return {
        ...base,
        ...parsed,
        profile: { ...base.profile, ...(parsed.profile || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) },
        today: { ...base.today, ...(parsed.today || {}) },
        promoCodes:
          Array.isArray(parsed.promoCodes) && parsed.promoCodes.length > 0
            ? parsed.promoCodes
            : structuredClone(defaultPromoCodes)
      };
    } catch (e) {
      return createFreshState();
    }
  }

  function saveState(skipCloud = false) {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    if (!skipCloud) scheduleCloudSync();
  }

  function getMissingSteps() {
    const goal = Math.max(1000, state.settings.stepGoal || 10000);
    const walked = Math.max(0, state.today.steps || 0);
    return Math.max(0, goal - walked);
  }

  async function performFullLogout() {
    if (syncTimeout) clearTimeout(syncTimeout);
    try {
      if (supabaseClient) await supabaseClient.auth.signOut();
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEVICE_UID_KEY);
    window.location.reload();
  }

  // ==========================================================================
  // ADMIN & AUTH
  // ==========================================================================

  const adminNavBtn = document.getElementById('adminNavBtn');
  const googleAuthBtn = document.getElementById('googleAuthBtn');
  const googleAuthText = document.getElementById('googleAuthText');
  const adminActiveEmailText = document.getElementById('adminActiveEmailText');

  function checkAdminAccess() {
    if (!adminNavBtn) return;
    const email = (state.profile.email || '').toLowerCase().trim();
    const isEmailAdmin = ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email);

    if (isEmailAdmin || state.isAdminUnlocked) {
      adminNavBtn.style.display = 'flex';
      if (adminActiveEmailText) {
        adminActiveEmailText.textContent = email ? `Sisselogitud admin: ${email}` : 'Admin vaade aktiveeritud';
      }
    } else {
      adminNavBtn.style.display = 'none';
    }
  }

  let secretTapCount = 0;
  let secretTapTimer = null;
  const versionTrigger = document.getElementById('versionSecretTrigger') || document.querySelector('.version-tag');
  if (versionTrigger) {
    versionTrigger.addEventListener('click', () => {
      secretTapCount += 1;
      clearTimeout(secretTapTimer);
      secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 2000);

      if (secretTapCount >= 5) {
        secretTapCount = 0;
        state.isAdminUnlocked = !state.isAdminUnlocked;
        saveState();
        checkAdminAccess();
        alert(state.isAdminUnlocked ? '🛡️ Admin Paneel avatud!' : 'Admin Paneel peidetud.');
      }
    });
  }

  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
      if (!supabaseClient) return;
      if (state.profile.email) {
        if (confirm(`Oled sisse logitud kui ${state.profile.email}. Kas soovid välja logida?`)) {
          await performFullLogout();
        }
        return;
      }
      try {
        await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + window.location.pathname }
        });
      } catch (err) {
        const manualEmail = prompt('Sisesta oma Google e-post:', '');
        if (manualEmail && manualEmail.includes('@')) {
          const cleanEmail = manualEmail.trim().toLowerCase();
          await switchUserContext('email_' + cleanEmail, cleanEmail, cleanEmail.split('@')[0], null);
        }
      }
    });
  }

  async function switchUserContext(newUserId, email, fullName, avatarUrl) {
    state = createFreshState(newUserId);
    if (email) state.profile.email = email;
    if (fullName) state.profile.name = fullName;
    if (avatarUrl) state.profile.avatar = avatarUrl;
    saveState(true);
    renderProfile();
    updateHudUI();
    checkAdminAccess();
    await pullFromCloud(true);
  }

  const userSyncBadge = document.getElementById('userSyncBadge');
  function setSyncStatus(text, isOnline = true) {
    if (userSyncBadge) userSyncBadge.textContent = text;
  }

  async function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
      const sdk = await ensureSupabaseSDK();
      supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData?.session?.user) {
        currentUser = sessionData.session.user;
      } else {
        const { data: anonData } = await supabaseClient.auth.signInAnonymously();
        if (anonData?.user) currentUser = anonData.user;
      }
      if (currentUser) {
        await switchUserContext(currentUser.id, currentUser.email, currentUser.user_metadata?.full_name, currentUser.user_metadata?.avatar_url);
      }
    } catch (err) {}
  }

  async function pullFromCloud(strictAccountLoad = false) {
    if (!supabaseClient || !state.userId) return;
    try {
      const { data } = await supabaseClient.from('user_states').select('state_json').eq('user_id', state.userId).maybeSingle();
      if (data?.state_json) {
        const cloud = data.state_json;
        if (cloud.today) state.today = { ...state.today, ...cloud.today };
        if (cloud.settings) state.settings = { ...state.settings, ...cloud.settings };
        saveState(true);
        updateHudUI();
      }
    } catch (e) {}
  }

  function scheduleCloudSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      if (!supabaseClient || !state.userId) return;
      await supabaseClient.from('user_states').upsert({
        user_id: state.userId,
        profile_name: state.profile.name,
        country: state.profile.country || detectCountryName(),
        total_steps: state.today.steps + state.history.reduce((sum, item) => sum + (item.steps || 0), 0),
        state_json: state,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }, 1200);
  }

  // ==========================================================================
  // LIUGMENÜÜ & SEADETE LISAMISED (SAMMUDE JA EESMÄRGI MUUTMINE)
  // ==========================================================================

  const sidebarDrawer = document.getElementById('sidebarDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  document.getElementById('openDrawerBtn').addEventListener('click', () => {
    sidebarDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
  });
  const closeDrawer = () => {
    sidebarDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  };
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      closeDrawer();
      document.querySelectorAll('.subview-modal').forEach(m => m.classList.remove('open'));
      if (targetId !== 'home') {
        const modal = document.getElementById(targetId);
        if (modal) modal.classList.add('open');
      }
    });
  });

  document.querySelectorAll('.close-subview').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subview-modal').forEach(m => m.classList.remove('open'));
    });
  });

  // Lisa kiire nupu võimalus menüüsse sammude sisestamiseks
  function promptEditCurrentSteps() {
    const entered = prompt(`Sisesta täna tehtud sammud (eesmärk on ${state.settings.stepGoal.toLocaleString('et-EE')}):`, state.today.steps);
    if (entered === null) return;
    const parsed = Math.max(0, parseInt(entered.replace(/\s+/g, ''), 10) || 0);
    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.steps = parsed;
    state.today.distanceKm = +((parsed * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(parsed * 0.04);
    saveState();
    updateHudUI();
  }

  // Ülemine parempoolne nupp avab nüüd kiiresti sammude lisamise
  const quickSyncBtn = document.getElementById('quickSyncBtn');
  if (quickSyncBtn) {
    quickSyncBtn.title = 'Lisa täna tehtud sammud';
    quickSyncBtn.innerHTML = '<i data-lucide="plus-circle"></i>';
    if (window.lucide) lucide.createIcons();
    quickSyncBtn.addEventListener('click', promptEditCurrentSteps);
  }

  // ==========================================================================
  // KART & RINGI GENERAATOR
  // ==========================================================================

  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([58.3859, 24.4971], 14);

  const tileLayers = {
    dark: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, className: 'map-tiles-dark', attribution: '© Google Maps' }),
    light: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Maps' }),
    hybrid: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Maps' }),
    terrain: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Maps' })
  };

  let activeLayer = tileLayers[state.settings.mapLayer] || tileLayers.dark;
  activeLayer.addTo(map);

  function switchMapLayer(layerKey) {
    if (!tileLayers[layerKey]) return;
    map.removeLayer(activeLayer);
    activeLayer = tileLayers[layerKey];
    activeLayer.addTo(map);
    state.settings.mapLayer = layerKey;
    saveState();
  }

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => switchMapLayer(chip.dataset.layer));
  });

  let waypoints = [];
  let markers = [];
  let routeLine = L.polyline([], { color: '#8b5cf6', weight: 5, opacity: 0.92 }).addTo(map);
  let lastGeneratedBearing = Math.random() * 2 * Math.PI;
  let routeVariantCounter = 0;
  let lastTargetSteps = 0;
  let floatingShuffleBtn = null;
  let cachedSafeNodes = { key: '', nodes: [] };

  function updateFloatingShuffleLabel() {
    if (!floatingShuffleBtn) return;
    const prefix = state.settings.safeLitOnly !== false ? '🔦' : '🌲';
    const routeInfo = plannedRoute.steps > 0 ? `Rada: ${plannedRoute.steps.toLocaleString('et-EE')} sammu • ` : '';
    floatingShuffleBtn.innerHTML = `<span>${prefix} ${routeInfo}🔄 Teine suund</span>`;
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
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${bg};color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 4px 14px rgba(139,92,246,0.65);">${label}</div>`,
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
    updateHudUI();
  }

  function recalculateRouteMetrics() {
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
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    routeLine.setLatLngs(customGeometry || waypoints);

    waypoints.forEach((latlng, idx) => {
      const label = idx === 0 ? 'A' : idx;
      const marker = L.marker(latlng, { draggable: true, icon: createPinIcon(label, idx === 0) }).addTo(map);
      marker.on('drag', e => {
        waypoints[idx] = e.target.getLatLng();
        routeLine.setLatLngs(waypoints);
        recalculateRouteMetrics();
      });
      markers.push(marker);
    });

    if (!skipMetricRecalc) recalculateRouteMetrics();
  }

  map.on('click', e => {
    waypoints.push(e.latlng);
    rebuildWaypoints();
  });

  document.getElementById('undoWaypointBtn').addEventListener('click', () => {
    if (waypoints.length > 0) {
      waypoints.pop();
      rebuildWaypoints();
      if (waypoints.length <= 1) {
        plannedRoute = { steps: 0, distanceKm: 0 };
        setFloatingShuffleVisible(false);
      }
    }
  });

  document.getElementById('clearRouteBtn').addEventListener('click', () => {
    waypoints = [];
    routeLine.setLatLngs([]);
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    plannedRoute = { steps: 0, distanceKm: 0 };
    setFloatingShuffleVisible(false);
  });

  document.getElementById('locateMeBtn').addEventListener('click', () => {
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
          <span class="spark">✨</span>
          <span>Rajageneraator</span>
        </div>
        <button id="closeRouteGenBtn" class="icon-btn" style="width:28px;height:28px;">✕</button>
      </div>
      <p class="route-gen-sub">Vali sammude arv ja koosta ohutu ring:</p>

      <button type="button" id="safeLitRouteToggleBtn" class="safe-route-toggle ${isSafeDefault ? 'active' : ''}">
        <div class="safe-toggle-left">
          <span id="safeToggleEmoji">${isSafeDefault ? '🔦' : '🌲'}</span>
          <div class="safe-toggle-text">
            <span class="safe-toggle-title">Valgustatud / Ohutu ring</span>
            <span class="safe-toggle-sub">Väldib pimedaid metsaradu</span>
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
        <input type="number" id="targetRouteStepsInput" class="route-custom-input" value="${initialMissing}" step="500" min="300" />
        <button id="generateSmartRouteBtn" class="btn-generate-go">Koosta</button>
      </div>
      <button id="shuffleRoutePopoverBtn" class="btn-shuffle-route">🔄 Teine suund (Shuffle)</button>
    `;
    viewport.appendChild(popover);

    if (window.lucide) lucide.createIcons();

    const stepsInput = document.getElementById('targetRouteStepsInput');
    magicFab.addEventListener('click', () => {
      const missing = getMissingSteps();
      stepsInput.value = missing >= 300 ? missing : 3000;
      popover.classList.toggle('open');
    });

    document.getElementById('closeRouteGenBtn').addEventListener('click', () => popover.classList.remove('open'));

    const safeToggleBtn = document.getElementById('safeLitRouteToggleBtn');
    safeToggleBtn.addEventListener('click', () => {
      state.settings.safeLitOnly = !(state.settings.safeLitOnly !== false);
      const active = state.settings.safeLitOnly;
      safeToggleBtn.classList.toggle('active', active);
      document.getElementById('safeToggleEmoji').textContent = active ? '🔦' : '🌲';
      document.getElementById('safeToggleBadge').textContent = active ? 'SEES' : 'VÄLJAS';
      updateFloatingShuffleLabel();
      saveState();
    });

    popover.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        popover.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const rawAttr = pill.getAttribute('data-steps');
        const missing = getMissingSteps();
        const val = rawAttr === 'missing' ? (missing >= 300 ? missing : 3000) : parseInt(rawAttr, 10);
        stepsInput.value = val;
        lastTargetSteps = val;
        generateLoopRouteForSteps(val);
        popover.classList.remove('open');
      });
    });

    document.getElementById('generateSmartRouteBtn').addEventListener('click', () => {
      const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || 3000);
      lastTargetSteps = targetSteps;
      generateLoopRouteForSteps(targetSteps);
      popover.classList.remove('open');
    });

    document.getElementById('shuffleRoutePopoverBtn').addEventListener('click', () => {
      const targetSteps = Math.max(300, parseInt(stepsInput.value, 10) || lastTargetSteps || 3000);
      lastTargetSteps = targetSteps;
      generateLoopRouteForSteps(targetSteps);
    });

    floatingShuffleBtn.addEventListener('click', () => {
      const targetSteps = lastTargetSteps || getMissingSteps() || 3000;
      generateLoopRouteForSteps(targetSteps);
    });
  }

  function offsetCoordinate(originLatLng, distanceMeters, bearingRad) {
    const R = 6378137;
    const lat1 = (originLatLng.lat * Math.PI) / 180;
    const lon1 = (originLatLng.lng * Math.PI) / 180;
    const dByR = distanceMeters / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(bearingRad));
    const lon2 = lon1 + Math.atan2(Math.sin(bearingRad) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
    return L.latLng((lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI);
  }

  async function fetchSafeLitStreetNodes(startPoint, searchRadiusMeters) {
    const radius = Math.min(3500, Math.max(600, Math.round(searchRadiusMeters * 2.2)));
    const query = `[out:json][timeout:3];(way(around:${radius},${startPoint.lat},${startPoint.lng})["lit"="yes"]["highway"!~"motorway|trunk|track|path|bridleway|steps"];way(around:${radius},${startPoint.lat},${startPoint.lng})["highway"~"residential|living_street|pedestrian|tertiary"]["lit"!="no"];);out geom;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
      const data = await res.json();
      const nodes = [];
      if (data && Array.isArray(data.elements)) {
        data.elements.forEach(el => {
          if (Array.isArray(el.geometry)) {
            for (let i = 0; i < el.geometry.length; i += 3) {
              const pt = el.geometry[i];
              if (pt && pt.lat && pt.lon) nodes.push({ lat: pt.lat, lng: pt.lon, lit: el.tags?.lit === 'yes' });
            }
          }
        });
      }
      return nodes;
    } catch (e) { return []; }
  }

  function buildTrueCircularWaypoints(startPoint, loopRadiusMeters, centerBearingRad, turnSign, aspectRatio = 1.0, safeNodes = []) {
    const loopCenter = offsetCoordinate(startPoint, loopRadiusMeters, centerBearingRad);
    const angleA = centerBearingRad + Math.PI;
    const p1 = offsetCoordinate(loopCenter, loopRadiusMeters * aspectRatio, angleA + turnSign * (Math.PI * 0.5));
    const p2 = offsetCoordinate(loopCenter, loopRadiusMeters * 1.08, angleA + turnSign * Math.PI);
    const p3 = offsetCoordinate(loopCenter, loopRadiusMeters * aspectRatio, angleA + turnSign * (Math.PI * 1.5));
    return [startPoint, p1, p2, p3];
  }

  async function generateLoopRouteForSteps(targetSteps) {
    const strideMeters = (state.settings.strideCm || 76) / 100;
    const targetMeters = targetSteps * strideMeters;
    const safeLitOnly = state.settings.safeLitOnly !== false;
    lastTargetSteps = targetSteps;

    const startPoint = waypoints.length > 0 ? waypoints[0] : map.getCenter();
    const angleShift = Math.PI * 0.53 + Math.random() * (Math.PI * 0.38);
    lastGeneratedBearing = (lastGeneratedBearing + angleShift) % (2 * Math.PI);

    routeVariantCounter += 1;
    let loopRadiusMeters = Math.max(100, targetMeters / 8.0);

    const safeNodes = safeLitOnly ? await fetchSafeLitStreetNodes(startPoint, loopRadiusMeters) : [];
    waypoints = buildTrueCircularWaypoints(startPoint, loopRadiusMeters, lastGeneratedBearing, routeVariantCounter % 2 === 0 ? 1 : -1, 1.0, safeNodes);

    try {
      const coordsQuery = [...waypoints, waypoints[0]].map(pt => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`).join(';');
      const res = await fetch(`https://router.project-osrm.org/route/v1/foot/${coordsQuery}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data && data.routes && data.routes[0]) {
        const route = data.routes[0];
        const latlngs = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
        rebuildWaypoints(latlngs, true);
        setPlannedRouteMetrics(targetMeters);
        map.fitBounds(routeLine.getBounds(), { padding: [54, 54] });
        setFloatingShuffleVisible(true);
        return;
      }
    } catch (e) {}
  }

  // ==========================================================================
  // HUD JA UUENDUSED
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;
  let isWalking = false;
  let walkTimer = null;
  let gpsWatchId = null;
  let lastGpsLatLng = null;

  function formatDuration(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateHudUI() {
    const steps = state.today.steps || 0;
    const goal = state.settings.stepGoal || 10000;
    const missing = getMissingSteps();
    const pct = Math.min(100, Math.round((steps / goal) * 100));

    document.getElementById('liveSteps').textContent = steps.toLocaleString('et-EE');
    document.getElementById('goalStepsLabel').textContent = `/ ${goal.toLocaleString('et-EE')} sammu`;
    document.getElementById('stepPercentText').textContent = `${pct}%`;

    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    document.getElementById('stepRingProgress').style.strokeDashoffset = offset;

    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.distanceKm = +((steps * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(steps * 0.04);

    document.getElementById('liveDistance').textContent = state.today.distanceKm.toFixed(2);
    document.getElementById('liveCalories').textContent = state.today.calories;
    document.getElementById('liveDuration').textContent = formatDuration(state.today.durationSec);
  }

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');

  startWalkBtn.addEventListener('click', () => {
    isWalking = !isWalking;
    startWalkBtn.classList.toggle('walking-active', isWalking);

    if (isWalking) {
      startWalkText.textContent = 'Peata ja salvesta';
      lastGpsLatLng = null;
      walkTimer = setInterval(() => {
        state.today.durationSec += 1;
        updateHudUI();
      }, 1000);

      if (navigator.geolocation) {
        gpsWatchId = navigator.geolocation.watchPosition(pos => {
          const currentLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);
          if (lastGpsLatLng) {
            const movedMeters = map.distance(lastGpsLatLng, currentLatLng);
            if (movedMeters >= 4 && movedMeters < 150) {
              const strideMeters = (state.settings.strideCm || 76) / 100;
              state.today.steps += Math.round(movedMeters / strideMeters);
              lastGpsLatLng = currentLatLng;
              saveState();
              updateHudUI();
            }
          } else {
            lastGpsLatLng = currentLatLng;
          }
        }, err => {}, { enableHighAccuracy: true });
      }
    } else {
      clearInterval(walkTimer);
      if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
      startWalkText.textContent = 'Alusta kõndimist';
      if (state.today.steps > 0) {
        state.history.unshift({ date: new Date().toLocaleString('et-EE'), steps: state.today.steps, distanceKm: state.today.distanceKm, calories: state.today.calories });
        saveState();
      }
    }
  });

  // Seaded ja sammude lisamine menüüsse
  const settingStepGoal = document.getElementById('settingStepGoal');
  const settingStrideLength = document.getElementById('settingStrideLength');
  const settingMapStyle = document.getElementById('settingMapStyle');

  if (settingStepGoal) settingStepGoal.value = state.settings.stepGoal;
  if (settingStrideLength) settingStrideLength.value = state.settings.strideCm;
  if (settingMapStyle) settingMapStyle.value = state.settings.mapLayer;

  if (settingStepGoal) {
    settingStepGoal.addEventListener('change', e => {
      state.settings.stepGoal = Math.max(1000, parseInt(e.target.value, 10) || 10000);
      saveState();
      updateHudUI();
    });
  }

  setupRouteGeneratorUI();
  updateHudUI();
  initSupabase();
});
