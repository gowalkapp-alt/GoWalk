/* ==========================================================================
   GOWALK PRO — 2. STATE MANAGEMENT, TIER HELPERS & SUPABASE CLOUD SYNC
   ========================================================================== */

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  STORAGE_KEY,
  DEVICE_UID_KEY,
  ACCOUNT_TIERS,
  DEFAULT_PROMO_CODES
} from './config.js';

export let supabaseClient = null;
export let currentUser = null;
let syncTimeout = null;

export const plannedRoute = {
  steps: 0,
  distanceKm: 0
};

export function getOrCreateDeviceUid() {
  let uid = localStorage.getItem(DEVICE_UID_KEY);
  if (!uid) {
    uid = crypto.randomUUID
      ? crypto.randomUUID()
      : 'gw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_UID_KEY, uid);
  }
  return uid;
}

export function detectCountryName() {
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

export function createFreshState(customUserId = null) {
  return {
    userId: customUserId || getOrCreateDeviceUid(),
    isAdminUnlocked: false,
    profile: {
      name: 'Kõndija Pro',
      email: null,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoWalkPro',
      country: detectCountryName(),
      tier: 'pro', // 'standard' | 'lite' | 'pro'
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
    promoCodes: structuredClone(DEFAULT_PROMO_CODES),
    history: [],
    updatedAt: new Date().toISOString()
  };
}

export let state = loadLocalState();

export function loadLocalState() {
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
          : structuredClone(DEFAULT_PROMO_CODES)
    };
  } catch (e) {
    return createFreshState();
  }
}

export function getTierConfig(tierKey = state.profile.tier) {
  const key = String(tierKey || 'pro').toUpperCase();
  return ACCOUNT_TIERS[key] || ACCOUNT_TIERS.PRO;
}

export function setAccountTier(tierId, customPlanLabel = null) {
  const cleanId = String(tierId || 'pro').toLowerCase();
  const cfg = getTierConfig(cleanId);
  state.profile.tier = cfg.id;
  state.profile.plan = customPlanLabel || cfg.planLabel;
  saveState();
}

export function getMissingSteps() {
  const goal = Math.max(1000, state.settings.stepGoal || 10000);
  const walked = Math.max(0, state.today.steps || 0);
  return Math.max(0, goal - walked);
}

export function setSyncStatus(text, isOnline = true) {
  const userSyncBadge = document.getElementById('userSyncBadge');
  if (userSyncBadge) userSyncBadge.textContent = text;
  const dot = document.querySelector('.status-dot');
  if (dot) dot.style.background = isOnline ? '#8b5cf6' : '#f59e0b';
}

export function saveState(skipCloud = false) {
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

export function scheduleCloudSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    pushToCloud();
  }, 1200);
}

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

export async function pullFromCloud(strictAccountLoad = false, onStateUpdated = null) {
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
      if (onStateUpdated) onStateUpdated();
    }
    setSyncStatus('Andmed kaitstud • Pilves ✓', true);
  } catch (err) {
    setSyncStatus('Kaitstud • Kohalik + Pilv', true);
  }
}

export async function pushToCloud() {
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

export async function pullPromoCodesFromCloud() {
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

export async function switchUserContext(newUserId, email, fullName, avatarUrl, onStateUpdated = null) {
  const previousEmail = (state.profile.email || '').toLowerCase().trim();
  const incomingEmail = (email || '').toLowerCase().trim();
  const isDifferentUser =
    (state.userId && state.userId !== newUserId) ||
    (previousEmail && incomingEmail && previousEmail !== incomingEmail) ||
    (!previousEmail && incomingEmail);

  if (isDifferentUser) {
    state = createFreshState(newUserId);
    plannedRoute.steps = 0;
    plannedRoute.distanceKm = 0;
  } else {
    state.userId = newUserId;
  }

  if (email) state.profile.email = email;
  if (fullName) state.profile.name = fullName;
  if (avatarUrl) state.profile.avatar = avatarUrl;

  saveState(true);
  if (onStateUpdated) onStateUpdated();

  await pullFromCloud(true, onStateUpdated);
  await pullPromoCodesFromCloud();
  await pushToCloud();
}

export async function performFullLogout() {
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

export async function initSupabase(onStateUpdated = null) {
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

      await switchUserContext(
        currentUser.id,
        incomingEmail,
        incomingName,
        incomingAvatar,
        onStateUpdated
      );
    } else {
      if (onStateUpdated) onStateUpdated();
      await pullFromCloud(false, onStateUpdated);
      await pullPromoCodesFromCloud();
    }
  } catch (err) {
    console.warn('Supabase hoiatus:', err);
    setSyncStatus('Salvestatud seadmesse ✓', false);
  }
}
