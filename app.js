/* ==========================================================================
   GOWALK PRO — APPLICATION LOGIC
   MISSING STEPS HOME FOCUS + SAFE LIT LOOP GENERATOR + STRICT ISOLATION
   ========================================================================== */

// 1. SUPABASE & ADMIN SEADISTUS
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
  // Eemalda kohe kella/tootjate sünkroniseerimise menüüpunkt ja modaal
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

  // Planeeritud raja info (ei kirjuta üle kasutaja tegelikke tänaseid samme!)
  let plannedRoute = {
    steps: 0,
    distanceKm: 0
  };

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
    } catch (e) {
      console.error('Kohaliku salvestamise viga:', e);
    }
    if (!skipCloud) {
      scheduleCloudSync();
    }
  }

  // Tagastab mitu sammu on tänasest eesmärgist puudu
  function getMissingSteps() {
    const goal = Math.max(1000, state.settings.stepGoal || 10000);
    const walked = Math.max(0, state.today.steps || 0);
    return Math.max(0, goal - walked);
  }

  async function performFullLogout() {
    if (syncTimeout) clearTimeout(syncTimeout);
    try {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (e) {
      console.warn('Supabase signOut hoiatus:', e);
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEVICE_UID_KEY);
    window.location.reload();
  }

  // ==========================================================================
  // ADMIN LIGIPÄÄSU KONTROLL & GOOGLE SISSELOGIMINE / VÄLJALOGIMINE
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
        adminActiveEmailText.textContent = email
          ? `Sisselogitud admin: ${email}`
          : 'Admin vaade aktiveeritud';
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
      secretTapTimer = setTimeout(() => {
        secretTapCount = 0;
      }, 2000);

      if (secretTapCount >= 5) {
        secretTapCount = 0;
        state.isAdminUnlocked = !state.isAdminUnlocked;
        saveState();
        checkAdminAccess();
        alert(
          state.isAdminUnlocked
            ? '🛡️ Admin Paneel on nüüd menüüs avatud!'
            : 'Admin Paneel peidetud.'
        );
      }
    });
  }

  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
      if (!supabaseClient) {
        alert('Supabase ühendus pole veel valmis.');
        return;
      }

      if (state.profile.email) {
        const confirmLogout = confirm(
          `Oled sisse logitud kui ${state.profile.email}.\n\nKas soovid välja logida ja seadme vaate puhastada?`
        );
        if (confirmLogout) {
          await performFullLogout();
        }
        return;
      }

      try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
      } catch (err) {
        const manualEmail = prompt(
          'Sisesta oma Google e-posti aadress (nt karmo.riiel@gmail.com või info.gowalk.app@gmail.com):',
          ''
        );
        if (manualEmail && manualEmail.includes('@')) {
          const cleanEmail = manualEmail.trim().toLowerCase();
          await switchUserContext('email_' + cleanEmail, cleanEmail, cleanEmail.split('@')[0], null);
        }
      }
    });
  }

  async function switchUserContext(newUserId, email, fullName, avatarUrl) {
    const previousEmail = (state.profile.email || '').toLowerCase().trim();
    const incomingEmail = (email || '').toLowerCase().trim();
    const isDifferentUser =
      (state.userId && state.userId !== newUserId) ||
      (previousEmail && incomingEmail && previousEmail !== incomingEmail) ||
      (!previousEmail && incomingEmail);

    if (isDifferentUser) {
      state = createFreshState(newUserId);
      plannedRoute = { steps: 0, distanceKm: 0 };
    } else {
      state.userId = newUserId;
    }

    if (email) state.profile.email = email;
    if (fullName) state.profile.name = fullName;
    if (avatarUrl) state.profile.avatar = avatarUrl;

    saveState(true);
    renderProfile();
    updateHudUI();
    checkAdminAccess();

    await pullFromCloud(true);
    await pullPromoCodesFromCloud();
    await pushToCloud();
  }

  // ==========================================================================
  // SUPABASE SESSIOON & PILVESÜNKRONISEERIMINE (ISOLEERITUD KONTODEGA)
  // ==========================================================================

  const userSyncBadge = document.getElementById('userSyncBadge');

  function setSyncStatus(text, isOnline = true) {
    if (userSyncBadge) userSyncBadge.textContent = text;
    const dot = document.querySelector('.status-dot');
    if (dot) dot.style.background = isOnline ? '#8b5cf6' : '#f59e0b';
  }

  async function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setSyncStatus('Kohalik mälu', false);
      return;
    }

    try {
      setSyncStatus('Ühendan pilvega...', true);
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
        const incomingEmail = currentUser.email || null;
        const incomingName = currentUser.user_metadata?.full_name || null;
        const incomingAvatar = currentUser.user_metadata?.avatar_url || null;

        await switchUserContext(currentUser.id, incomingEmail, incomingName, incomingAvatar);
      } else {
        renderProfile();
        checkAdminAccess();
        await pullFromCloud(false);
        await pullPromoCodesFromCloud();
      }
    } catch (err) {
      console.warn('Supabase hoiatus:', err);
      setSyncStatus('Kaitstud • Kohalik varukoopia', false);
    }
  }

  function mergeHistories(localHist = [], cloudHist = []) {
    const mapByDate = new Map();
    [...cloudHist, ...localHist].forEach(item => {
      if (!item || !item.date) return;
      const existing = mapByDate.get(item.date);
      if (!existing || (item.steps || 0) > (existing.steps || 0)) {
        mapByDate.set(item.date, item);
      }
    });
    return Array.from(mapByDate.values());
  }

  async function pullFromCloud(strictAccountLoad = false) {
    if (!supabaseClient || !state.userId) return;
    try {
      const { data, error } = await supabaseClient
        .from('user_states')
        .select('state_json, updated_at')
        .eq('user_id', state.userId)
        .maybeSingle();

      if (error) throw error;

      if (data?.state_json) {
        const cloud = data.state_json;

        if (strictAccountLoad) {
          state.history = Array.isArray(cloud.history) ? cloud.history : [];
          if (cloud.today && cloud.today.date === state.today.date) {
            state.today = { ...state.today, ...cloud.today };
          } else {
            if (cloud.today && cloud.today.steps > 0) {
              state.history = mergeHistories(state.history, [cloud.today]);
            }
            state.today = {
              date: new Date().toISOString().slice(0, 10),
              steps: 0,
              distanceKm: 0,
              calories: 0,
              durationSec: 0
            };
          }
          if (cloud.profile) {
            state.profile = {
              ...state.profile,
              ...cloud.profile,
              email: state.profile.email || cloud.profile.email
            };
          }
          if (cloud.settings) {
            state.settings = { ...state.settings, ...cloud.settings };
          }
        } else {
          state.history = mergeHistories(state.history, cloud.history || []);
          if (cloud.today && cloud.today.date === state.today.date) {
            if ((cloud.today.steps || 0) > (state.today.steps || 0)) {
              state.today = { ...state.today, ...cloud.today };
            }
          } else if (cloud.today && cloud.today.steps > 0) {
            state.history = mergeHistories(state.history, [cloud.today]);
          }
          if (cloud.profile) {
            state.profile = { ...state.profile, ...cloud.profile };
          }
          if (cloud.settings) {
            state.settings = { ...state.settings, ...cloud.settings };
          }
        }

        saveState(true);
        renderProfile();
        updateHudUI();
        checkAdminAccess();
      }
      setSyncStatus('Andmed kaitstud • Pilves ✓', true);
    } catch (err) {
      setSyncStatus('Kaitstud • Kohalik + Pilv', true);
    }
  }

  async function pushToCloud() {
    if (!supabaseClient || !state.userId) return;
    try {
      const payload = {
        user_id: state.userId,
        profile_name: state.profile.name,
        country: state.profile.country || detectCountryName(),
        total_steps:
          state.today.steps +
          state.history.reduce((sum, item) => sum + (item.steps || 0), 0),
        state_json: state,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabaseClient
        .from('user_states')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;
      setSyncStatus('Andmed kaitstud • Pilves ✓', true);
    } catch (err) {
      setSyncStatus('Salvestatud seadmesse ✓', false);
    }
  }

  function scheduleCloudSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      pushToCloud();
    }, 1200);
  }

  // ==========================================================================
  // SOODUSKOODID & ADMIN STATISTIKA
  // ==========================================================================

  async function pullPromoCodesFromCloud() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('promo_codes')
        .select('code, discount, label');
      if (!error && Array.isArray(data) && data.length > 0) {
        state.promoCodes = data;
        saveState(true);
      }
    } catch (e) {}
  }

  function renderAdminPromoCodes() {
    const listEl = document.getElementById('adminPromoList');
    const countEl = document.getElementById('adminTotalCodes');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (countEl) countEl.textContent = state.promoCodes.length;

    state.promoCodes.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'promo-row-item';
      row.innerHTML = `
        <div>
          <span class="promo-code-tag">${item.code}</span>
          <span class="promo-discount-pill">${item.discount === 100 ? 'TASUTA (100%)' : `-${item.discount}%`}</span>
        </div>
        <button class="btn-delete-promo" data-idx="${idx}">Kustuta</button>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.btn-delete-promo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const removed = state.promoCodes[idx];
        state.promoCodes.splice(idx, 1);
        saveState();
        renderAdminPromoCodes();

        if (supabaseClient && removed) {
          try {
            await supabaseClient.from('promo_codes').delete().eq('code', removed.code);
          } catch (e) {}
        }
      });
    });
  }

  const createPromoBtn = document.getElementById('createPromoBtn');
  if (createPromoBtn) {
    createPromoBtn.addEventListener('click', async () => {
      const codeInput = document.getElementById('newPromoCodeInput');
      const discountSelect = document.getElementById('newPromoDiscountSelect');
      const cleanCode = (codeInput.value || '').trim().toUpperCase();
      const discount = parseInt(discountSelect.value, 10);

      if (!cleanCode) {
        alert('Palun sisesta sooduskoodi nimi (nt SUVI50 või VIPTASUTA).');
        return;
      }

      const label = discount === 100 ? 'TASUTA (100% PRO)' : `-${discount}% Soodustus`;
      const newEntry = { code: cleanCode, discount, label };

      state.promoCodes = state.promoCodes.filter(c => c.code !== cleanCode);
      state.promoCodes.unshift(newEntry);
      codeInput.value = '';
      saveState();
      renderAdminPromoCodes();

      if (supabaseClient) {
        try {
          await supabaseClient.from('promo_codes').upsert(newEntry, { onConflict: 'code' });
        } catch (e) {}
      }
    });
  }

  const redeemPromoBtn = document.getElementById('redeemPromoBtn');
  if (redeemPromoBtn) {
    redeemPromoBtn.addEventListener('click', () => {
      const input = document.getElementById('userPromoInput');
      const feedback = document.getElementById('promoFeedbackMsg');
      const entered = (input.value || '').trim().toUpperCase();

      if (!entered) return;

      const match = state.promoCodes.find(p => p.code.toUpperCase() === entered);
      if (match) {
        state.profile.activePromo = match.code;
        state.profile.plan =
          match.discount === 100
            ? 'PRO Täisversioon (TASUTA)'
            : `PRO (-${match.discount}% Soodustus)`;
        feedback.style.color = '#c084fc';
        feedback.textContent = `✓ Kood "${match.code}" aktiveeritud: ${state.profile.plan}!`;
        input.value = '';
        saveState();
        renderProfile();
      } else {
        feedback.style.color = '#ef4444';
        feedback.textContent = '✕ Sellist sooduskoodi ei leitud või see on aegunud.';
      }
    });
  }

  async function loadAdminDashboard() {
    renderAdminPromoCodes();
    const countryListEl = document.getElementById('adminCountryList');
    if (!countryListEl) return;
    countryListEl.innerHTML = '<div class="subview-lead">Laen pilvest riikide statistikat...</div>';

    let rows = [
      {
        country: state.profile.country || detectCountryName(),
        total_steps:
          state.today.steps +
          state.history.reduce((sum, item) => sum + (item.steps || 0), 0)
      }
    ];

    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('user_states')
          .select('country, total_steps');
        if (!error && Array.isArray(data) && data.length > 0) {
          rows = data;
        }
      } catch (e) {}
    }

    const totalUsers = rows.length;
    const globalSteps = rows.reduce((sum, r) => sum + (Number(r.total_steps) || 0), 0);

    const countryCounts = {};
    rows.forEach(r => {
      const c = r.country || '🌍 Muu';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);

    document.getElementById('adminTotalUsers').textContent = totalUsers.toLocaleString('et-EE');
    document.getElementById('adminTotalCountries').textContent = sortedCountries.length;
    document.getElementById('adminGlobalSteps').textContent = globalSteps.toLocaleString('et-EE');

    countryListEl.innerHTML = '';
    sortedCountries.forEach(([countryName, count]) => {
      const pct = Math.round((count / totalUsers) * 100);
      const item = document.createElement('div');
      item.className = 'country-row';
      item.innerHTML = `
        <div class="country-row-top">
          <span>${countryName}</span>
          <span>${count} kasutajat (${pct}%)</span>
        </div>
        <div class="country-bar-bg">
          <div class="country-bar-fill" style="width: ${pct}%"></div>
        </div>
      `;
      countryListEl.appendChild(item);
    });
  }

  const refreshAdminBtn = document.getElementById('refreshAdminStatsBtn');
  if (refreshAdminBtn) {
    refreshAdminBtn.addEventListener('click', loadAdminDashboard);
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
          if (targetId === 'adminModal') loadAdminDashboard();
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
      const homeNav = document.querySelector('.nav-item[data-target="home"]');
      if (homeNav) homeNav.classList.add('active');
    });
  });

  // Ülemine parem nupp: kiire päeva eesmärgi või tehtud sammude muutmine
  const quickSyncBtn = document.getElementById('quickSyncBtn');
  if (quickSyncBtn) {
    quickSyncBtn.title = 'Muuda päeva sammueesmärki';
    quickSyncBtn.innerHTML = '<i data-lucide="target"></i>';
    if (window.lucide) lucide.createIcons();
    quickSyncBtn.addEventListener('click', promptEditStepGoal);
  }

  function promptEditCurrentSteps() {
    const entered = prompt(
      `Kui palju samme oled täna juba teinud (nt telefoni või kella järgi)?\n\nSinu päeva eesmärk on ${state.settings.stepGoal.toLocaleString('et-EE')} sammu.\nGoWalk arvutab kohe välja, mitu sammu on sul veel täna puudu:`,
      state.today.steps
    );
    if (entered === null) return;
    const parsed = Math.max(0, parseInt(entered.replace(/\s+/g, ''), 10) || 0);
    const strideMeters = (state.settings.strideCm || 76) / 100;
    state.today.steps = parsed;
    state.today.distanceKm = +((parsed * strideMeters) / 1000).toFixed(2);
    state.today.calories = Math.round(parsed * 0.04);
    saveState();
    updateHudUI();
  }

  function promptEditStepGoal() {
    const entered = prompt(
      'Sisesta oma tänane sammude eesmärk (nt 8000 või 10000):',
      state.settings.stepGoal || 10000
    );
    if (entered === null) return;
    const parsed = Math.max(1000, parseInt(entered.replace(/\s+/g, ''), 10) || 10000);
    state.settings.stepGoal = parsed;
    const settingStepGoalEl = document.getElementById('settingStepGoal');
    if (settingStepGoalEl) settingStepGoalEl.value = parsed;
    saveState();
    updateHudUI();
  }

  // Lubame ka otse suurele sammunumbrile ja eesmärgile vajutades neid muuta
  const liveStepsEl = document.getElementById('liveSteps');
  if (liveStepsEl) {
    liveStepsEl.title = 'Puuduta, et sisestada tänased tehtud sammud';
    liveStepsEl.addEventListener('click', promptEditCurrentSteps);
  }
  const goalStepsLabelEl = document.querySelector('.steps-goal-label');
  if (goalStepsLabelEl) {
    goalStepsLabelEl.title = 'Puuduta, et muuta päeva eesmärki';
    goalStepsLabelEl.addEventListener('click', promptEditStepGoal);
  }

  // ==========================================================================
  // KASUTAJAPROFIILI MUUTMINE
  // ==========================================================================

  const userNameDisplay = document.getElementById('userNameDisplay');
  const userAvatar = document.getElementById('userAvatar');
  const userPlanBadge = document.getElementById('userPlanBadge');

  function renderProfile() {
    if (userNameDisplay) userNameDisplay.textContent = state.profile.name;
    if (userAvatar) userAvatar.src = state.profile.avatar;
    if (userPlanBadge) userPlanBadge.textContent = state.profile.plan || 'Standard konto';
    if (googleAuthText) {
      googleAuthText.textContent = state.profile.email
        ? `Logi välja (${state.profile.email})`
        : 'Ühenda Google\'i kontoga';
    }
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
  // TÄISEKRAANI KAART + PUUDUVATE SAMMUDE RINGI GENERAATOR
  // ==========================================================================

  const map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([58.3859, 24.4971], 14);

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
    const styleSelect = document.getElementById('settingMapStyle');
    if (styleSelect) styleSelect.value = layerKey;
  }

  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => switchMapLayer(chip.dataset.layer));
  });

  let waypoints = [];
  let markers = [];
  let routeLine = L.polyline([], {
    color: '#8b5cf6',
    weight: 5,
    opacity: 0.92
  }).addTo(map);

  let lastGeneratedBearing = Math.random() * 2 * Math.PI;
  let routeVariantCounter = 0;
  let lastTargetSteps = 0;
  let floatingShuffleBtn = null;
  let cachedSafeNodes = { key: '', nodes: [] };

  function updateFloatingShuffleLabel() {
    if (!floatingShuffleBtn) return;
    const prefix = state.settings.safeLitOnly !== false ? '🔦' : '🌲';
    const routeInfo =
      plannedRoute.steps > 0
        ? `Rada: ${plannedRoute.steps.toLocaleString('et-EE')} sammu (${plannedRoute.distanceKm.toFixed(2)} km) • `
        : '';
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

  // Salvestab planeeritud raja pikkuse ilma kasutaja tänaseid tehtud samme 100% peale kirjutamata
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
        updateHudUI();
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
    updateHudUI();
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

  // ==========================================================================
  // AVALEHE "PUUDUVAD SAMMUD" RIBA + TRAJEKTOORI GENERAATOR
  // ==========================================================================

  function setupMissingStepsHomeBar() {
    const bottomHud = document.querySelector('.bottom-hud');
    const actionRow = document.querySelector('.hud-action-row');
    if (!bottomHud || !actionRow) return;

    const missingBar = document.createElement('div');
    missingBar.id = 'missingStepsBanner';
    missingBar.className = 'missing-steps-bar';
    missingBar.innerHTML = `
      <div class="missing-info-col">
        <div class="missing-title" id="missingStepsTitle">🎯 Puudu: 10 000 sammu</div>
        <div class="missing-sub" id="missingStepsSub">Vajuta "Puuduv ring", et rada kaardile luua</div>
      </div>
      <div class="missing-actions-group">
        <button type="button" id="setWalkedStepsBtn" class="btn-set-current-steps" title="Sisesta täna juba tehtud sammud">
          ✏️ Lisa tehtud
        </button>
        <button type="button" id="generateMissingStepsRouteBtn" class="btn-fill-missing-route">
          ✨ Puuduv ring
        </button>
      </div>
    `;
    bottomHud.insertBefore(missingBar, actionRow);

    document.getElementById('setWalkedStepsBtn').addEventListener('click', promptEditCurrentSteps);

    document.getElementById('generateMissingStepsRouteBtn').addEventListener('click', () => {
      const missing = getMissingSteps();
      const stepsToGenerate = missing >= 300 ? missing : 3000;
      lastTargetSteps = stepsToGenerate;
      const stepsInput = document.getElementById('targetRouteStepsInput');
      if (stepsInput) stepsInput.value = stepsToGenerate;
      generateLoopRouteForSteps(stepsToGenerate);
    });
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
          <span class="spark">✨</span>
          <span>Puuduvate Sammude Rajageneraator</span>
        </div>
        <button id="closeRouteGenBtn" class="icon-btn" style="width:28px;height:28px;">✕</button>
      </div>
      <p class="route-gen-sub" id="routeGenMissingHint">
        Koosta täpselt puuduvate sammude jagu ringtrajektoor alguspunktist (Pin A):
      </p>

      <button type="button" id="safeLitRouteToggleBtn" class="safe-route-toggle ${isSafeDefault ? 'active' : ''}">
        <div class="safe-toggle-left">
          <span class="safe-toggle-icon" id="safeToggleEmoji">${isSafeDefault ? '🔦' : '🌲'}</span>
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
        <button class="preset-pill active" id="presetMissingPill" data-steps="missing">Puuduvad</button>
        <button class="preset-pill" data-steps="3000">3 000</button>
        <button class="preset-pill" data-steps="5000">5 000</button>
        <button class="preset-pill" data-steps="8000">8 000</button>
      </div>
      <div class="route-custom-row">
        <input type="number" id="targetRouteStepsInput" class="route-custom-input" value="${initialMissing}" step="500" min="300" placeholder="Puuduvad sammud..." />
        <button id="generateSmartRouteBtn" class="btn-generate-go">Koosta ring</button>
      </div>
      <button id="shuffleRoutePopoverBtn" class="btn-shuffle-route">
        🔄 Teine suund (Shuffle)
      </button>
    `;
    viewport.appendChild(popover);

    if (window.lucide) lucide.createIcons();

    const stepsInput = document.getElementById('targetRouteStepsInput');
    const missingHint = document.getElementById('routeGenMissingHint');

    const openAndSyncPopover = () => {
      const missing = getMissingSteps();
      const suggested = missing >= 300 ? missing : 3000;
      stepsInput.value = suggested;
      if (missing > 0) {
        missingHint.textContent = `Sul on täna eesmärgist puudu ${missing.toLocaleString('et-EE')} sammu. Koosta täpselt puuduv ring:`;
      } else {
        missingHint.textContent = 'Päeva eesmärk on täis! Võid genereerida lisaringi (nt 3 000 sammu):';
      }
      popover.classList.toggle('open');
    };

    magicFab.addEventListener('click', openAndSyncPopover);
    document.getElementById('closeRouteGenBtn').addEventListener('click', () => {
      popover.classList.remove('open');
    });

    const safeToggleBtn = document.getElementById('safeLitRouteToggleBtn');
    const safeToggleEmoji = document.getElementById('safeToggleEmoji');
    const safeToggleSubtext = document.getElementById('safeToggleSubtext');
    const safeToggleBadge = document.getElementById('safeToggleBadge');

    safeToggleBtn.addEventListener('click', () => {
      state.settings.safeLitOnly = !(state.settings.safeLitOnly !== false);
      const active = state.settings.safeLitOnly;
      safeToggleBtn.classList.toggle('active', active);
      safeToggleEmoji.textContent = active ? '🔦' : '🌲';
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
    if (!safeNodes || safeNodes.length === 0) return idealLatLng;
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
    if (!Array.isArray(latlngs) || latlngs.length < 8) return latlngs;
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

  // Genereerib ringtrajektoori täpselt etteantud (nt puuduvate) sammude jaoks,
  // ilma et muudaks kasutaja päeva sammueesmärki või juba kõnnitud sammude arvu!
  async function generateLoopRouteForSteps(targetSteps) {
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
      floatingShuffleBtn.innerHTML = '<span>⏳ Arvutan puuduvate sammude ringi...</span>';
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

  // ==========================================================================
  // SAMMUDE RING, PUUDUVAD SAMMUD JA PÄRIS GPS-KÕNDIMINE
  // ==========================================================================

  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;
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
    document.getElementById('goalStepsLabel').textContent = goal.toLocaleString('et-EE');
    document.getElementById('stepPercentText').textContent = `${pct}%`;

    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    document.getElementById('stepRingProgress').style.strokeDashoffset = offset;

    const strideMeters = (state.settings.strideCm || 76) / 100;
    const walkedKm = +((steps * strideMeters) / 1000).toFixed(2);
    state.today.distanceKm = walkedKm;
    state.today.calories = Math.round(steps * 0.04);

    document.getElementById('liveDistance').textContent = state.today.distanceKm.toFixed(2);
    document.getElementById('liveCalories').textContent = state.today.calories;
    document.getElementById('liveDuration').textContent = formatDuration(state.today.durationSec);

    // Uuenda avalehe "Puudu eesmärgist" riba
    const missingBanner = document.getElementById('missingStepsBanner');
    const missingTitle = document.getElementById('missingStepsTitle');
    const missingSub = document.getElementById('missingStepsSub');
    const generateMissingBtn = document.getElementById('generateMissingStepsRouteBtn');

    if (missingBanner && missingTitle && missingSub && generateMissingBtn) {
      if (missing > 0) {
        const missingKm = ((missing * strideMeters) / 1000).toFixed(2);
        missingBanner.classList.remove('goal-completed');
        missingTitle.textContent = `🎯 Eesmärgist puudu: ${missing.toLocaleString('et-EE')} sammu`;
        if (plannedRoute.steps > 0) {
          missingSub.textContent = `Kaardil valmis: ${plannedRoute.steps.toLocaleString('et-EE')} sammu (${plannedRoute.distanceKm.toFixed(2)} km)`;
        } else {
          missingSub.textContent = `Vaja kõndida veel ~${missingKm} km`;
        }
        generateMissingBtn.textContent = `✨ ${missing.toLocaleString('et-EE')} sammu ring`;
      } else {
        missingBanner.classList.add('goal-completed');
        missingTitle.textContent = '🎉 Päeva sammueesmärk on täidetud!';
        missingSub.textContent = `Oled täna teinud ${steps.toLocaleString('et-EE')} sammu. Super töö!`;
        generateMissingBtn.textContent = '✨ Lisaring (3 000)';
      }
    }
  }

  const startWalkBtn = document.getElementById('startWalkBtn');
  const startWalkText = document.getElementById('startWalkText');

  startWalkBtn.addEventListener('click', () => {
    isWalking = !isWalking;
    startWalkBtn.classList.toggle('walking-active', isWalking);

    if (isWalking) {
      startWalkText.textContent = 'Peata ja salvesta kõnd';
      lastGpsLatLng = null;

      walkTimer = setInterval(() => {
        state.today.durationSec += 1;
        updateHudUI();
      }, 1000);

      if (navigator.geolocation) {
        gpsWatchId = navigator.geolocation.watchPosition(
          pos => {
            const currentLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);
            if (lastGpsLatLng) {
              const movedMeters = map.distance(lastGpsLatLng, currentLatLng);
              if (movedMeters >= 4 && movedMeters < 150) {
                const strideMeters = (state.settings.strideCm || 76) / 100;
                const realAddedSteps = Math.round(movedMeters / strideMeters);
                state.today.steps += realAddedSteps;
                lastGpsLatLng = currentLatLng;
                saveState();
                updateHudUI();
              }
            } else {
              lastGpsLatLng = currentLatLng;
            }
          },
          err => console.warn('GPS jälgimise info:', err.message),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
      }
    } else {
      clearInterval(walkTimer);
      if (gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
      }
      startWalkText.textContent = 'Alusta kõndimist';
      if (state.today.steps > 0 || state.today.distanceKm > 0) {
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

  // Alumine parempoolne "+" nupp genereerib kohe puuduvate sammude ringi (või avab valiku)
  const quickAddStepsBtn = document.getElementById('quickAddStepsBtn');
  if (quickAddStepsBtn) {
    quickAddStepsBtn.title = 'Ava puuduvate sammude rajageneraator';
    quickAddStepsBtn.addEventListener('click', () => {
      const popover = document.getElementById('routeGenPopover');
      const stepsInput = document.getElementById('targetRouteStepsInput');
      if (stepsInput) {
        const missing = getMissingSteps();
        stepsInput.value = missing >= 300 ? missing : 3000;
      }
      if (popover) {
        popover.classList.toggle('open');
      }
    });
  }

  // ==========================================================================
  // STATISTIKA & SEADED
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

  if (settingStrideLength) {
    settingStrideLength.addEventListener('change', e => {
      state.settings.strideCm = Math.max(40, parseInt(e.target.value, 10) || 76);
      saveState();
      updateHudUI();
    });
  }

  if (settingMapStyle) {
    settingMapStyle.addEventListener('change', e => {
      switchMapLayer(e.target.value);
    });
  }

  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute('href', dataStr);
      dlAnchor.setAttribute('download', `gowalk_ajalugu_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
    });
  }

  // Alglaadimine
  setupMissingStepsHomeBar();
  setupRouteGeneratorUI();
  renderProfile();
  checkAdminAccess();
  switchMapLayer(state.settings.mapLayer);
  updateHudUI();
  initSupabase();
});
