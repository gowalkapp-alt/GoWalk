/* ==========================================================================
   GOWALK PRO — 1. CONFIGURATION, ACCOUNT TIERS & LUCIDE SVG ICONS
   ========================================================================== */

export const SUPABASE_URL = 'https://bktvebmplrabwbgwawao.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4OjglZgVrIPWOAOfkrlcZQ_7uZOPEIO';

export const ADMIN_EMAILS = [
  'info.gowalk.app@gmail.com',
  'karmo.riiel@gmail.com'
];

export const STORAGE_KEY = 'gowalk_pro_permanent_v2';
export const DEVICE_UID_KEY = 'gowalk_pro_device_uid';

// Arhitektuurne valmisolek Standard, Lite ja Pro kontotasemete haldamiseks
export const ACCOUNT_TIERS = {
  STANDARD: {
    id: 'standard',
    headerTag: 'STD',
    planLabel: 'Standard konto',
    features: {
      smartRouteGenerator: true,
      safeLitStreets: false,
      unlimitedHistory: false,
      cloudBackup: true
    }
  },
  LITE: {
    id: 'lite',
    headerTag: 'LITE',
    planLabel: 'GoWalk Lite pakett',
    features: {
      smartRouteGenerator: true,
      safeLitStreets: true,
      unlimitedHistory: false,
      cloudBackup: true
    }
  },
  PRO: {
    id: 'pro',
    headerTag: 'PRO',
    planLabel: 'PRO Täisversioon',
    features: {
      smartRouteGenerator: true,
      safeLitStreets: true,
      unlimitedHistory: true,
      cloudBackup: true
    }
  }
};

export const DEFAULT_PROMO_CODES = [
  { code: 'GOWALK30', discount: 30, tier: 'pro', label: '-30% PRO Soodustus' },
  { code: 'GOWALK50', discount: 50, tier: 'pro', label: '-50% PRO Soodustus' },
  { code: 'GOWALK70', discount: 70, tier: 'pro', label: '-70% PRO Soodustus' },
  { code: 'GOWALKLITE', discount: 50, tier: 'lite', label: 'GoWalk Lite (-50%)' },
  { code: 'VIPFREE', discount: 100, tier: 'pro', label: 'TASUTA (100% PRO)' }
];

// Puhtad Lucide'i SVG jooneikoonid
export const LUCIDE_SVGS = {
  sparkles: `<svg class="gw-inline-icon" viewBox="0 0 24 24"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`,
  flashlight: `<svg class="gw-inline-icon" viewBox="0 0 24 24"><path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" x2="18" y1="6" y2="6"/><line x1="12" x2="12" y1="12" y2="12.01"/></svg>`,
  trees: `<svg class="gw-inline-icon" viewBox="0 0 24 24"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>`,
  refreshCw: `<svg class="gw-inline-icon sm" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  loader: `<svg class="gw-inline-icon sm gw-spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  close: `<svg class="gw-inline-icon" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
};
