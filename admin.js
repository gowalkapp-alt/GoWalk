/* ==========================================================================
   GOWALK PRO — 5. ADMIN PANEL, PROMO CODES & GLOBAL COUNTRY STATS
   ========================================================================== */

import { ADMIN_EMAILS } from './config.js';
import {
  state,
  supabaseClient,
  saveState,
  detectCountryName,
  setAccountTier
} from './state.js';

export function checkAdminAccess() {
  const adminNavBtn = document.getElementById('adminNavBtn');
  const adminActiveEmailText = document.getElementById('adminActiveEmailText');
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

export function renderAdminPromoCodes() {
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

export async function loadAdminDashboard() {
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

  const usersEl = document.getElementById('adminTotalUsers');
  const countriesEl = document.getElementById('adminTotalCountries');
  const stepsEl = document.getElementById('adminGlobalSteps');

  if (usersEl) usersEl.textContent = totalUsers.toLocaleString('et-EE');
  if (countriesEl) countriesEl.textContent = sortedCountries.length;
  if (stepsEl) stepsEl.textContent = globalSteps.toLocaleString('et-EE');

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

export function initAdminAndPromos(onProfileUpdated) {
  let secretTapCount = 0;
  let secretTapTimer = null;
  const versionTrigger =
    document.getElementById('versionSecretTrigger') || document.querySelector('.version-tag');

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
            ? 'Admin Paneel on nüüd menüüs avatud!'
            : 'Admin Paneel peidetud.'
        );
      }
    });
  }

  const createPromoBtn = document.getElementById('createPromoBtn');
  if (createPromoBtn) {
    createPromoBtn.addEventListener('click', async () => {
      const codeInput = document.getElementById('newPromoCodeInput');
      const discountSelect = document.getElementById('newPromoDiscountSelect');
      const cleanCode = (codeInput?.value || '').trim().toUpperCase();
      const discount = parseInt(discountSelect?.value || '30', 10);

      if (!cleanCode) {
        alert('Palun sisesta sooduskoodi nimi (nt SUVI50 või VIPTASUTA).');
        return;
      }

      const label = discount === 100 ? 'TASUTA (100% PRO)' : `-${discount}% Soodustus`;
      const newEntry = { code: cleanCode, discount, tier: 'pro', label };

      state.promoCodes = state.promoCodes.filter(c => c.code !== cleanCode);
      state.promoCodes.unshift(newEntry);
      if (codeInput) codeInput.value = '';
      saveState();
      renderAdminPromoCodes();

      if (supabaseClient) {
        try {
          await supabaseClient
            .from('promo_codes')
            .upsert({ code: cleanCode, discount, label }, { onConflict: 'code' });
        } catch (e) {}
      }
    });
  }

  const redeemPromoBtn = document.getElementById('redeemPromoBtn');
  if (redeemPromoBtn) {
    redeemPromoBtn.addEventListener('click', () => {
      const input = document.getElementById('userPromoInput');
      const feedback = document.getElementById('promoFeedbackMsg');
      const entered = (input?.value || '').trim().toUpperCase();

      if (!entered || !feedback) return;

      const match = state.promoCodes.find(p => p.code.toUpperCase() === entered);
      if (match) {
        state.profile.activePromo = match.code;
        const targetTier = match.tier || 'pro';
        const customPlan =
          match.discount === 100
            ? 'PRO Täisversioon (TASUTA)'
            : `${targetTier.toUpperCase()} (-${match.discount}% Soodustus)`;

        setAccountTier(targetTier, customPlan);
        feedback.style.color = '#c084fc';
        feedback.textContent = `✓ Kood "${match.code}" aktiveeritud: ${state.profile.plan}!`;
        if (input) input.value = '';
        if (onProfileUpdated) onProfileUpdated();
      } else {
        feedback.style.color = '#ef4444';
        feedback.textContent = '✕ Sellist sooduskoodi ei leitud või see on aegunud.';
      }
    });
  }

  const refreshAdminBtn = document.getElementById('refreshAdminStatsBtn');
  if (refreshAdminBtn) {
    refreshAdminBtn.addEventListener('click', loadAdminDashboard);
  }
}
