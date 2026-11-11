/* ==========================================================================
   GOWALK — KASUTAJA PEATUSED (pood jms)
   Puhas arvutusloogika, ei vaja kaarti ega võrku. Punktid on kujul {lat, lng}.

   Rada: algus -> "kohe" peatused -> täitepunktid (ring) -> "tagasiteel" peatused -> algus.
   Täitepunktid lisavad pikkust, et kogu rada oleks soovitud sammude pikkune.
   ========================================================================== */

import { distanceM } from './route-quality.js';

const TORTUOSITY = 1.25; // tänavavõrk on tavaliselt ~25% pikem kui sirgjoon
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

export function destination(p, distM, bearingRad) {
  const R = 6371000;
  const d = distM / R;
  const lat1 = toRad(p.lat);
  const lng1 = toRad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

export function bearingBetween(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.atan2(y, x);
}

/** Jagab peatused: "kohe" (lähimad esimesena) ja "tagasiteel" (kaugeim esimesena, viimane on koduga kõige lähemal). */
export function orderStops(start, stops) {
  const firsts = stops
    .filter(s => s.when !== 'last')
    .sort((a, b) => distanceM(start, a.latlng) - distanceM(start, b.latlng));
  const lasts = stops
    .filter(s => s.when === 'last')
    .sort((a, b) => distanceM(start, b.latlng) - distanceM(start, a.latlng));
  return { firsts: firsts.map(s => s.latlng), lasts: lasts.map(s => s.latlng) };
}

/** Vaba lõik, kuhu ring lisatakse: viimasest "kohe" peatusest esimese "tagasiteel" peatuseni. */
export function legAnchors(start, stops) {
  const { firsts, lasts } = orderStops(start, stops);
  const from = firsts.length ? firsts[firsts.length - 1] : start;
  const to = lasts.length ? lasts[0] : start;
  return { firsts, lasts, from, to };
}

/** Sirgjooneline kettapikkus alguse -> kohe -> tagasiteel -> algus. */
export function chainLengthM(start, firsts, lasts) {
  const seq = [start, ...firsts, ...lasts, start];
  let total = 0;
  for (let i = 1; i < seq.length; i++) total += distanceM(seq[i - 1], seq[i]);
  return total;
}

/** Kui palju teepikkust on vaja juurde (hinnang), et jõuda soovitud pikkuseni. */
export function extraRoadMeters(start, firsts, lasts, targetMeters) {
  return targetMeters - chainLengthM(start, firsts, lasts) * TORTUOSITY;
}

function solveOffset(viaFn, targetVia) {
  let lo = 0;
  let hi = 20000;
  if (viaFn(0) >= targetVia) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (viaFn(mid) < targetVia) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Kandidaatide kirjeldused (eri küljed/asukohad). Tühi extra => ringi pole vaja.
 */
export function detourOptions(from, to, extraRoadM, bearingHint = 0, rand = Math.random) {
  if (extraRoadM <= 80) return [{ none: true }];
  const c = distanceM(from, to);
  if (c < 200) {
    const b = bearingHint;
    const steps = [0, 1, 2, 3, 4, 5];
    return steps.map(i => ({ mode: 'loop', bearing: b + (i * Math.PI) / 3, side: i % 2 === 0 ? 1 : -1 }));
  }
  const k = extraRoadM > 2500 ? 2 : 1;
  // Väike juhuslik nihe, et "Teine suund" annaks iga kord erineva ringi
  const jitter = (rand() - 0.5) * 0.16;
  const ts = (k === 1 ? [0.5, 0.5, 0.35, 0.65, 0.25, 0.75] : [0.25, 0.25, 0.33, 0.33, 0.2, 0.2]).map(t =>
    Math.min(0.78, Math.max(0.2, t + jitter))
  );
  const sides = [1, -1, 1, -1, 1, -1];
  return ts.map((t, i) => ({ mode: 'chord', k, t, side: sides[i] }));
}

/** Täitepunktid ühe kirjelduse ja vajaliku lisapikkuse jaoks. */
export function fillersFor(desc, from, to, extraRoadM) {
  if (!desc || desc.none || extraRoadM <= 0) return [];
  const c = distanceM(from, to);
  const targetVia = c + extraRoadM / TORTUOSITY;

  if (desc.mode === 'loop') {
    const h = Math.max(60, (targetVia - c) / 3 + 0); // võrdkülgne kolmnurk: tee ≈ 3h
    const p1 = destination(from, h, desc.bearing);
    const p2 = destination(from, h, desc.bearing + desc.side * (Math.PI / 3));
    return [p1, p2];
  }

  const base = bearingBetween(from, to);
  const perp = base + desc.side * (Math.PI / 2);
  if (desc.k === 2) {
    const t0 = desc.t;
    const via = h => 2 * Math.sqrt((t0 * c) ** 2 + h ** 2) + (1 - 2 * t0) * c;
    const h = solveOffset(via, targetVia);
    const a = destination(destination(from, t0 * c, base), h, perp);
    const b = destination(destination(from, (1 - t0) * c, base), h, perp);
    return [a, b];
  }
  const t = desc.t;
  const via = h => Math.sqrt((t * c) ** 2 + h ** 2) + Math.sqrt(((1 - t) * c) ** 2 + h ** 2);
  const h = solveOffset(via, targetVia);
  return [destination(destination(from, t * c, base), h, perp)];
}

/** Ruuterile antav punktide jada (algus lisatakse ruuteris lõppu automaatselt). */
export function buildStopWaypoints(start, firsts, fillers, lasts) {
  return [start, ...firsts, ...fillers, ...lasts];
}
