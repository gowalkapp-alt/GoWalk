/* ==========================================================================
   GOWALK — RAJA KVALITEEDI HINDAMINE
   Puhtad funktsioonid (ei vaja kaarti ega võrku). Punktid on kujul {lat, lng}.
   Mida madalam hinne, seda parem rada.
   ========================================================================== */

const EARTH_R = 6371000;
const toRad = d => (d * Math.PI) / 180;

export function distanceM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLengthM(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceM(pts[i - 1], pts[i]);
  return total;
}

// Jaotab raja ühtlase vahega punktideks (vaikimisi iga 20 m)
export function resample(pts, stepM = 20) {
  if (!pts || pts.length < 2) return pts ? pts.slice() : [];
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = distanceM(a, b);
    if (seg === 0) continue;
    let pos = stepM - carry;
    while (pos <= seg) {
      const f = pos / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      pos += stepM;
    }
    carry = seg - (pos - stepM);
  }
  return out;
}

function bearingDeg(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiffDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Kui suur osa rajast käib üle koha, kus juba käidud (tupikud, edasi-tagasi).
 * Tulemus 0..1.
 */
export function backtrackRatio(pts) {
  const p = resample(pts, 20);
  const n = p.length;
  if (n < 8) return 0;
  const cellLat = 14 / 111320;
  const cellLng = 14 / (111320 * Math.cos(toRad(p[0].lat)) || 1);
  const grid = new Map();
  const key = (la, ln) => Math.round(la / cellLat) + ':' + Math.round(ln / cellLng);
  let repeated = 0;

  for (let i = 0; i < n; i++) {
    const cy = Math.round(p[i].lat / cellLat);
    const cx = Math.round(p[i].lng / cellLng);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) {
      for (let dx = -1; dx <= 1 && !hit; dx++) {
        const list = grid.get(cy + dy + ':' + (cx + dx));
        if (!list) continue;
        for (const j of list) {
          if (j > i - 3) continue;
          // algus ja lõpp kattuvad ringi sulgemisel loomulikult
          if (j < 3 && i > n - 4) continue;
          if (distanceM(p[i], p[j]) <= 12) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) repeated++;
    const k = key(p[i].lat, p[i].lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return repeated / n;
}

/**
 * Pöörete statistika 40 m akendes:
 *  sharpPerKm — järsud tagasipöörded (>110°) kilomeetri kohta
 *  turnPerKm  — kogu pöördenurk kraadides kilomeetri kohta (ring ≈ 90°/km 4 km rajal)
 */
export function turnStats(pts) {
  const p = resample(pts, 20);
  const km = Math.max(0.05, pathLengthM(p) / 1000);
  if (p.length < 6) return { sharpPerKm: 0, turnPerKm: 0 };
  let total = 0;
  let sharp = 0;
  for (let i = 2; i + 2 < p.length; i += 2) {
    const before = bearingDeg(p[i - 2], p[i]);
    const after = bearingDeg(p[i], p[i + 2]);
    const d = angleDiffDeg(before, after);
    total += d;
    if (d > 110) sharp++;
  }
  return { sharpPerKm: sharp / km, turnPerKm: total / km };
}

/**
 * Hinne ühele kandidaatrajale. Madalam = parem.
 * @param {{lat:number,lng:number}[]} pts
 * @param {number} targetMeters soovitud pikkus
 */
export function scoreRoute(pts, targetMeters) {
  const lengthM = pathLengthM(pts);
  const errFrac = targetMeters > 0 ? Math.abs(lengthM - targetMeters) / targetMeters : 0;
  const backtrack = backtrackRatio(pts);
  const { sharpPerKm, turnPerKm } = turnStats(pts);
  const score =
    errFrac * 4 +
    backtrack * 5 +
    sharpPerKm * 0.6 +
    Math.max(0, turnPerKm - 200) / 400;
  return { score, lengthM, errFrac, backtrack, sharpPerKm, turnPerKm };
}

/** Valib parima kandidaadi: [{pts, ...}] -> sama objekt lisatud väljaga `quality`. */
export function pickBestRoute(candidates, targetMeters) {
  let best = null;
  for (const c of candidates) {
    if (!c || !c.pts || c.pts.length < 4) continue;
    const quality = scoreRoute(c.pts, targetMeters);
    if (!best || quality.score < best.quality.score) best = { ...c, quality };
  }
  return best;
}
