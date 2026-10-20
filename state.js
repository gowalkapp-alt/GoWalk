import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const STORAGE_KEY = 'gowalk_pro_permanent_v2';
const DEVICE_UID_KEY = 'gowalk_pro_device_uid';

function getOrCreateDeviceUid() {
  let uid = localStorage.getItem(DEVICE_UID_KEY);
  if (!uid) {
    uid = crypto.randomUUID ? crypto.randomUUID() : 'gw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_UID_KEY, uid);
  }
  return uid;
}

function detectCountryName() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (tz.includes('Tallinn')) return '🇪🇪 Eesti';
  if (tz.includes('Helsinki')) return '🇫🇮 Soome';
  return tz || '🌍 Rahvusvaheline';
}

const defaultPromoCodes = [
  { code: 'GOWALK30', discount: 30, label: '-30% Soodustus' },
  { code: 'VIPFREE', discount: 100, label: 'TASUTA (100% PRO)' }
];

export function createFreshState(customUserId = null) {
  return {
    userId: customUserId || getOrCreateDeviceUid(),
    isAdminUnlocked: false,
    profile: {
      name: 'Kõndija Pro',
      email: null,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoWalkPro',
      country: detectCountryName(),
      tier: 'Pro', // 'Standard' | 'Lite' | 'Pro' valmisolek
      plan: 'Pro tase',
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
      parsed.today = { date: currentDay, steps: 0, distanceKm: 0, calories: 0, durationSec: 0 };
    }
    return { ...base, ...parsed, profile: { ...base.profile, ...(parsed.profile || {}) }, settings: { ...base.settings, ...(parsed.settings || {}) } };
  } catch (e) {
    return createFreshState();
  }
}

export function saveStateToStorage(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
