// Profiili lisad: e-post nime all, "Kustuta konto" ja "Nulli andmed" (kinnitusega).
import { state, supabaseClient } from '../state.js';
import { STORAGE_KEY, DEVICE_UID_KEY } from '../config.js';

function injectCss() {
  if (document.getElementById('gw-acc-css')) return;
  const st = document.createElement('style');
  st.id = 'gw-acc-css';
  st.textContent = [
    '.gw-profile-email { font-size: 0.8rem; color: #cbd5e1; margin: 2px 0 4px; word-break: break-all; }',
    '.gw-danger-link { display: none; width: 100%; background: none; border: 0; padding: 8px; color: #fca5a5; font-weight: 700; font-size: 0.85rem; text-decoration: underline; cursor: pointer; }',
    '.gw-account-block[data-auth="in"] .gw-danger-link { display: block; }',
    '.gw-reset-btn { width: 100%; margin-top: 12px; padding: 13px; border-radius: 14px; border: 1px solid rgba(248, 113, 113, 0.5); background: transparent; color: #fca5a5; font-weight: 800; cursor: pointer; }',
    '.gw-confirm-ov { position: fixed; inset: 0; z-index: 100000; background: rgba(5, 8, 20, 0.8); display: none; align-items: center; justify-content: center; padding: 20px; }',
    '.gw-confirm-ov.open { display: flex; }',
    '.gw-confirm-card { width: 100%; max-width: 380px; background: #12163a; border: 1px solid rgba(248, 113, 113, 0.5); border-radius: 20px; padding: 18px; color: #e2e8f0; }',
    '.gw-confirm-card h3 { margin: 0 0 8px; color: #fff; }',
    '.gw-confirm-card p { margin: 0 0 12px; font-size: 0.9rem; line-height: 1.5; }',
    '.gw-confirm-card input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.4); background: #0b0e24; color: #fff; font-size: 1rem; margin-bottom: 12px; }',
    '.gw-confirm-row { display: flex; gap: 10px; }',
    '.gw-confirm-row button { flex: 1; padding: 13px; border-radius: 12px; border: 0; font-weight: 800; cursor: pointer; }',
    '.gw-confirm-cancel { background: rgba(148, 163, 184, 0.2); color: #e2e8f0; }',
    '.gw-confirm-go { background: #dc2626; color: #fff; }',
    '.gw-confirm-go:disabled { opacity: 0.4; }',
    '.gw-confirm-msg { margin-top: 10px; font-size: 0.85rem; color: #fbbf24; min-height: 1em; }'
  ].join('\n');
  document.head.appendChild(st);
}

function wipeLocal() {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(DEVICE_UID_KEY); } catch (e) { /* ignore */ }
}

function confirmDialog({ title, text, word, goLabel, onGo }) {
  let ov = document.getElementById('gwConfirmOv');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'gwConfirmOv';
  ov.className = 'gw-confirm-ov open';
  ov.innerHTML = '<div class="gw-confirm-card"><h3></h3><p></p>' +
    '<input type="text" autocomplete="off" autocapitalize="characters" placeholder="Kirjuta ' + word + '">' +
    '<div class="gw-confirm-row"><button type="button" class="gw-confirm-cancel">Tühista</button>' +
    '<button type="button" class="gw-confirm-go" disabled></button></div><div class="gw-confirm-msg"></div></div>';
  ov.querySelector('h3').textContent = title;
  ov.querySelector('p').textContent = text;
  const go = ov.querySelector('.gw-confirm-go');
  go.textContent = goLabel;
  const inp = ov.querySelector('input');
  const msg = ov.querySelector('.gw-confirm-msg');
  inp.addEventListener('input', () => { go.disabled = inp.value.trim().toUpperCase() !== word; });
  ov.querySelector('.gw-confirm-cancel').addEventListener('click', () => ov.remove());
  go.addEventListener('click', async () => {
    go.disabled = true;
    msg.textContent = 'Tegutsen…';
    try {
      await onGo();
    } catch (e) {
      msg.textContent = (e && e.message) ? e.message : 'Ei õnnestunud. Proovi uuesti.';
      go.disabled = false;
    }
  });
  document.body.appendChild(ov);
}

async function deleteAccount() {
  if (supabaseClient) {
    const { error } = await supabaseClient.rpc('delete_my_account');
    if (error) throw new Error('Konto kustutamine ei õnnestunud (' + (error.message || 'viga') + '). Kirjuta info.gowalk.app@gmail.com');
    try { await supabaseClient.auth.signOut(); } catch (e) { /* konto on juba kustutatud */ }
  }
  wipeLocal();
  window.location.reload();
}

async function resetData() {
  if (supabaseClient && state.userId) {
    const { error } = await supabaseClient.rpc('reset_my_data');
    if (error) throw new Error('Pilves nullimine ei õnnestunud (' + (error.message || 'viga') + ').');
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  window.location.reload();
}

export function setupAccountExtras() {
  injectCss();
  const account = document.querySelector('.gw-account-block');
  if (!account || account.dataset.extras) return;
  account.dataset.extras = '1';

  // E-post nime alla
  const info = account.querySelector('.profile-info');
  const emailEl = document.createElement('div');
  emailEl.className = 'gw-profile-email';
  if (info) {
    const nameBtn = info.querySelector('.profile-name-btn');
    if (nameBtn) nameBtn.insertAdjacentElement('afterend', emailEl);
    else info.prepend(emailEl);
  }
  const showEmail = () => {
    const t = document.getElementById('googleAuthText');
    const m = t && /\(([^)]+)\)/.exec(t.textContent || '');
    emailEl.textContent = (state.profile && state.profile.email) || (m ? m[1] : '');
    emailEl.style.display = emailEl.textContent ? '' : 'none';
  };
  showEmail();
  const auth = account.querySelector('.drawer-auth-bar');
  if (auth) new MutationObserver(showEmail).observe(auth, { subtree: true, childList: true, characterData: true });

  // Kustuta konto (nähtav ainult sisse logituna)
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'gw-danger-link';
  del.textContent = 'Kustuta konto';
  del.addEventListener('click', () => confirmDialog({
    title: 'Kustuta konto',
    text: 'Konto ja kõik selle andmed (sammud, ajalugu, rajad) kustutatakse lõplikult nii pilvest kui sellest seadmest. Seda ei saa tagasi võtta.',
    word: 'KUSTUTA',
    goLabel: 'Kustuta lõplikult',
    onGo: deleteAccount
  }));
  account.appendChild(del);

  // Nulli andmed ("Rohkem" all)
  const fold = document.querySelector('.gw-more-fold');
  if (fold) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'gw-reset-btn';
    reset.textContent = 'Nulli kõik andmed ja alusta otsast';
    reset.addEventListener('click', () => confirmDialog({
      title: 'Nulli andmed',
      text: 'Kõik sammud ja ajalugu kustutatakse sellest seadmest ja pilvest. Konto jääb alles. Seda ei saa tagasi võtta.',
      word: 'NULLI',
      goLabel: 'Nulli kõik',
      onGo: resetData
    }));
    fold.appendChild(reset);
  }
}
