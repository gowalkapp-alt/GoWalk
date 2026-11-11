// Alamlehtedel (Seadistus, Sammud ja import, Abi, Admin, Paigalda) tagasinool:
// tagasi Seadetesse, kui sinna Seadetest tuldi. X viib endiselt avalehele.
const TARGETS = ['syncModal', 'helpModal', 'adminModal', 'installModal', 'gwSetupModal'];
let fromSettings = false;

function backToSettings(modal) {
  modal.classList.remove('open');
  const settings = document.getElementById('settingsModal');
  if (fromSettings && settings) {
    settings.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  }
  fromSettings = false;
}

export function setupSubpageBack() {
  if (document.body.dataset.subpageBack) return;
  document.body.dataset.subpageBack = '1';

  const st = document.createElement('style');
  st.textContent = '.gw-back-btn { width: 40px; height: 40px; margin-right: 6px; border-radius: 12px; border: 0; background: transparent; color: #e9d5ff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }';
  document.head.appendChild(st);

  // Mäleta, kas alamleht avati Seadetest (püütakse enne teisi klikikäsitlejaid)
  document.addEventListener('click', e => {
    const settings = document.getElementById('settingsModal');
    if (settings && settings.classList.contains('open') && e.target.closest('.nav-item')) fromSettings = true;
    else if (e.target.closest('.nav-item, .gw-health-link, .gw-faq-setup')) fromSettings = false;
  }, true);

  TARGETS.forEach(id => {
    const modal = document.getElementById(id);
    const group = modal && modal.querySelector('.subview-title-group');
    if (!group || group.querySelector('.gw-back-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gw-back-btn';
    btn.setAttribute('aria-label', 'Tagasi');
    btn.innerHTML = '<i data-lucide="arrow-left"></i>';
    btn.addEventListener('click', e => { e.stopPropagation(); backToSettings(modal); });
    group.insertBefore(btn, group.firstChild);
  });
  if (window.lucide) window.lucide.createIcons();
}
