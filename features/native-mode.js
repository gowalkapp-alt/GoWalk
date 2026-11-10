/* ==========================================================================
   GOWALK — NATIIVNE ÄPI REŽIIM
   Kui rakendus töötab Androidi/iOS äpina (Capacitor), saab body klassi
   "is-native", mille abil peidame veebi-spetsiifilised asjad (nt "Paigalda äpp").
   ========================================================================== */

export function isNativeApp() {
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export function setupNativeMode() {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('is-native');
  if (document.getElementById('gw-native-style')) return;
  const style = document.createElement('style');
  style.id = 'gw-native-style';
  style.textContent = [
    '/* PWA paigaldus ei ole natiivses äpis mõttekas */',
    '.is-native .nav-item[data-target="installModal"] { display: none !important; }'
  ].join('\n');
  document.head.appendChild(style);
}
