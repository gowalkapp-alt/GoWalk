/* ==========================================================================
   GOWALK PRO — APPLICATION LOGIC (STEP 1: UI, DRAWER, MAP & PERMANENT STORAGE)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initsialiseeri Lucide vektorikoonid
  if (window.lucide) {
    lucide.createIcons();
  }

  // 2. Püsivate andmete struktuur (mitte midagi ei kustu kunagi)
  const STORAGE_KEY = 'gowalk_pro_permanent_v2';
  const defaultState = {
    profile: {
      name: 'Kõndija Pro',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoWalkPro'
    },
    settings: {
      stepGoal: 10000,
      strideCm: 76,
      mapLayer: 'dark'
    },
    today: {
      date: new Date().toISOString().slice(0, 10),
      steps: 0,
      distanceKm: 0,
      calories: 0,
      durationSec: 0
    },
    connectedProviders: {},
    history: [] // Kõik varasemad päevad ja kõnnid jäävad alatiseks alles
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);

      // Kui on alanud uus kuupäev, arhiveeri eilne päev ajalukku (mitte kunagi ära kustuta!)
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
      return { ...defaultState, ...parsed };
    } catch (e) {
      console.error('Andmete laadimise viga:', e);
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Salvestamise viga:', e);
    }
  }

  // ==========================================================================
  // LIUGMENÜÜ (DRAWER) & ALAMVAADETE NAVIGATSIOON
  // ==========================================================================

  const sidebarDrawer = document.getElementById('sidebarDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const navItems = document.querySelectorAll('.nav-item');
  const subviewModals = document.querySelectorAll('.subview-modal');

  function openDrawer() {
    sidebarDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
  }

  function closeDrawer() {
    sidebarDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  }

  openDrawerBtn.addEventListener('click', openDrawer);
  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  // Menüüpunktidele vajutamine
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      closeDrawer();

      // Sulge kõik avatud alamvaated
      subviewModals.forEach(m => m.classList.remove('open'));

      if (targetId !== 'home') {
        const modal = document.getElementById(targetId);
        if (modal) {
          if (targetId === 'statsModal') renderStatsAndHistory();
          modal.classList.add('open');
        }
      } else {
        setTimeout(() => map.invalidateSize(), 200);
      }
    });
  });

  // Alamvaadete sulgemisnupud
  document.querySelectorAll('.close-subview').forEach(btn => {
    btn.addEventListener('click', () => {
      subviewModals.forEach(m => m.classList.remove('open'));
      navItems.forEach(n => n.classList.remove('active'));
      document.querySelector('.nav-item[data-target="home"]').classList.add('active');
    });
  });

  // Kiire sünkroniseerimise nupp üleval paremal
  document.getElementById('quickSyncBtn').addEventListener('click', () => {
    document.getElementById('syncModal').classList.add('open');
  });

  // ==========================================================================
  // KASUTAJAPROFIILI MUUTMINE (NIMI & AVATAR)
  // ==========================================================================

  const userNameDisplay = document.getElementById('userNameDisplay');
  const userAvatar = document.getElementById('userAvatar');

  function renderProfile() {
    userNameDisplay.textContent = state.profile.name;
    userAvatar.src = state.profile.avatar;
  }

  document.getElementById('editNameBtn').addEventListener('click', () => {
    const newName = prompt('Sisesta oma kasutajanimi:', state.profile.name);
    if (newName && newName.trim().length > 0) {
      state.profile.name = newName.trim();
      saveState();
      renderProfile();
    }
  });

  document.getElementById('editAvatarBtn').addEventListener('click', () => {
    const randomSeed = 'GoWalk_' + Math.floor(Math.random() * 9999);
    state.profile.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomSeed}`;
    saveState();
    renderProfile();
  });

  // ==========================================================================
  // TÄISEKRAANI KAART (4 KIHTI + LOHISTATAV PIN A + VAHEPUNKTID)
  // ==========================================================================

  const map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([58.3859, 24.4971], 14); // Vaikimisi Pärnu / Eesti vaade

  const tileLayers = {
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

  let activeLayer = tileLayers[state.settings.mapLayer] || tileLayers.dark;
  activeLayer.addTo(map);

  function switchMapLayer(layerKey) {
    if (!tileLayers[layerKey]) return;
    map.removeLayer(activeLayer);
    activeLayer = tileLayers[layerKey];
    activeLayer.addTo(map);
    state.settings.mapLayer = layerKey;
    saveState();

    document.querySelectorAll('.layer-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.layer === layerKey);
    });
    document.getElementById('settingMapStyle').value = layerKey;
  }

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => switchMapLayer(chip.dataset.layer));
  });

  // Alguspunkt (Pin A - vabalt lohistatav) ja vahepunktid
  let waypoints = [];
  let markers = [];
  let routeLine = L.polyline([], {
    color: '#10b981',
    weight: 5,
    opacity: 0.9
  }).addTo(map);

  function createPinIcon(label, isStart = false) {
    const bg = isStart ? '#10b981' : '#06b6d4';
    return L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:${bg};color:#03150e;font-family:'Plus Jakarta Sans',sans-serif;
        font-weight:800;font-size:12px;display:flex;align-items:center;
        justify-content:center;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.45);
      ">${label}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function recalculateRouteMetrics() {
    let totalMeters = 0;
    for (let i = 1; i < waypoints.length; i++) {
      totalMeters += map.distance(waypoints[i - 1], waypoints[i]);
    }
    const routeKm = totalMeters / 1000;
    const strideMeters = (state.settings.strideCm || 76) / 100;
    const routeSteps = Math.round(totalMeters / strideMeters);

    if (waypoints.length > 1) {
      state.today.distanceKm = +(routeKm).toFixed(2);
      state.today.steps = Math.max(state.today.steps, routeSteps);
      state.today.calories = Math.round(state.today.steps * 0.04);
      saveState();
      updateHudUI();
    }
  }

  function rebuildWaypoints() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    routeLine.setLatLngs(waypoints);

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

    recalculateRouteMetrics();
  }

  map.on('click', e => {
    waypoints.push(e.latlng);
    rebuildWaypoints();
  });

  document.getElementById('undoWaypointBtn').addEventListener('click', () => {
    if (waypoints.length > 0) {
      waypoints.pop();
      rebuildWaypoints();
    }
  });

  document.getElementById('clearRouteBtn').addEventListener('click', () => {
    waypoints = [];
    rebuildWaypoints();
  });

  document.getElementById('locateMeBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView(latlng, 16);
      if (waypoints.length === 0) {
        waypoints.push(latlng);
        rebuildWaypoints();
      }
    });
  });

  // ==========================================================================
  // SAMMUDE RING, TAIMER JA KÕNDIMISE ALUSTAMINE
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 42; // r=42
  let isWalking = false;
  let walkTimer = null;

  function formatDuration(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateHudUI() {
    const steps = state.today.steps;
    const goal = state.settings.stepGoal || 10000;
    const pct = Math.min(100, Math.round((steps / goal) * 100));

    document.getElementById('liveSteps').textContent = steps.toLocaleString('et-EE');
    document.getElementById('goalStepsLabel').textContent = goal.toLocaleString('et-EE');
    document.getElementById('stepPercentText').textContent = `${pct}%`;

    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    document.getElementById('stepRingProgress').style.strokeDashoffset = offset;

    const strideMeters = (state.settings.strideCm || 76) / 100;
    const calcKm = ((steps * strideMeters) / 1000).toFixed(2);
    state.today.distanceKm = Math.max(state.today.distanceKm, parseFloat(calcKm));
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
      startWalkText.textContent = 'Peata ja salvesta kõnd';
      walkTimer = setInterval(() => {
        state.today.durationSec += 1;
        state.today.steps += 2; // Simulatsioon/anduri tugi aktiivsel kõnnil
        updateHudUI();
      }, 1000);
    } else {
      clearInterval(walkTimer);
      startWalkText.textContent = 'Alusta kõndimist';
      // Salvesta lõpetatud jalutuskäik alalisse ajalukku
      if (state.today.steps > 0) {
        state.history.unshift({
          date: new Date().toLocaleString('et-EE'),
          steps: state.today.steps,
          distanceKm: state.today.distanceKm,
          calories: state.today.calories
        });
        saveState();
      }
    }
  });

  // Sammude käsitsi kiirlisamine (+)
  document.getElementById('quickAddStepsBtn').addEventListener('click', () => {
    const input = prompt('Lisa sammud käsitsi:', '1000');
    const added = parseInt(input, 10);
    if (!isNaN(added) && added > 0) {
      state.today.steps += added;
      saveState();
      updateHudUI();
    }
  });

  // ==========================================================================
  // STATISTIKA, TERVISE SÜNKRONISEERIMINE & SEADED
  // ==========================================================================

  function renderStatsAndHistory() {
    const historicalSteps = state.history.reduce((sum, item) => sum + (item.steps || 0), 0);
    const totalSteps = historicalSteps + state.today.steps;
    const totalKm = ((totalSteps * (state.settings.strideCm / 100)) / 1000).toFixed(1);

    document.getElementById('statTotalSteps').textContent = totalSteps.toLocaleString('et-EE');
    document.getElementById('statTotalKm').textContent = `${totalKm} km`;
    document.getElementById('statTotalWalks').textContent = state.history.length + (state.today.steps > 0 ? 1 : 0);
    document.getElementById('statStreak').textContent = `${Math.max(1, state.history.length + 1)} päeva`;

    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    const allRecords = [
      {
        date: `Täna (${state.today.date})`,
        steps: state.today.steps,
        distanceKm: state.today.distanceKm,
        calories: state.today.calories
      },
      ...state.history
    ];

    allRecords.forEach(rec => {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `
        <div class="history-item-left">
          <span class="history-date">${rec.date}</span>
          <span class="history-meta">${Number(rec.distanceKm || 0).toFixed(2)} km • ${rec.calories || 0} kcal</span>
        </div>
        <span class="history-steps-badge">${Number(rec.steps || 0).toLocaleString('et-EE')} sammu</span>
      `;
      historyList.appendChild(row);
    });
  }

  // Terviseandmete ühendamise nupud (Samsung, Apple, Health Connect, Fitbit, Xiaomi, Garmin, Huawei)
  document.querySelectorAll('[data-connect]').forEach(btn => {
    const provider = btn.getAttribute('data-connect');
    if (state.connectedProviders[provider]) {
      btn.classList.add('connected');
      btn.textContent = 'Ühendatud ✓';
    }

    btn.addEventListener('click', () => {
      const isConnected = !state.connectedProviders[provider];
      state.connectedProviders[provider] = isConnected;
      btn.classList.toggle('connected', isConnected);
      btn.textContent = isConnected ? 'Ühendatud ✓' : 'Ühenda';
      saveState();
    });
  });

  // Seadete salvestamine
  const settingStepGoal = document.getElementById('settingStepGoal');
  const settingStrideLength = document.getElementById('settingStrideLength');
  const settingMapStyle = document.getElementById('settingMapStyle');

  settingStepGoal.value = state.settings.stepGoal;
  settingStrideLength.value = state.settings.strideCm;
  settingMapStyle.value = state.settings.mapLayer;

  settingStepGoal.addEventListener('change', e => {
    state.settings.stepGoal = Math.max(1000, parseInt(e.target.value, 10) || 10000);
    saveState();
    updateHudUI();
  });

  settingStrideLength.addEventListener('change', e => {
    state.settings.strideCm = Math.max(40, parseInt(e.target.value, 10) || 76);
    saveState();
    updateHudUI();
  });

  settingMapStyle.addEventListener('change', e => {
    switchMapLayer(e.target.value);
  });

  // Kogu ajaloo eksportimine JSON failina
  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `gowalk_ajalugu_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  });

  // Alglaadimine
  renderProfile();
  switchMapLayer(state.settings.mapLayer);
  updateHudUI();
});
