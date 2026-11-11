// Google-sisselogimine Androidi äpis: avab süsteemibrauseri ja tuleb deep-linkiga tagasi.
// (WebView'is Google OAuth ei tööta ja Supabase saadaks muidu Verceli lehele.)
import { supabaseClient } from '../state.js';

export const NATIVE_REDIRECT = 'com.gowalkapp.gowalk://auth';

export function isNativeAuthPlatform() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export async function startNativeGoogleLogin(client) {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true }
  });
  if (error) throw error;
  if (!data || !data.url) throw new Error('Sisselogimise linki ei tulnud');
  const mod = await import('@capacitor/browser'); // ära tagasta pluginat lubadusest
  await mod.Browser.open({ url: data.url });
}

async function handleUrl(url) {
  if (!url || !url.startsWith(NATIVE_REDIRECT)) return;
  try {
    const mod = await import('@capacitor/browser');
    await mod.Browser.close().catch(() => {});
  } catch (e) { /* ignore */ }
  const client = supabaseClient;
  if (!client) return;
  try {
    const u = new URL(url.replace('#', url.includes('?') ? '&' : '?'));
    const code = u.searchParams.get('code');
    const at = u.searchParams.get('access_token');
    const rt = u.searchParams.get('refresh_token');
    let res;
    if (code) res = await client.auth.exchangeCodeForSession(code);
    else if (at && rt) res = await client.auth.setSession({ access_token: at, refresh_token: rt });
    else return;
    if (res && res.error) throw res.error;
    window.location.reload(); // initSupabase võtab uue sessiooni üles
  } catch (e) {
    const fb = document.getElementById('gwAuthFeedback');
    if (fb) fb.textContent = 'Sisselogimine ebaõnnestus. Proovi uuesti.';
  }
}

export async function setupNativeAuthReturn() {
  if (!isNativeAuthPlatform()) return;
  try {
    const mod = await import('@capacitor/app');
    mod.App.addListener('appUrlOpen', ev => handleUrl(ev && ev.url));
  } catch (e) { /* plugin puudub */ }
}
