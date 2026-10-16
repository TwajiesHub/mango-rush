// Mango Rush — the share card image and sharing.     OWNER: Claude Code  ·  STATUS: stub
//
// Draws a 1200 x 630 PNG on a <canvas> (2D context, no libraries) and shares it.
// IMPORTS ALLOWED: '../content/text.js' (TEXT, fill), '../core/config.js' (CONFIG)
//
// CONTRACT (keep these exact exports and signatures):
//
//   createShareCard({ summary, player, portraitUrl, dailyLabel, rank }) -> Promise<Blob>
//     summary: RunSummary (core/state.js); player: { name, account, style };
//     portraitUrl: the player's face from start.ng (PNG data URL) or a rendered portrait (may be null);
//     rank: optional number (their start.ng leaderboard rank) -> show "#<rank> on start.ng" under the score;
//     dailyLabel: e.g. "16 Oct".
//     LAYOUT (Golden Hour Print): ochre paper #D9A85B background with subtle grain (random 1px dots, seeded so it
//     looks the same every time) and a woven border strip (12 px umber/ochre checks) on the left edge;
//     left half: the character portrait inside a big saffron dot-ring circle (or the wordmark if no portrait);
//     right half: kicker (Cormorant spaced caps, "DAILY RUN · <date>" or "FREE PLAY"), player name,
//     the score huge (Archivo 900, umber, vermilion offset shadow 6 px), medal name + dot-ring medal,
//     "Best combo x5 · 64 mangoes · survived 3:12", and the footer TEXT.share.cardFooter + "mango-rush.start.ng".
//     Fonts: wait for document.fonts.load('900 64px Archivo') and ('600 20px "Cormorant Garamond"') before drawing.
//     Return canvas.toBlob(..., 'image/png').
//
//   shareScore({ summary, blob, url }) -> Promise<'shared'|'downloaded'|'copied'|'failed'>
//     text = fill(summary.mode === 'daily' ? TEXT.share.dailyMessage : TEXT.share.message,
//                 { score: <score with thousands separators>, url, date: <dailyLabel> }).
//     1) If navigator.canShare && navigator.canShare({ files: [file] }) -> navigator.share({ files, text, title }).
//        AbortError (user closed the sheet) -> return 'shared' quietly, do not fall through.
//     2) Else: download the PNG (a temporary <a download="mango-rush-score.png">) AND copy the text with
//        navigator.clipboard.writeText -> 'downloaded'.
//     3) If everything fails -> 'failed'. Never throw.
//
// RULES: never upload anything anywhere; everything stays on the device.

export async function createShareCard({ summary, player, portraitUrl, dailyLabel, rank }) {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#D9A85B'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#2B1A10'; ctx.font = '900 120px sans-serif'; ctx.fillText(String(summary.score), 80, 360);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function shareScore({ summary, blob, url }) {
  return 'failed';
}
