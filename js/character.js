// Builds the player's three.js character from their start.ng style.
// Every option from the start.ng character creator changes the model:
// body, skin, hair, hair colour, top (primaryColor), bottoms (secondaryColor), hat, extra (accessory).
import * as THREE from 'three';

const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  }
  return mats.get(key);
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

  // ---- legs (pivot at the hip so they can swing)
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.72, 0);
    const leg = mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.62, 12), bottoms, 0, -0.31, 0);
    const foot = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoe, 0, -0.62, 0.05);
    pivot.add(leg, foot);
    body.add(pivot);
    legs.push(pivot);
  }

  // ---- torso
  const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.42, 6, 16);
  const torso = mesh(torsoGeo, top, 0, 1.17, 0);
  torso.scale.set(female ? 0.96 : 1.12, 1, 0.72);
  body.add(torso);

  // hips / waistband in bottoms colour
  const hips = mesh(new THREE.CylinderGeometry(female ? 0.31 : 0.3, 0.3, 0.16, 16), bottoms, 0, 0.78, 0);
  hips.scale.z = 0.75;
  body.add(hips);

  if (female) {
    const skirt = mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.36, 20, 1, true), bottoms, 0, 0.62, 0);
    skirt.material = bottoms.clone();
    skirt.material.side = THREE.DoubleSide;
    skirt.scale.z = 0.82;
    body.add(skirt);
  }

  // neck
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 12), skin, 0, 1.55, 0));

  // ---- arms (pivot at shoulder)
  const arms = [];
  const shoulderX = female ? 0.36 : 0.42;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * shoulderX, 1.45, 0);
    pivot.rotation.z = side * 0.08;
    const sleeve = mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.3, 12), top, 0, -0.13, 0);
    const forearm = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 12), skin, 0, -0.42, 0);
    const hand = mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.6, 0);
    pivot.add(sleeve, forearm, hand);
    body.add(pivot);
    arms.push(pivot);
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
  let hatBase = HEAD_R - 0.02; // y (relative to head centre) where a hat sits
  if (s.hair === 'short') {
    const cap = mesh(new THREE.SphereGeometry(HEAD_R + 0.025, 24, 12, 0, Math.PI * 2, 0, Math.PI * (female ? 0.55 : 0.42)), hair);
    cap.rotation.x = -0.32;
    head.add(cap);
    if (female) {
      // a little bun so the female body reads differently at a glance
      head.add(mesh(new THREE.SphereGeometry(0.13, 14, 12), hair, 0, 0.12, -0.33));
    }
  } else if (s.hair === 'afro') {
    const afro = mesh(new THREE.IcosahedronGeometry(0.43, 2), hair, 0, 0.2, -0.12);
    afro.material = mat(s.hairColor, { roughness: 1, flatShading: true });
    head.add(afro);
    hatBase = 0.56;
  } else if (s.hair === 'dreads') {
    const cap = mesh(new THREE.SphereGeometry(HEAD_R + 0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
    cap.rotation.x = -0.35;
    head.add(cap);
    const count = 13;
    for (let i = 0; i < count; i++) {
      // angle measured from the face (+z): covers both sides and the back, never the face
      const a = Math.PI * 0.42 + (i / (count - 1)) * Math.PI * 1.16;
      const len = 0.42 + ((i * 7) % 5) * 0.045;
      const lock = mesh(new THREE.CylinderGeometry(0.042, 0.034, len, 8), hair);
      const r = HEAD_R + 0.02;
      lock.position.set(Math.sin(a) * r, 0.1 - len / 2, Math.cos(a) * r);
      lock.rotation.z = Math.sin(a) * 0.25;
      lock.rotation.x = -Math.cos(a) * 0.25;
      // sphere cap on the end of each lock
      lock.add(mesh(new THREE.SphereGeometry(0.042, 8, 6), hair, 0, -len / 2, 0));
      head.add(lock);
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
  } else if (s.hat === 'top hat') {
    const black = mat('#141414', { roughness: 0.5 });
    const brim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 28), black, 0, hatBase - 0.04, 0);
    const tube = mesh(new THREE.CylinderGeometry(0.25, 0.24, 0.46, 24), black, 0, hatBase + 0.2, 0);
    const band = mesh(new THREE.CylinderGeometry(0.253, 0.253, 0.08, 24), mat(s.primaryColor), 0, hatBase + 0.03, 0);
    head.add(brim, tube, band);
  } else if (s.hat === 'crown') {
    const gold = mat('#f5c518', { metalness: 0.85, roughness: 0.25, emissive: '#3a2a00' });
    const ring = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.13, 24, 1, true), gold, 0, hatBase + 0.02, 0);
    ring.material = gold.clone();
    ring.material.side = THREE.DoubleSide;
    head.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.06, 0.16, 8), gold, Math.sin(a) * 0.25, hatBase + 0.16, Math.cos(a) * 0.25);
      spike.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), mat('#e63946', { metalness: 0.3, roughness: 0.2 }), 0, 0.09, 0));
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
    head.add(stache);
  } else if (s.accessory === 'glasses') {
    const frame = mat('#111111', { roughness: 0.3, metalness: 0.3 });
    const lens = new THREE.MeshStandardMaterial({ color: '#9ad0ff', transparent: true, opacity: 0.35, roughness: 0.05 });
    for (const side of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20), frame, side * 0.11, 0.04, HEAD_R + 0.01);
      const glass = mesh(new THREE.CircleGeometry(0.07, 18), lens, side * 0.11, 0.04, HEAD_R + 0.008);
      const arm = mesh(new THREE.BoxGeometry(0.015, 0.015, 0.3), frame, side * 0.3, 0.05, 0.16);
      head.add(rim, glass, arm);
    }
    head.add(mesh(new THREE.BoxGeometry(0.07, 0.015, 0.015), frame, 0, 0.05, HEAD_R + 0.015));
  } else if (s.accessory === 'scarf') {
    const scarfMat = mat(shifted(s.primaryColor, 0.5, 0, 0.05), { roughness: 1 });
    const wrap = mesh(new THREE.TorusGeometry(0.2, 0.075, 10, 24), scarfMat, 0, 1.56, 0.01);
    wrap.rotation.x = Math.PI / 2;
    wrap.scale.set(1.1, 0.85, 1);
    const tail = mesh(new THREE.BoxGeometry(0.13, 0.42, 0.05), scarfMat, 0.12, 1.33, 0.25);
    tail.rotation.z = 0.1;
    body.add(wrap, tail);
  } else if (s.accessory === 'backpack') {
    const packMat = mat(shifted(s.secondaryColor, 0.45, 0.2, 0.15));
    const strapMat = mat(darker(s.primaryColor, 0.2));
    const pack = mesh(new THREE.BoxGeometry(0.5, 0.56, 0.24), packMat, 0, 1.2, -0.33);
    const pocket = mesh(new THREE.BoxGeometry(0.36, 0.22, 0.08), mat(darker(packMat.color.getStyle(), 0.1)), 0, 1.05, -0.47);
    body.add(pack, pocket);
    for (const side of [-1, 1]) {
      body.add(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.04), strapMat, side * 0.17, 1.22, 0.21));
    }
  }

  // ---- name tag
  const tag = makeNameTag(name);
  tag.position.y = 2.75 + (s.hat === 'top hat' ? 0.35 : 0) + (s.hair === 'afro' ? 0.15 : 0);
  root.add(tag);

  root.userData = { body, legs, arms, head, tag, phase: 0 };
  return root;
}

function makeNameTag(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '800 52px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 56;
  c.width = w;
  c.height = 84;
  ctx.font = font;
  ctx.fillStyle = 'rgba(26,20,16,0.78)';
  const r = 42;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 84, r);
  ctx.fill();
  ctx.fillStyle = '#fff6e5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 45);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set((w / 84) * 0.34, 0.34, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Walk / idle animation. speed is 0..1
export function animateCharacter(ch, dt, speed, time) {
  const u = ch.userData;
  u.phase += dt * (4 + speed * 10);
  const swing = Math.sin(u.phase) * 0.9 * speed;
  u.legs[0].rotation.x = swing;
  u.legs[1].rotation.x = -swing;
  u.arms[0].rotation.x = -swing * 0.9;
  u.arms[1].rotation.x = swing * 0.9;
  const bob = speed > 0.05 ? Math.abs(Math.sin(u.phase)) * 0.08 * speed : Math.sin(time * 2.2) * 0.012;
  u.body.position.y = bob;
  u.head.rotation.z = speed > 0.05 ? Math.sin(u.phase) * 0.04 : Math.sin(time * 1.3) * 0.03;
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
