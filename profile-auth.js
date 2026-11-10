import { state, supabaseClient, saveState, switchUserContext, performFullLogout } from '../state.js';

export function setupProfileAndAuthModals(renderProfileFn, refreshAllUIFn) {
  if (!document.getElementById('gwNameModalOverlay')) {
    const nameOv = document.createElement('div');
    nameOv.id = 'gwNameModalOverlay';
    nameOv.className = 'gw-calc-overlay';
    nameOv.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title"><i data-lucide="user-pen" style="color:#ec4899;"></i> Muuda kasutajanime</span>',
          '<button type="button" class="gw-calc-close" id="gwNameCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div class="gw-calc-field">',
          '<span class="gw-calc-lbl"><span>Sinu kuvatav nimi</span></span>',
          '<input type="text" id="gwProfileNameInput" class="gw-calc-input" placeholder="Nt Karmo" maxlength="32" />',
        '</div>',
        '<button type="button" class="gw-calc-apply" id="gwNameSaveBtn">Salvesta nimi</button>',
      '</div>'
    ].join('');
    document.body.appendChild(nameOv);

    nameOv.addEventListener('click', function (e) {
      if (e.target === nameOv || e.target.closest('#gwNameCloseBtn')) {
        nameOv.classList.remove('open');
        return;
      }
      if (e.target.closest('#gwNameSaveBtn')) {
        const inp = document.getElementById('gwProfileNameInput');
        const newName = (inp ? inp.value : '').trim();
        if (newName.length > 0) {
          state.profile.name = newName;
          saveState();
          renderProfileFn();
        }
        nameOv.classList.remove('open');
      }
    });
  }

  if (!document.getElementById('gwAuthModalOverlay')) {
    const authOv = document.createElement('div');
    authOv.id = 'gwAuthModalOverlay';
    authOv.className = 'gw-calc-overlay';
    authOv.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title" id="gwAuthModalTitle"><i data-lucide="shield-check" style="color:#ec4899;"></i> GoWalk Pilvekonto</span>',
          '<button type="button" class="gw-calc-close" id="gwAuthCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div id="gwAuthLoggedOutPane" style="display:flex;flex-direction:column;gap:12px;">',
          '<p style="font-size:0.78rem;color:#cbd5e1;line-height:1.45;margin:0;">Seo oma sammud ja ajalugu e-posti või Google\'i kontoga, et andmed säiliksid ka telefoni vahetades:</p>',
          '<div class="gw-calc-field">',
            '<span class="gw-calc-lbl"><span>Sinu e-posti aadress</span></span>',
            '<input type="email" id="gwAuthEmailInput" class="gw-calc-input" placeholder="sinu.nimi@gmail.com" />',
          '</div>',
          '<div id="gwAuthFeedback" style="font-size:0.75rem;color:#f472b6;min-height:14px;"></div>',
          '<button type="button" class="gw-calc-apply" id="gwAuthEmailSubmitBtn">Jätka e-posti aadressiga</button>',
          '<button type="button" id="gwAuthGoogleOAuthBtn" style="width:100%;padding:11px;border-radius:999px;background:rgba(18,24,52,0.92);border:1px solid rgba(168,85,247,0.38);color:#e2e8f0;font:700 0.82rem inherit;cursor:pointer;">Ühenda Google\'i kontoga (OAuth)</button>',
        '</div>',
        '<div id="gwAuthLoggedInPane" style="display:none;flex-direction:column;gap:12px;">',
          '<div class="gw-calc-resbox" style="flex-direction:column;align-items:flex-start;gap:4px;">',
            '<span style="font-size:0.72rem;color:#94a3b8;">Sisselogitud konto:</span>',
            '<strong id="gwAuthCurrentEmail" style="font-size:0.95rem;color:#fff;word-break:break-all;"></strong>',
          '</div>',
          '<button type="button" id="gwAuthConfirmLogoutBtn" style="width:100%;padding:12px;border-radius:999px;background:linear-gradient(135deg,#e11d48,#f43f5e);border:none;color:#fff;font:800 0.9rem inherit;cursor:pointer;">Logi kontolt välja</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(authOv);

    authOv.addEventListener('click', async function (e) {
      if (e.target === authOv || e.target.closest('#gwAuthCloseBtn')) {
        authOv.classList.remove('open');
        return;
      }

      if (e.target.closest('#gwAuthEmailSubmitBtn')) {
        const emailInp = document.getElementById('gwAuthEmailInput');
        const fb = document.getElementById('gwAuthFeedback');
        const cleanEmail = (emailInp ? emailInp.value : '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          if (fb) fb.textContent = 'Palun sisesta korrektne e-posti aadress.';
          return;
        }
        if (fb) fb.textContent = 'Ühendan pilvekontoga...';
        await switchUserContext(
          'email_' + cleanEmail,
          cleanEmail,
          state.profile.name !== 'Kõndija Pro' ? state.profile.name : cleanEmail.split('@')[0],
          null,
          refreshAllUIFn
        );
        authOv.classList.remove('open');
        return;
      }

      if (e.target.closest('#gwAuthGoogleOAuthBtn')) {
        const fb = document.getElementById('gwAuthFeedback');
        if (!supabaseClient) {
          if (fb) fb.textContent = 'Pilveühendus laeb, kasuta e-posti välja üleval.';
          return;
        }
        try {
          const res = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname }
          });
          if (res.error) throw res.error;
        } catch (err) {
          if (fb) fb.textContent = 'Google OAuth pole veel aktiveeritud – sisesta ülal oma e-post.';
        }
        return;
      }

      if (e.target.closest('#gwAuthConfirmLogoutBtn')) {
        authOv.classList.remove('open');
        await performFullLogout();
      }
    });
  }
}
