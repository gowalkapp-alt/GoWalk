/* ==========================================================================
   GOWALK PRO — APPLICATION LOGIC
   STEP 2: SUPABASE CLOUD SYNC, USER SESSION & PERMANENT STORAGE
   ========================================================================== */

// 1. SUPABASE SEADISTUS (Sisesta siia oma Supabase projekti URL ja Anon/Public Key)
const SUPABASE_URL = 'https://bktvebmplrabwbgwawao.supabase.co'

'; // nt 'https://xyzcompany.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO'; // nt 'eyJhbGciOiJIUzI1NiIsInR5cCI...'

let supabaseClient = null;
let currentUser = null;
let syncTimeout = null;

// Abifunktsioon Supabase SDK automaatseks laadimiseks, kui seda pole index.html-is
async function ensureSupabaseSDK() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase;
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

document.addEventListener('DOMContentLoaded', async () => {
  // Initsialiseeri Lucide vektorikoonid
  if (window.lucide) {
    lucide.createIcons();
  }

  // ==========================================================================
  // KOHALIK JA PILVE ANDMESTRUKTUUR (MITTE MIDAGI EI KUSTU KUNAGI)
  // ==========================================================================

  const STORAGE_KEY = 'gowalk_pro_permanent_v2';
  const DEVICE_ID_KEY = 'gowalk_pro_device_uid';

  // Genereeri püsiv seadme/kasutaja ID juhuks, kui kasutaja pole veel sisse loginud
  function getOrCreateDeviceId() {
    let uid = localStorage.getItem(DEVICE_ID_KEY);
    if (!uid) {
      uid = 'gw_' + crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, uid);
    }
    return uid;
  }

  const defaultState = {
    userId: getOrCreateDeviceId(),
    email: null,
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
    history: [], // Kõik varasemad päevad ja kõnnid jäävad alatiseks alles
    updatedAt: new Date().toISOString()
  };

  let state = loadState();

  function checkDayRollover(targetState) {
    const currentDay = new Date().toISOString().slice(0, 10);
    if (targetState.today && targetState.today.date !== currentDay) {
      if (targetState.today.steps > 0) {
        targetState.history = targetState.history || [];
        // Väldi topeltkirjeid samale kuupäevale
        const exists = targetState.history.some(h => h.date === targetState.today.date && h.steps === targetState.today.steps);
        if (!exists) {
          targetState.history.unshift({ ...targetState.today });
        }
      }
      targetState.today = {
        date: currentDay,
        steps: 0,
        distanceKm: 0,
        calories: 0,
        durationSec: 0
      };
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      checkDayRollover(parsed);
      return {
        ...defaultState,
        ...parsed,
        profile: { ...defaultState.profile, ...(parsed.profile || {}) },
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        today: { ...defaultState.today, ...(parsed.today || {}) },
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch (e) {
      console.error('Kohalike andmete laadimise viga:', e);
      return structuredClone(defaultState);
    }
  }

  function saveState(skipCloud = false) {
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (!skipCloud) {
        scheduleCloudSync();
      }
    } catch (e) {
      console.error('Salvestamise viga:', e);
    }
  }

  // ==========================================================================
  // SUPABASE INITSIALISEERIMINE, SESSIOON & PILVESÜNKRONISEERIMINE
  // ==========================================================================

  const userSyncBadge = document.getElementById('userSyncBadge');
  const statusDot = document.querySelector('.status-dot');

  function updateSyncStatusUI(statusText, isOnline = true) {
    if (userSyncBadge) userSyncBadge.textContent = statusText;
    if (statusDot) {
      statusDot.style.background = isOnline ? '#10b981' : '#f59e0b';
      statusDot.style.boxShadow = isOnline ? '0 0 10px #10b981' : '0 0 10px #f59e0b';
    }
  }

  function isSupabaseConfigured() {
    return (
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes('SINU_SUPABASE') &&
      !SUPABASE_ANON_KEY.includes('SINU_SUPABASE')
    );
  }

  async function initSupabaseAndSession() {
    if (!isSupabaseConfigured()) {
      updateSyncStatusUI('Kohalik mälu (Lisa Supabase võti)', false);
      return;
    }

    try {
      updateSyncStatusUI('Ühendan pilvega...', true);
      const supabaseLib = await ensureSupabaseSDK();
      supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });

      // 1. Kontrolli olemasolevat sessiooni
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData?.session?.user) {
        currentUser = sessionData.session.user;
      } else {
        // 2. Proovi luua automaatne anonüümne sessioon
        const { data: anonData, error: anonError } = await supabaseClient.auth.signInAnonymously();
        if (!anonError && anonData?.user) {
          currentUser = anonData.user;
        }
      }

      if (currentUser) {
        state.userId = currentUser.id;
        state.email = currentUser.email || null;
        if (currentUser.user_metadata?.full_name) {
          state.profile.name = currentUser.user_metadata.full_name;
        }
        if (currentUser.user_metadata?.avatar_url) {
          state.profile.avatar = currentUser.user_metadata.avatar_url;
        }
        renderProfile();
      }

      // Kuula sisselogimise muutusi (nt kui kasutaja logib Google'iga sisse)
      supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          currentUser = session.user;
          state.userId = currentUser.id;
          state.email = currentUser.email || null;
          renderProfile();
          await pullFromCloud();
        }
      });

      // Tõmba pilvest varasemad andmed ja ühenda kohalikega
      await pullFromCloud();
      // Sünkroniseeri viimane seis tagasi pilve
      await syncToCloudNow();

    } catch (err) {
      console.warn('Supabase initsialiseerimise hoiatus:', err);
      updateSyncStatusUI('Võrguühenduseta • Kaitstud lokaalselt', false);
    }
  }

  // Ühendab pilve ja kohaliku ajaloo nii, et mitte ükski samm ega päev ei lähe kaotsi
  function mergeHistories(localHist = [], cloudHist = []) {
    const map = new Map();
    [...cloudHist, ...localHist].forEach(item => {
      if (!item || !item.date) return;
      const key = `${item.date}_${item.steps}`;
      const existing = map.get(item.date);
      if (!existing || (item.steps || 0) > (existing.steps || 0)) {
        map.set(item.date, item);
      } else if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }

  async function pullFromCloud() {
    if (!supabaseClient) return;
    const activeId = currentUser?.id || state.userId;

    try {
      const { data, error } = await supabaseClient
        .from('user_walk_data')
        .select('*')
        .eq('user_id', activeId)
        .maybeSingle();

      if (error) throw error;

      if (data && data.payload) {
        const cloud = data.payload;
        checkDayRollover(cloud);

        // Võta tänase päeva suurim sammude arv (et midagi ei läheks kaduma)
        if (cloud.today && cloud.today.date === state.today.date) {
          if ((cloud.today.steps || 0) > state.today.steps) {
            state.today = { ...cloud.today };
          }
        }

        // Ühenda kogu varasem ajalugu
        state.history = mergeHistories(state.history, cloud.history || []);

        // Taasta profiil ja seaded, kui kohalik on veel vaikimisi
        if (cloud.profile?.name && state.profile.name === 'Kõndija Pro') {
          state.profile.name = cloud.profile.name;
        }
        if (cloud.profile?.avatar && state.profile.avatar.includes('seed=GoWalkPro')) {
          state.profile.avatar = cloud.profile.avatar;
        }
        if (cloud.settings) {
          state.settings = { ...state.settings, ...cloud.settings };
        }
        if (cloud.connectedProviders) {
          state.connectedProviders = { ...cloud.connectedProviders, ...state.connectedProviders };
        }

        saveState(true);
        renderProfile();
        updateHudUI();
      }
      updateSyncStatusUI('Andmed kaitstud • Pilves ✓', true);
    } catch (err) {
      console.warn('Pilvest laadimise info:', err.message);
      updateSyncStatusUI('Kaitstud lokaalselt', false);
    }
  }

  function scheduleCloudSync() {
    if (!supabaseClient) return;
    updateSyncStatusUI('Sünkroniseerin pilvega...', true);
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncToCloudNow();
    }, 1200);
  }

  async function syncToCloudNow() {
    if (!supabaseClient) return;
    const activeId = currentUser?.id || state.userId;

    const totalHistoricalSteps = state.history.reduce((sum, h) => sum + (h.steps || 0), 0) + state.today.steps;

    try {
      const { error } = await supabaseClient
        .from('user_walk_data')
        .upsert(
          {
            user_id: activeId,
            email: state.email || null,
            display_name: state.profile.name,
            today_steps: state.today.steps,
            total_steps: totalHistoricalSteps,
            payload: state,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
      updateSyncStatusUI('Andmed kaitstud • Pilves ✓', true);
    } catch (err) {
      console.warn('Pilve salvestamise hoiatus:', err.message);
      updateSyncStatusUI('Ootel (Salvestatud seadmesse)', false);
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

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      closeDrawer();

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

  document.querySelectorAll('.close-subview').forEach(btn => {
    btn.addEventListener('click', () => {
      subviewModals.forEach(m => m.classList.remove('open'));
      navItems.forEach(n => n.classList.remove('active'));
      document.querySelector('.nav-item[data-target="home"]').classList.add('active');
    });
  });

  document.getElementById('quickSyncBtn').addEventListener('click', () => {
    syncToCloudNow();
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
