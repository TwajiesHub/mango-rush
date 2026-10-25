// Mango Rush — the dot-ring shader: warning rings (drops.js) and bank spots (bank.js).   OWNER: Claude Code  ·  STATUS: step 5b
//
// CONTRACT:
//   ringGeo                 a shared 2 x 2 plane (rotate it flat: mesh.rotation.x = -PI / 2)
//   makeRingMaterial(type)  type: 'mango' | 'golden' | 'coconut' | 'rotten' | 'shield' | 'bank' -> a ShaderMaterial. Unlit, transparent,
//                           drawn just above the deck. Per-material uniforms (change them live, nothing is rebuilt): uSpacing, uDotSize,
//                           uPulse (Hz) + uPulseAmt, uInner, uLock, uCPulse, uTrail, uOpacity. The shared uTime is RING_TIME.
//   RING_TIME               { value } advanced by tickRings(dt)
//   tickRings(dt)           drops.js calls it once per frame
//   RING_OUTER              the radius of each ring's outermost dots in the quad's own units (scale the mesh by radius / RING_OUTER[type])

import * as THREE from 'three';

export const RING_OUTER = { mango: 0.70, golden: 0.84, coconut: 0.72, rotten: 0.70, shield: 0.90, bank: 0.86 };

export function tickRings(dt) {
  RING_TIME.value += dt;
}

// ---------------------------------------------------------------- the warning ring: dots by polar coordinates, in a small shader
export const RING_TIME = { value: 0 };
const RING_VERT = `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
precision highp float;
uniform float uKind, uSpacing, uDotSize, uPulse, uPulseAmt, uTime, uOpacity, uInner, uLock, uCPulse;
uniform vec2 uTrail;
uniform vec3 uColor, uColor2, uDark;
varying vec2 vP;

// signed distance to the nearest of n dots on a ring of radius r
float dots(vec2 p, float r, float n, float size) {
  float a = atan(p.y, p.x);
  float st = 6.2831853 / n;
  float ca = floor(a / st + 0.5) * st;
  return length(p - r * vec2(cos(ca), sin(ca))) - size;
}
float cover(float d) {
  float w = fwidth(d);
  return 1.0 - smoothstep(-w, w, d);
}
vec4 ringAt(vec2 p) {
  float r = length(p);
  float s = uDotSize * (1.0 + uPulseAmt * sin(uTime * 6.2831853 * uPulse));
  vec3 acc = vec3(0.0);
  float tot = 0.0;
  float a = 0.0;
  if (uKind < 0.5) {
    // MANGO: gold dots, a cream inner ring, a gold centre dot
    float c1 = cover(dots(p, 0.70, floor(26.0 * uSpacing + 0.5), 0.058 * s));
    float c2 = cover(dots(p, 0.42, floor(14.0 * uSpacing + 0.5), 0.048 * s)) * uInner;
    float c3 = cover(r - 0.065 * s);
    acc = uColor * c1 + uColor2 * c2 + uColor * c3;
    tot = c1 + c2 + c3;
    a = min(1.0, tot);
  } else if (uKind < 1.5) {
    // GOLDEN: larger and glowing: a soft disc of gold under three rings of dots
    float glow = (1.0 - smoothstep(0.0, 0.96, r)) * 0.3;
    float c1 = cover(dots(p, 0.84, floor(32.0 * uSpacing + 0.5), 0.07 * s));
    float c2 = cover(dots(p, 0.60, floor(20.0 * uSpacing + 0.5), 0.056 * s));
    float c3 = cover(dots(p, 0.36, floor(10.0 * uSpacing + 0.5), 0.046 * s)) * uInner;
    float c4 = cover(r - 0.075 * s);
    acc = uColor * (c1 + c2 + c4) + uColor2 * c3;
    tot = c1 + c2 + c3 + c4;
    a = max(min(1.0, tot), glow);
    acc = acc + uColor * glow * (1.0 - min(1.0, tot));
    tot = max(tot, 0.0001) + glow * (1.0 - min(1.0, tot));
  } else if (uKind < 2.5) {
    // COCONUT: vermilion dots and a dark dotted CROSS in the middle: the shape says "danger", not only the colour
    float c1 = cover(dots(p, 0.72, floor(22.0 * uSpacing + 0.5), 0.06 * s));
    float c2 = cover(dots(p, 0.47, floor(12.0 * uSpacing + 0.5), 0.05 * s)) * uInner;
    vec2 d1 = vec2(0.70710678, 0.70710678);
    vec2 d2 = vec2(-0.70710678, 0.70710678);
    float gap = 0.17;
    float s1 = dot(p, d1);
    float t1 = dot(p, d2);
    float k1 = clamp(floor(s1 / gap + 0.5), -2.0, 2.0);
    float s2 = t1;
    float t2 = s1;
    float k2 = clamp(floor(s2 / gap + 0.5), -2.0, 2.0);
    float cx = max(cover(length(vec2(s1 - k1 * gap, t1)) - 0.046 * s), cover(length(vec2(s2 - k2 * gap, t2)) - 0.046 * s));
    float cp = 1.0 + 0.7 * sin(uTime * 6.2831853 * uCPulse) * (1.0 - uLock);
    float c3 = cover(r - mix(0.06 * cp, 0.14, uLock) * s);
    float dark = max(cx, c3);
    acc = uColor * (c1 + c2) + uDark * dark;
    tot = c1 + c2 + dark;
    a = min(1.0, tot);
  } else if (uKind < 3.5) {
    // BANK SPOT: a glowing saffron ring of dots on a soft disc of light. It makes its own light (unlit), so it reads the same by day and
    // at night.
    float glow = (1.0 - smoothstep(0.0, 1.0, r)) * 0.5;
    float d1 = dots(p, 0.86, floor(30.0 * uSpacing + 0.5), 0.062 * s);
    float d2 = dots(p, 0.58, floor(18.0 * uSpacing + 0.5), 0.05 * s);
    float c1 = cover(d1);
    float c2 = cover(d2);
    float c3 = cover(dots(p, 0.30, floor(8.0 * uSpacing + 0.5), 0.045 * s)) * uInner;
    float c4 = cover(r - 0.07 * s);
    // a thin umber edge round every dot, so the ring reads on a pale plank by day and on a dark deck at night
    float e1 = max(cover(d1 - 0.03) - c1, 0.0);
    float e2 = max(cover(d2 - 0.026) - c2, 0.0);
    acc = uColor * (c1 + c2 + c4) + uColor2 * c3 + uDark * (e1 + e2);
    tot = c1 + c2 + c3 + c4 + e1 + e2;
    a = max(min(1.0, tot), glow);
    acc = acc + uColor * glow * (1.0 - min(1.0, tot));
    tot = max(tot, 0.0001) + glow * (1.0 - min(1.0, tot));
  } else if (uKind < 4.5) {
    // ROTTEN (step 12, colour-blind safe): FEW, BIG, evenly spaced brown dots round a SOLID dark disc, nothing like the busy mango ring
    float c1 = cover(dots(p, 0.70, floor(9.0 * uSpacing + 0.5), 0.092 * s));
    float c2 = cover(r - 0.22 * s);
    acc = uColor * c1 + uDark * c2;
    tot = c1 + c2;
    a = min(1.0, tot);
  } else {
    // SHIELD (step 12, colour-blind safe): a gold DIAMOND outline (a solid line, not dots) with a dot in each corner and one in the middle
    float dia = abs(abs(p.x) + abs(p.y) - 0.80);
    float c1 = cover(dia - 0.05 * s) * step(abs(p.x) + abs(p.y), 0.90);   // (the outline)
    float cs = cover(min(min(length(p - vec2(0.80, 0.0)), length(p + vec2(0.80, 0.0))), min(length(p - vec2(0.0, 0.80)), length(p + vec2(0.0, 0.80)))) - 0.11 * s);
    float c3 = cover(r - 0.10 * s);
    float c4 = cover(dots(p, 0.86, 28.0, 0.034 * s));   // a faint dotted rim, so the ring still shows how far the catch reaches
    acc = uColor * (c1 + cs + c4) + uColor2 * c3;
    tot = c1 + cs + c3 + c4;
    a = min(1.0, tot);
  }
  return vec4(acc / max(tot, 0.0001), a);
}
void main() {
  vec4 r = ringAt(vP);
  vec3 col = r.rgb;
  float a = r.a;
  if (uTrail.x != 0.0 || uTrail.y != 0.0) {
    // a drifter: faint copies of the ring a little way back along the slide, so the dots trail behind it
    vec4 g1 = ringAt(vP + uTrail * 0.5);
    vec4 g2 = ringAt(vP + uTrail);
    float ga = max(g1.a * 0.45, g2.a * 0.22);
    vec3 gc = g1.a * 0.45 >= g2.a * 0.22 ? g1.rgb : g2.rgb;
    float oa = r.a + ga * (1.0 - r.a);
    col = (r.rgb * r.a + gc * ga * (1.0 - r.a)) / max(oa, 0.0001);
    a = oa;
  }
  gl_FragColor = vec4(col, a * uOpacity);
  #include <colorspace_fragment>
}`;

export const ringGeo = new THREE.PlaneGeometry(2, 2);
ringGeo.userData.shared = true;
const RING_KIND = { mango: 0, golden: 1, coconut: 2, bank: 3, rotten: 4, shield: 5 };   // every kind has its own SHAPE (not only a colour): mango dots + inner ring, golden glow, coconut cross, bank glow disc, rotten sparse dots + a solid disc, shield diamond
const RING_COLORS = {
  mango: ['#F2A93B', '#FFF1D6'], golden: ['#FFD84D', '#FFF1D6'], coconut: ['#C8432E', '#FFF1D6'],
  rotten: ['#9A7A45', '#FFF1D6'], shield: ['#FFD84D', '#FFF1D6'], bank: ['#FFB62E', '#FFF1D6'],
};

export function makeRingMaterial(type) {
  const [c1, c2] = RING_COLORS[type];
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uKind: { value: RING_KIND[type] }, uSpacing: { value: 1 }, uDotSize: { value: 1 }, uPulse: { value: 0 }, uPulseAmt: { value: 0 },
      uTime: RING_TIME, uOpacity: { value: 0.5 }, uInner: { value: 1 }, uLock: { value: 0 }, uCPulse: { value: 0 }, uTrail: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(c1) }, uColor2: { value: new THREE.Color(c2) }, uDark: { value: new THREE.Color('#2B1A10') },
    },
  });
}

