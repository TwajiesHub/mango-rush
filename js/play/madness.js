// Mango Rush — the Mango Madness storm table (pure: no three.js, no DOM).   OWNER: Claude Code  ·  STATUS: step 9
//
// CONTRACT:
//   buildMadnessTable(rng, spots, seconds) -> [{ at, a, r }]   drawn ONCE at reset from the Madness rng (seed ^ CONFIG.adrenaline.madness.tableSeed),
//                      NOT the drops rng and NOT the happenings rng. EXACTLY 3 draws per spot, whatever happens: the player cannot change a draw.
//                      at = seconds after the Madness starts (sorted, about seconds / spots apart), a, r = 0..1 (the place on the deck).
//   resolveMadnessSpots(table, halfWidth, halfDepth, minSeparation, window = 3) -> [{ x, z }]   the table on a deck of this size. A spot that
//                      lands within minSeparation of an earlier one that is still around (it was launched less than `window` seconds before)
//                      is nudged away by a deterministic step (no rng), like the shower spots.
//
// The storm itself (play/happenings.js) walks this table from the moment Madness starts and stops the moment it ends: a Madness stretched by
// catches (+0.3 s each) just uses more of the table. Everyone who starts Madness at the same run time gets the same storm.

export function buildMadnessTable(rng, spots, seconds) {
  const out = [];
  const gap = seconds / spots;
  for (let i = 0; i < spots; i++) {
    const jitter = rng.next();
    const a = rng.next();
    const r = rng.next();
    out.push({ at: (i + 0.15 + jitter * 0.7) * gap, a, r });
  }
  return out;
}

export function resolveMadnessSpots(table, halfWidth, halfDepth, minSeparation, window = 3) {
  const out = [];
  for (let i = 0; i < table.length; i++) {
    const ang = table[i].a * Math.PI * 2;
    const rad = Math.sqrt(table[i].r);
    const p = { x: Math.cos(ang) * rad * (halfWidth - 0.4), z: Math.sin(ang) * rad * (halfDepth - 0.4) };
    const clashes = (x, z) => {
      for (let j = i - 1; j >= 0 && table[i].at - table[j].at < window; j--) if (Math.hypot(out[j].x - x, out[j].z - z) < minSeparation) return true;
      return false;
    };
    if (clashes(p.x, p.z)) {            // a deterministic search outwards in rings (no rng): the first free place on the walkable deck
      const ox = p.x;
      const oz = p.z;
      for (let k = 0; k < 96; k++) {
        const na = k * 1.0472 + 0.5;
        const step = minSeparation + 0.1 + 0.25 * Math.floor(k / 6);
        const nx = ox + Math.cos(na) * step;
        const nz = oz + Math.sin(na) * step;
        if (Math.hypot(nx / (halfWidth - 0.4), nz / (halfDepth - 0.4)) <= 1 && !clashes(nx, nz)) { p.x = nx; p.z = nz; break; }
      }
    }
    out.push(p);
  }
  return out;
}
