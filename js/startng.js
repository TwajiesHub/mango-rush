// Talks to start.ng to get the signed-in player and their central character style.
// start.ng keeps you signed in with a cookie, so the request must send credentials.

const API = 'https://api.start.ng';

export const DEFAULT_STYLE = {
  primaryColor: '#ffb627',
  secondaryColor: '#2d3436',
  skinColor: '#c68642',
  hairColor: '#1b1410',
  body: 'male',
  hair: 'short',
  hat: 'cap',
  accessory: 'none',
};

// Returns { signedIn, id, name, style }
export async function getPlayer() {
  try {
    const res = await fetch(`${API}/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`auth/me ${res.status}`);
    const me = await res.json();
    const character = me.character || {};
    return {
      signedIn: true,
      id: me.id ?? 'me',
      name: character.name || (me.name || 'Player').split(' ')[0],
      style: { ...DEFAULT_STYLE, ...(character.style || {}) },
    };
  } catch (err) {
    console.info('[mango-rush] playing as guest:', err.message);
    return { signedIn: false, id: 'guest', name: 'Guest', style: { ...DEFAULT_STYLE } };
  }
}

// A stable string so we can tell when the central style has changed.
export function styleKey(player) {
  return JSON.stringify([player.name, player.style]);
}
