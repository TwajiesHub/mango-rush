// Builds the player's three.js character from their start.ng style, and animates it (step 3: a living body).
//   buildCharacter(style, name) -> Group      thigh + shin with a knee, upper arm + forearm with an elbow; hair locks, ponytail, scarf tail
//                                              and backpack hang from pivots so they can lag; afro and bun can jiggle
//   updateCharacterMotion(ch, dt, { vx, vz, ax, az, dashing, skidding }) -> 0|1
//        stride by DISTANCE (TUNE.stride per step, so feet do not skate), knees and elbows bend, lean toward the acceleration,
//        trailing parts on springs; returns 1 on the frame a foot plants (player.js turns that into EVENTS.FOOTSTEP)
//   animateCharacter(ch, dt, speed, time)    the menu and game-over poses (the same animation at a share of top speed)
//   disposeCharacter(ch)
// Numbers come from TUNE (core/config.js). No allocation per frame.
//
// STEP 4 (the look): every part is a TOON material in the player's exact start.ng colours (top = primaryColor, bottoms = secondaryColor,
// plus skin and hair). Each rigid segment (head with hat and hair cap, torso, thigh, shin with foot, upper arm, forearm with hand) is BAKED
// into ONE toon mesh with ONE merged umber outline, on the same pivots as before. A shared NEUTRAL print texture (stripes + a row of dots,
// 30% darker) multiplies the vertex colours on the torso, sleeves, thighs, shins and skirt, so the print is exactly 30% darker than the
// player's own top and bottoms colours. Dread / braid locks are baked into 4 swinging clusters with darker tips (no outlines: they swing
// apart; the hair cap carries the outline); ponytail, scarf tail, backpack, afro and bun keep their own outline.
//   triggerReaction(ch, 'catch' | 'hit' | 'cheer' | 'wave') -> void   short layered reactions (never block movement; additive visuals)
//   setCharacterPose(ch, null | 'slump' | 'cheer') -> void             a held pose (the game-over screen)
//   updateCharacterMotion(...) returns 1 on a foot plant, as before.
// Every option from the start.ng character creator changes the model:
// body, skin, hair, hair colour, top (primaryColor), bottoms (secondaryColor), hat, extra (accessory).
import * as THREE from 'three';
import { springStep } from '../core/motion.js';
import { TUNE } from '../core/config.js';
import { toon, bakeToon } from './materials.js';

// every part is a cached TOON material in its exact colour; the old PBR options (roughness, metalness) do not apply to cel shading
function mat(color, opts = {}) {
  return toon(color, { flatShading: !!opts.flatShading });
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Shift a colour's hue, so extras (scarf, backpack) are derived from the player's own palette.
function shifted(hex, dh, ds = 0, dl = 0) {
  return '#' + new THREE.Color(hex).offsetHSL(dh, ds, dl).getHexString();
}
function darker(hex, amount = 0.12) {
  return shifted(hex, 0, 0, -amount);
}

const HEAD_Y = 1.82;
const HEAD_R = 0.32;

export function buildCharacter(style, name) {
  const s = style;
  const female = s.body === 'female';
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything that bobs while running
  root.add(body);

  const skin = mat(s.skinColor);
  const top = mat(s.primaryColor);
  const bottoms = mat(s.secondaryColor);
  const hair = mat(s.hairColor, { roughness: 0.95 });
  const shoe = mat('#26211d');
  const dark = mat('#14110f', { roughness: 0.4 });

  // ---- legs: a thigh that swings at the hip and a shin that bends at the knee
  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.72, 0);
    const thigh = mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.31, 12), bottoms, 0, -0.155, 0);
    thigh.userData.print = true;
    const knee = new THREE.Group();
    knee.position.y = -0.31;
    const shin = mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.31, 12), bottoms, 0, -0.155, 0);
    shin.userData.print = true;
    const kneeCap = mesh(new THREE.SphereGeometry(0.1, 10, 8), bottoms, 0, 0, 0);
    kneeCap.userData.print = true;
    const foot = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoe, 0, -0.31, 0.05);
    knee.add(shin, kneeCap, foot);
    pivot.add(thigh, knee);
    body.add(pivot);
    legs.push(pivot);
    knees.push(knee);
  }

  // ---- torso
  const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.42, 6, 16);
  const torso = mesh(torsoGeo, top, 0, 1.17, 0);
  torso.scale.set(female ? 0.96 : 1.12, 1, 0.72);
  torso.userData.print = true;
  torso.userData.printScale = [2, 1.05];
  body.add(torso);

  // hips / waistband in bottoms colour
  const hips = mesh(new THREE.CylinderGeometry(female ? 0.31 : 0.3, 0.3, 0.16, 16), bottoms, 0, 0.78, 0);
  hips.scale.z = 0.75;
  hips.userData.print = true;
  hips.userData.printScale = [2, 1];
  body.add(hips);

  if (female) {
    const skirt = mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.36, 20, 1, true), bottoms, 0, 0.62, 0);
    skirt.scale.z = 0.82;
    skirt.userData.print = true;
    skirt.userData.printScale = [2, 1];
    body.add(skirt);
  }

  // neck
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 12), skin, 0, 1.55, 0));

  // ---- arms: an upper arm that swings at the shoulder and a forearm that bends at the elbow
  const arms = [];
  const elbows = [];
  const shoulderX = female ? 0.36 : 0.42;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * shoulderX, 1.45, 0);
    pivot.rotation.z = side * 0.08;
    const sleeve = mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.28, 12), top, 0, -0.13, 0);
    sleeve.userData.print = true;
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    const forearm = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 12), skin, 0, -0.14, 0);
    const hand = mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.32, 0);
    elbow.add(forearm, hand);
    pivot.add(sleeve, elbow);
    body.add(pivot);
    arms.push(pivot);
    elbows.push(elbow);
  }

  // ---- head
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(HEAD_R, 24, 18), skin));
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.038, 10, 8), dark, side * 0.11, 0.04, HEAD_R - 0.03));
    head.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), skin, side * HEAD_R, 0, 0)); // ears
  }
  const mouth = mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), mat('#7a2e2e'), 0, -0.09, HEAD_R - 0.025);
  mouth.rotation.z = Math.PI;
  head.add(mouth);

  // ---- hair
  // 'trail' holds the parts that lag behind the body on springs: { obj, set, gain, baseX, baseZ } (swing about a pivot at
  // the top of the part) or { obj, set, gain, jiggle: true, x0, y0, z0 } (a small offset). set 0 = hair and scarf, set 1 = backpack.
  const trail = [];
  let hatBase = HEAD_R - 0.02;
  const hairKind = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'].includes(s.hair) ? s.hair : 'short';
  const hairCap = (span) => {
    const cap = mesh(new THREE.SphereGeometry(HEAD_R + 0.025, 24, 12, 0, Math.PI * 2, 0, Math.PI * span), hair);
    cap.rotation.x = -0.32;
    head.add(cap);
  };
  if (hairKind === 'short') {
    hairCap(female ? 0.55 : 0.42);
  } else if (hairKind === 'bun') {
    hairCap(0.5);
    const bun = mesh(new THREE.SphereGeometry(0.15, 16, 12), hair, 0, 0.24, -0.24);
    bun.userData.keep = true;   // baked on its own below: it jiggles
    head.add(bun);
    trail.push({ obj: bun, set: 0, gain: 0.16, jiggle: true, x0: 0, y0: 0.24, z0: -0.24 });
  } else if (hairKind === 'ponytail') {
    hairCap(0.5);
    head.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), hair, 0, 0.1, -0.32));
    // the tail hangs from a pivot at its top, so it swings from the head
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.12, -0.38);
    tailPivot.rotation.x = 0.35;
    const tail = mesh(new THREE.CylinderGeometry(0.075, 0.035, 0.46, 10), hair, 0, -0.23, 0);
    tail.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), hair, 0, -0.23, 0));
    tailPivot.add(tail);
    head.add(tailPivot);
    trail.push({ obj: tailPivot, set: 0, gain: 1.1, baseX: 0.35, baseZ: 0 });
  } else if (hairKind === 'afro') {
    const afro = mesh(new THREE.IcosahedronGeometry(0.43, 2), hair, 0, 0.2, -0.12);
    afro.material = mat(s.hairColor, { flatShading: true });
    afro.userData.keep = true;   // baked on its own below: it jiggles
    head.add(afro);
    trail.push({ obj: afro, set: 0, gain: 0.12, jiggle: true, x0: 0, y0: 0.2, z0: -0.12 });
    hatBase = 0.56;
  } else if (hairKind === 'dreads' || hairKind === 'braids') {
    const braids = hairKind === 'braids';
    const cap = mesh(new THREE.SphereGeometry(HEAD_R + 0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
    cap.rotation.x = -0.35;
    head.add(cap);
    const count = braids ? 17 : 13;
    const bead = mat('#f5c518');
    // locks swing from the scalp. They are baked into 4 clusters (left, back-left, back-right, right): each cluster is ONE mesh on ONE
    // pivot, so 13-17 locks cost 4 draw calls. Darker tips and every other lock a shade darker give the edge tone (vertex colours).
    const nClusters = 4;
    const infos = [];
    for (let i = 0; i < count; i++) {
      // angle measured from the face (+z): covers both sides and the back, never the face
      const ang = Math.PI * 0.42 + (i / (count - 1)) * Math.PI * 1.16;
      infos.push({
        i, a: ang, len: (braids ? 0.5 : 0.42) + ((i * 7) % 5) * 0.045, w: braids ? 0.028 : 0.042,
        x: Math.sin(ang) * (HEAD_R + 0.02), z: Math.cos(ang) * (HEAD_R + 0.02), c: Math.min(nClusters - 1, Math.floor((i * nClusters) / count)),
      });
    }
    for (let c = 0; c < nClusters; c++) {
      const mine = infos.filter((q) => q.c === c);
      if (!mine.length) continue;
      const cx = mine.reduce((t, q) => t + q.x, 0) / mine.length;
      const cz = mine.reduce((t, q) => t + q.z, 0) / mine.length;
      const cluster = new THREE.Group();
      cluster.position.set(cx, 0.1, cz);
      cluster.userData.clustered = true;
      head.add(cluster);
      const parts = [];
      const holders = [];
      let gainSum = 0;
      for (const q of mine) {
        const holder = new THREE.Group();
        holder.position.set(q.x - cx, 0, q.z - cz);
        holder.rotation.z = Math.sin(q.a) * 0.25;
        holder.rotation.x = -Math.cos(q.a) * 0.25;
        const lock = mesh(new THREE.CylinderGeometry(q.w, q.w * 0.8, q.len, 8), hair, 0, -q.len / 2, 0);
        const shade = q.i % 2 ? 0.9 : 1;
        lock.userData.colorFn = (lx, ly, lz, col) => col.multiplyScalar(shade * (0.6 + 0.4 * Math.min(1, ((ly + q.len / 2) / q.len) * 1.7)));
        const tip = mesh(new THREE.SphereGeometry(braids ? 0.035 : 0.042, 8, 6), braids ? bead : hair, 0, -q.len, 0);
        if (!braids) tip.userData.colorFn = (lx, ly, lz, col) => col.multiplyScalar(0.6);
        holder.add(lock, tip);
        cluster.add(holder);
        holders.push(holder);
        parts.push(lock, tip);
        gainSum += 0.6 + q.len * 0.9;
      }
      cluster.updateMatrixWorld(true);
      const baked = bakeToon(cluster, parts, { outline: 0 });
      cluster.add(baked);
      for (const h of holders) cluster.remove(h);
      trail.push({ obj: cluster, set: 0, gain: gainSum / mine.length, baseX: 0, baseZ: 0 });
    }
    hatBase = HEAD_R + 0.0;
  }
  // bald: nothing

  // ---- hat
  if (s.hat === 'cap') {
    const capMat = mat(s.primaryColor);
    const dome = mesh(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat, 0, hatBase - 0.16, 0);
    const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20, 1, false, -Math.PI / 2, Math.PI), mat(s.secondaryColor), 0, hatBase - 0.15, 0.2);
    brim.scale.set(1.1, 1, 1.3);
    const button = mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(s.secondaryColor), 0, hatBase + 0.18, 0);
    head.add(dome, brim, button);
  } else if (s.hat === 'beanie') {
    const knit = mat(shifted(s.secondaryColor, 0.02, 0, 0.08), { roughness: 1 });
    const dome = mesh(new THREE.SphereGeometry(0.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, hatBase - 0.14, 0);
    dome.scale.y = 1.15;
    const cuff = mesh(new THREE.TorusGeometry(0.33, 0.06, 10, 28), mat(s.primaryColor, { roughness: 1 }), 0, hatBase - 0.13, 0);
    cuff.rotation.x = Math.PI / 2;
    const pom = mesh(new THREE.IcosahedronGeometry(0.09, 1), mat(s.primaryColor, { roughness: 1, flatShading: true }), 0, hatBase + 0.29, 0);
    head.add(dome, cuff, pom);
  } else if (s.hat === 'tophat' || s.hat === 'top hat') {
    const black = mat('#141414', { roughness: 0.5 });
    const brim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 28), black, 0, hatBase - 0.04, 0);
    const tube = mesh(new THREE.CylinderGeometry(0.25, 0.24, 0.46, 24), black, 0, hatBase + 0.2, 0);
    const band = mesh(new THREE.CylinderGeometry(0.253, 0.253, 0.08, 24), mat(s.primaryColor), 0, hatBase + 0.03, 0);
    head.add(brim, tube, band);
  } else if (s.hat === 'crown') {
    const gold = mat('#f5c518', { metalness: 0.85, roughness: 0.25, emissive: '#3a2a00' });
    const ring = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.13, 24, 1, true), gold, 0, hatBase + 0.02, 0);
    head.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.06, 0.16, 8), gold, Math.sin(a) * 0.25, hatBase + 0.16, Math.cos(a) * 0.25);
      const gem = mesh(new THREE.SphereGeometry(0.026, 8, 6), mat('#e63946'), 0, 0.09, 0);
      gem.userData.noOutline = true;
      spike.add(gem);
      head.add(spike);
    }
  }

  // ---- extra
  if (s.accessory === 'beard') {
    // front-lower slice of a sphere wrapped around the jaw
    const beard = mesh(new THREE.SphereGeometry(0.335, 18, 10, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.6, Math.PI * 0.28), hair);
    beard.position.set(0, -0.01, 0.02);
    head.add(beard);
    const stache = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), hair, 0, -0.055, HEAD_R - 0.01);
    stache.rotation.z = Math.PI / 2;
    stache.userData.noOutline = true;
    head.add(stache);
  } else if (s.accessory === 'glasses') {
    const frame = mat('#111111', { roughness: 0.3, metalness: 0.3 });
    const lens = new THREE.MeshStandardMaterial({ color: '#9ad0ff', transparent: true, opacity: 0.35, roughness: 0.05 });
    for (const side of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20), frame, side * 0.11, 0.04, HEAD_R + 0.01);
      rim.userData.noOutline = true;
      const glass = mesh(new THREE.CircleGeometry(0.07, 18), lens, side * 0.11, 0.04, HEAD_R + 0.008);
      glass.userData.keep = true;   // transparent: stays its own mesh
      const arm = mesh(new THREE.BoxGeometry(0.015, 0.015, 0.3), frame, side * 0.3, 0.05, 0.16);
      arm.userData.noOutline = true;
      head.add(rim, glass, arm);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.07, 0.015, 0.015), frame, 0, 0.05, HEAD_R + 0.015);
    bridge.userData.noOutline = true;
    head.add(bridge);
  } else if (s.accessory === 'earrings') {
    const goldMat = mat('#f5c518', { metalness: 0.8, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const hoop = mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), goldMat, side * (HEAD_R + 0.02), -0.09, 0.02);
      hoop.rotation.y = Math.PI / 2;
      hoop.userData.noOutline = true;
      head.add(hoop);
    }
  } else if (s.accessory === 'scarf') {
    const scarfMat = mat(shifted(s.primaryColor, 0.5, 0, 0.05), { roughness: 1 });
    const wrap = mesh(new THREE.TorusGeometry(0.2, 0.075, 10, 24), scarfMat, 0, 1.56, 0.01);
    wrap.rotation.x = Math.PI / 2;
    wrap.scale.set(1.1, 0.85, 1);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0.12, 1.54, 0.25);
    tailPivot.rotation.z = 0.1;
    tailPivot.add(mesh(new THREE.BoxGeometry(0.13, 0.42, 0.05), scarfMat, 0, -0.21, 0));
    body.add(wrap, tailPivot);
    trail.push({ obj: tailPivot, set: 0, gain: 1.3, baseX: 0, baseZ: 0.1 });
  } else if (s.accessory === 'backpack') {
    const packMat = mat(shifted(s.secondaryColor, 0.45, 0.2, 0.15));
    const strapMat = mat(darker(s.primaryColor, 0.2));
    // the pack hangs from a pivot at the shoulders, so it swings
    const packPivot = new THREE.Group();
    packPivot.position.set(0, 1.46, -0.2);
    const pack = mesh(new THREE.BoxGeometry(0.5, 0.56, 0.24), packMat, 0, -0.26, -0.13);
    const pocket = mesh(new THREE.BoxGeometry(0.36, 0.22, 0.08), mat(darker(packMat.color.getStyle(), 0.1)), 0, -0.41, -0.27);
    packPivot.add(pack, pocket);
    body.add(packPivot);
    trail.push({ obj: packPivot, set: 1, gain: 0.45, baseX: 0, baseZ: 0 });
    for (const side of [-1, 1]) {
      body.add(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.04), strapMat, side * 0.17, 1.22, 0.21));
    }
  }

  // ---- BAKE: every rigid segment becomes ONE toon mesh with ONE merged outline (about 20 draw calls for the whole character)
  const OL = 0.03;
  // the meshes belonging to a segment: its own mesh children (and their mesh children), but not other pivots
  const collect = (g) => {
    const out = [];
    const walk = (o) => {
      for (const c of o.children) {
        if (c.isMesh) { if (!c.userData.keep && !c.userData.isOutline) out.push(c); walk(c); }
      }
    };
    walk(g);
    return out;
  };
  const bake = (g, opts) => { const m = bakeToon(g, collect(g), { outline: OL, ...opts }); if (m) g.add(m); };
  for (let i = 0; i < 2; i++) {
    bake(legs[i], { print: true });
    bake(knees[i], { print: true });
    bake(arms[i], { print: true });
    bake(elbows[i], {});
  }
  bake(body, { print: true });
  bake(head, {});
  for (const t of trail) {
    if (t.jiggle) {
      // afro and bun: their own mesh (flat-shaded for the afro) and outline, in head space; the jiggle then offsets the baked mesh
      const src = t.obj;
      src.userData.keep = false;
      const baked = bakeToon(head, [src], { outline: OL, flatShading: src.material.flatShading });
      head.add(baked);
      t.obj = baked;
      t.x0 = t.y0 = t.z0 = 0;
    } else if (t.obj.isGroup && !t.obj.userData.clustered && t.obj.children.some((c) => c.isMesh)) {
      bake(t.obj, {});      // ponytail, scarf tail, backpack: baked on their own pivots, with an outline
    }
  }

  // ---- name tag
  const tag = makeNameTag(name);
  tag.position.y = 2.75 + (s.hat === 'tophat' || s.hat === 'top hat' ? 0.35 : 0) + (s.hair === 'afro' ? 0.15 : 0);
  root.add(tag);

  const spring = () => ({ x: 0, v: 0 });
  root.userData = {
    body, legs, knees, arms, elbows, head, tag, trail,
    phase: 0, stride: 0, t: 0, moveBlend: 0, skidBlend: 0, stretch: 1, steps: 0,
    leanP: spring(), leanR: spring(), sets: [{ p: spring(), r: spring() }, { p: spring(), r: spring() }],
    react: { catchT: 0, hitT: 0, cheerT: 0, waveT: 0, pose: '', slump: 0 },
  };
  return root;
}

// An umber pill with cream Archivo 800. The font loads from Google Fonts: the tag is drawn at once (so it exists) and drawn AGAIN with
// the real font as soon as it is there (main.js also waits for the font before building the character, so this is the fallback).
const TAG_FONT = '800 52px Archivo, system-ui, sans-serif';
function drawTag(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = TAG_FONT;
  const w = Math.ceil(ctx.measureText(text).width) + 56;
  c.width = w;
  c.height = 84;
  ctx.font = TAG_FONT;
  ctx.fillStyle = '#2B1A10';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 84, 42);
  ctx.fill();
  ctx.fillStyle = '#FFF1D6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 45);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w };
}

function makeNameTag(text) {
  const { tex, w } = drawTag(text);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, toneMapped: false }));
  sprite.scale.set((w / 84) * 0.34, 0.34, 1);
  sprite.renderOrder = 10;
  if (document.fonts && !document.fonts.check(TAG_FONT)) {
    document.fonts.load(TAG_FONT).then(() => {
      const next = drawTag(text);
      const old = sprite.material.map;
      sprite.material.map = next.tex;
      sprite.material.needsUpdate = true;
      sprite.scale.set((next.w / 84) * 0.34, 0.34, 1);
      old.dispose();
    }).catch(() => {});
  }
  return sprite;
}

// ---------------------------------------------------------------- motion
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const idle = { vx: 0, vz: 0, ax: 0, az: 0, dashing: false, skidding: false };

/**
 * Animate a character from how it is moving. m = { vx, vz, ax, az, dashing, skidding } in WORLD units (velocity and
 * acceleration on the ground plane). The character's own rotation.y is its facing. Returns 1 on the frame a foot plants
 * (from the stride, which advances by DISTANCE travelled so feet do not skate), else 0. No allocation.
 *   - legs: thigh swing + knee bend on the back swing; arms: opposite swing, elbows bend more when running; walk -> run by speed
 *   - lean: the body tilts toward its acceleration (more in a dash, back in a skid) on springs (TUNE.leanFreq / leanZeta)
 *   - hair locks, ponytail, scarf tail, backpack lag on springs (TUNE.trailFreq / trailZeta); afro and bun jiggle
 *   - dash: the body stretches along its forward axis and tips forward; idle: gentle breathing
 */
export function updateCharacterMotion(ch, dt, m) {
  const u = ch.userData;
  const T = TUNE;
  u.t += dt;
  const f = ch.rotation.y;
  const sn = Math.sin(f);
  const cs = Math.cos(f);
  // forward = (sin, cos), sideways = (cos, -sin) on the ground
  const vf = m.vx * sn + m.vz * cs;
  const vl = m.vx * cs - m.vz * sn;
  const af = m.ax * sn + m.az * cs;
  const al = m.ax * cs - m.az * sn;
  const speed = Math.hypot(m.vx, m.vz);
  const run = clamp((speed - 2.5) / 4, 0, 1);

  // stride: advances by distance; frozen in a skid (feet planted)
  const prev = Math.floor(u.stride / Math.PI);
  if (speed > 0.25 && !m.skidding) u.stride += (speed * dt / T.stride) * Math.PI;
  const planted = Math.floor(u.stride / Math.PI) !== prev ? 1 : 0;
  u.steps = planted;
  u.moveBlend += ((speed > 0.4 && !m.skidding ? 1 : 0) - u.moveBlend) * (1 - Math.exp(-12 * dt));
  u.skidBlend += ((m.skidding ? 1 : 0) - u.skidBlend) * (1 - Math.exp(-20 * dt));
  const mb = u.moveBlend;

  const swing = 0.3 + 0.5 * run;
  const armSwing = 0.25 + 0.55 * run;
  for (let i = 0; i < 2; i++) {
    const a = u.stride + (i ? Math.PI : 0);
    const sa = Math.sin(a);
    u.legs[i].rotation.x = sa * swing * mb;
    u.knees[i].rotation.x = Math.max(0, -Math.cos(a)) * (0.45 + 0.95 * run) * mb + 0.35 * u.skidBlend;
    const arm = -sa * armSwing * mb;
    u.arms[i].rotation.x = arm - 0.25 * u.skidBlend;
    u.arms[i].rotation.z = (i ? 1 : -1) * (-0.08 - 0.45 * u.skidBlend - 0.25 * (m.dashing ? 1 : 0));
    u.elbows[i].rotation.x = -((0.12 + 0.85 * run) * mb + 0.2 + Math.max(0, -arm) * 0.5 * mb);
  }
  const breathe = Math.sin(u.t * 2.2) * 0.012;
  u.body.position.y = Math.abs(Math.sin(u.stride)) * 0.06 * run * mb + breathe * (1 - mb);
  u.head.rotation.z = Math.sin(u.stride) * 0.04 * mb + Math.sin(u.t * 1.3) * 0.03 * (1 - mb);

  // lean on springs: toward the acceleration, forward in a dash, back in a skid
  const lim = (m.dashing ? T.leanDash : T.leanMax) * DEG;
  const tp = clamp(af / 45, -1, 1) * lim + (m.dashing ? 0.5 * lim : 0) - 0.6 * lim * u.skidBlend + clamp(vf / T.speed, 0, 1.5) * 0.25 * lim;
  const tr = -clamp(al / 45, -1, 1) * lim;
  springStep(u.leanP, clamp(tp, -1.5 * lim, 1.5 * lim), T.leanFreq, T.leanZeta, dt);
  springStep(u.leanR, tr, T.leanFreq, T.leanZeta, dt);
  u.body.rotation.x = u.leanP.x;
  u.body.rotation.z = u.leanR.x;
  u.head.rotation.x = -u.leanP.x * 0.5;

  // dash stretch along the forward axis (volume kept roughly)
  u.stretch += ((m.dashing ? T.dashStretch : 1) - u.stretch) * (1 - Math.exp(-24 * dt));
  const sxy = 1 / Math.sqrt(u.stretch);
  u.body.scale.set(sxy, sxy, u.stretch);

  // the things that trail behind
  for (let k = 0; k < 2; k++) {
    const set = u.sets[k];
    const freq = k ? T.trailFreq * 0.75 : T.trailFreq;
    const zeta = k ? Math.min(1.2, T.trailZeta * 1.15) : T.trailZeta;
    springStep(set.p, clamp(af * 0.012 + vf * 0.05, -0.9, 0.9), freq, zeta, dt);
    springStep(set.r, clamp(-(al * 0.012 + vl * 0.05), -0.9, 0.9), freq, zeta, dt);
  }
  const trail = u.trail;
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const set = u.sets[t.set];
    if (t.jiggle) {
      t.obj.position.set(t.x0 + set.r.x * t.gain, t.y0 - Math.abs(set.p.x) * t.gain * 0.3, t.z0 - set.p.x * t.gain);
    } else {
      t.obj.rotation.x = t.baseX + set.p.x * t.gain;
      t.obj.rotation.z = t.baseZ + set.r.x * t.gain;
    }
  }
  applyReactions(u, dt);
  return planted;
}

// ---------------------------------------------------------------- reactions (layered on top of the motion; they never block movement)
export function triggerReaction(ch, kind) {
  const r = ch.userData.react;
  if (kind === 'catch') r.catchT = 0.25;
  else if (kind === 'hit') r.hitT = 0.4;
  else if (kind === 'cheer') r.cheerT = 0.9;
  else if (kind === 'wave') r.waveT = 1.3;
}

export function setCharacterPose(ch, pose) {
  ch.userData.react.pose = pose || '';
}

const lerp = (a, b, w) => a + (b - a) * w;

function applyReactions(u, dt) {
  const r = u.react;
  r.catchT = Math.max(0, r.catchT - dt);
  r.hitT = Math.max(0, r.hitT - dt);
  r.cheerT = Math.max(0, r.cheerT - dt);
  r.waveT = Math.max(0, r.waveT - dt);
  u.body.position.z = 0;
  const catchW = r.catchT > 0 ? Math.sin(Math.PI * (1 - r.catchT / 0.25)) : 0;
  const hitP = 1 - r.hitT / 0.4;
  const hitW = r.hitT > 0 ? Math.sin(Math.PI * hitP) : 0;
  const cheerHeld = r.pose === 'cheer';
  const cheerW = cheerHeld ? 1 : r.cheerT > 0 ? Math.min(1, (1 - r.cheerT / 0.9) * 6, r.cheerT * 6) : 0;
  r.slump += ((r.pose === 'slump' ? 1 : 0) - r.slump) * (1 - Math.exp(-6 * dt));
  const waveP = 1 - r.waveT / 1.3;
  const waveW = r.waveT > 0 ? Math.min(1, waveP * 6, r.waveT * 6) : 0;
  if (catchW + hitW + cheerW + r.slump + waveW < 0.001) return;

  const body = u.body;
  const armUp = Math.max(catchW, cheerW);
  // hop: a small jump on a catch; a livelier bounce while cheering
  body.position.y += catchW * 0.22 + Math.abs(Math.sin(u.t * (cheerHeld ? 7 : 12))) * 0.12 * cheerW;
  // stumble: back and over, with a wobble that dies away
  body.rotation.x -= 0.55 * hitW;
  body.position.z = -0.2 * hitW;
  body.rotation.z += Math.sin(hitP * 30) * 0.16 * (1 - hitP) * (r.hitT > 0 ? 1 : 0);
  // slump: head down, shoulders dropped, arms loose
  body.rotation.x += 0.2 * r.slump;
  body.position.y -= 0.05 * r.slump;
  u.head.rotation.x += 0.6 * r.slump;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const arm = u.arms[i];
    const elbow = u.elbows[i];
    arm.rotation.x = lerp(arm.rotation.x, -2.75, armUp);
    arm.rotation.z += side * -0.3 * armUp;
    elbow.rotation.x = lerp(elbow.rotation.x, -0.22, armUp);
    arm.rotation.x += -0.9 * hitW * side;                              // arms flail out of step
    arm.rotation.x = lerp(arm.rotation.x, 0.12 + Math.sin(u.t * 1.4 + i * 2) * 0.05, r.slump);
    arm.rotation.z = lerp(arm.rotation.z, side * -0.12, r.slump);
    elbow.rotation.x = lerp(elbow.rotation.x, -0.08, r.slump);
  }
  if (waveW > 0) {   // a small wave with the right arm
    u.arms[1].rotation.x = lerp(u.arms[1].rotation.x, -2.35, waveW);
    u.arms[1].rotation.z = lerp(u.arms[1].rotation.z, 0.5, waveW);
    u.elbows[1].rotation.x = lerp(u.elbows[1].rotation.x, -0.5 + Math.sin(u.t * 13) * 0.6, waveW);
  }
}

// The menu and game-over poses: the same animation at a share of top speed, in the direction the character faces.
export function animateCharacter(ch, dt, speed, time) {
  void time;
  const v = speed * TUNE.speed;
  idle.vx = Math.sin(ch.rotation.y) * v;
  idle.vz = Math.cos(ch.rotation.y) * v;
  return updateCharacterMotion(ch, dt, idle);
}

export function disposeCharacter(ch) {
  ch.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite) {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}
