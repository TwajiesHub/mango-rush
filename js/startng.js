// Talks to start.ng: who is playing, their character, and the shared leaderboard.
// Follows https://start.ng/docs.md — the hidden connect page (postMessage), with the
// auth/me API as a fallback.

const START_NG = 'https://start.ng';
const API = 'https://api.start.ng';

export const DEFAULT_STYLE = {
  body: 'male',
  primaryColor: '#ffb627',
  secondaryColor: '#2d3436',
  skinColor: '#c68642',
  hairColor: '#1b1410',
  hair: 'short',
  hat: 'cap',
  accessory: 'none',
};

const HAIR = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'];
const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'];
const EXTRAS = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'];
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// Clean up a style from start.ng: unknown or missing values fall back to something sensible.
export function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  if (s.hat === 'top hat') s.hat = 'tophat';
  return {
    body: s.body === 'female' ? 'female' : 'male',
    primaryColor: isHex(s.primaryColor) ? s.primaryColor : DEFAULT_STYLE.primaryColor,
    secondaryColor: isHex(s.secondaryColor) ? s.secondaryColor : DEFAULT_STYLE.secondaryColor,
    skinColor: isHex(s.skinColor) ? s.skinColor : DEFAULT_STYLE.skinColor,
    hairColor: isHex(s.hairColor) ? s.hairColor : DEFAULT_STYLE.hairColor,
    hair: HAIR.includes(s.hair) ? s.hair : 'short',
    hat: HATS.includes(s.hat) ? s.hat : 'none',
    accessory: EXTRAS.includes(s.accessory) ? s.accessory : 'none',
  };
}

// ---- the connect page (from the start.ng docs)
let frame;
function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

export async function askStartNg(message, replyType, timeoutMs = 4000) {
  try {
    const el = await connectFrame();
    return await new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
      const timer = setTimeout(() => done(null), timeoutMs);
      function onMessage(e) {
        if (e.origin !== START_NG || e.source !== el.contentWindow) return; // only trust start.ng
        if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
      }
      addEventListener('message', onMessage);
      el.contentWindow.postMessage({ ...message, requestId }, START_NG);
    });
  } catch {
    return null;
  }
}

// Returns { signedIn, id, name, account, face, style }
export async function getPlayer() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (reply && (reply.user || reply.guest)) {
    const p = reply.user ?? reply.guest;
    return {
      signedIn: !!reply.user,
      id: reply.user?.id ?? 'guest',
      name: p.name || 'Guest',
      account: reply.user?.account ?? null,
      face: p.face ?? null,
      style: normalizeStyle(p.style),
    };
  }
  // Fallback: the signed-in API (used when the connect page does not answer)
  try {
    const res = await fetch(`${API}/auth/me`, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`auth/me ${res.status}`);
    const me = await res.json();
    const c = me.character || {};
    return {
      signedIn: true,
      id: me.id ?? 'me',
      name: c.name || (me.name || 'Player').split(' ')[0],
      account: null,
      face: null,
      style: normalizeStyle(c.style),
    };
  } catch {
    return { signedIn: false, id: 'guest', name: 'Guest', account: null, face: null, style: normalizeStyle(null) };
  }
}

export function signInUrl() {
  return `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// Save a run to the shared leaderboard (signed-in players only). stats must match startng.json.
// Resolves to { ok, result: { best, improved, rank, stats } } or { ok: false, error } or null.
export function saveScore(stats) {
  return askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved', 6000);
}

export function getLeaderboard(limit = 10) {
  return askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData', 6000);
}

// A stable string so we can tell when the central style has changed.
export function styleKey(player) {
  return JSON.stringify([player.signedIn, player.name, player.style]);
}
