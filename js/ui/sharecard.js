// Mango Rush — the share card image and sharing.     OWNER: Claude Code  ·  STATUS: step 10 (the poster, drawn on the device)
//
// Draws a 1200 x 630 PNG on a <canvas> (2D context, no libraries) in the same poster style as the game-over card, and shares it.
// IMPORTS ALLOWED: '../content/text.js' (TEXT, fill), '../core/config.js' (CONFIG), './wordmark.js' (wordmarkSVG)
//
// CONTRACT (keep these exact exports and signatures):
//
//   createShareCard({ summary, player, portraitUrl, faceUrl, dailyLabel, rank }) -> Promise<Blob>   (rejects on failure: the caller shows a message)
//     summary: RunSummary (core/state.js); player: { name, account, style };
//     portraitUrl: the RENDERED character portrait (a data URL from renderer.makePortrait: always safe to export). faceUrl: the start.ng face picture,
//     used ONLY when the rendered portrait is missing or unusable, and only if it loads (crossOrigin = anonymous) and the canvas still exports (a toBlob
//     test); otherwise the card shows the player's initial in a saffron disc. Any start.ng request goes through startng.js (this file makes none).
//     rank: optional number -> "#<rank> on start.ng" under the score; dailyLabel: e.g. "25 Oct".
//     LAYOUT: a night backdrop with deep-green dot rings and a moon ring; an ochre poster card (2 px umber border, an inner 1 px rule, corner diamonds,
//     a vermilion hard shadow, a woven strip along its bottom edge); left: the wordmark and the portrait inside a saffron dot ring, then the name;
//     right: the kicker (Cormorant spaced caps: "DAILY RUN · 25 OCT" or "FREE PLAY · 25 OCT"), the score huge (Archivo 900, vermilion print
//     shadow) with the NEW BEST stamp when it is one, the medal ring and the 4 stats, and the footer "Play Mango Rush on start.ng" + the game URL.
//     Fonts: waits for document.fonts.load(...) and document.fonts.ready before drawing.
//
//   shareScore({ summary, blob, url, dailyLabel }) -> Promise<'shared'|'downloaded'|'saved'|'cancelled'|'failed'>
//     text = fill(summary.mode === 'daily' ? TEXT.share.dailyMessage : TEXT.share.message, { score, url, date }).
//     1) navigator.canShare({ files }) -> navigator.share({ files, text, title })  -> 'shared'. AbortError (the user closed the sheet) -> 'cancelled', quietly.
//     2) Else download the PNG (a temporary <a download="mango-rush-score.png">) AND copy the text with navigator.clipboard.writeText
//        -> 'downloaded' (the text copied) or 'saved' (the PNG only).
//     3) If everything fails -> 'failed'. Never throws. main.js turns every status into a short message (screens.showToast); nothing fails silently.
//
// RULES: never upload anything anywhere; everything stays on the device.

import TEXT, { fill } from '../content/text.js';
import { wordmarkSVG } from './wordmark.js';

const W = 1200;
const H = 630;
const C = { paper: '#D9A85B', paperLight: '#E6BE7A', ink: '#2B1A10', vermilion: '#E4573D', vermilionDark: '#C8432E', saffron: '#F2A93B', green: '#123D2F', night: '#0B0B0C', cream: '#FFF1D6', gold: '#FFD84D' };
const MEDAL = { none: '#C9A66B', bronze: '#B87333', silver: '#D5D8DC', gold: '#F2A93B', diamond: '#8FE3EE' };
const num = (n) => Number(n || 0).toLocaleString('en-US');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// a seeded random, so the paper grain looks the same every time
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// text with letter spacing, drawn letter by letter (ctx.letterSpacing is not everywhere); align: 'left' | 'center' | 'right'
function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((s, w) => s + w, 0) - spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const was = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i]; });
  ctx.textAlign = was;
}

function dotRing(ctx, cx, cy, r, n, dotR, color, offset = 0) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + offset;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// load an image that the canvas can export: crossOrigin = anonymous (not for data: URLs) and a toBlob test on a tiny canvas. null if it fails.
async function usableImage(url) {
  if (!url) return null;
  try {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const t = document.createElement('canvas');
    t.width = t.height = 8;
    t.getContext('2d').drawImage(img, 0, 0, 8, 8);
    const ok = await new Promise((res) => { try { t.toBlob((b) => res(!!b), 'image/png'); } catch { res(false); } });
    return ok ? img : null;
  } catch {
    return null;
  }
}

async function svgImage(svg) {
  const img = new Image();
  const doc = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');   // a standalone SVG image needs its namespace
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`;
  try { await img.decode(); return img; } catch { return null; }
}

function drawBackdrop(ctx) {
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  dotRing(ctx, 120, 150, 250, 56, 7, C.green);
  dotRing(ctx, 120, 150, 190, 44, 6, C.green);
  dotRing(ctx, 120, 150, 130, 32, 5, C.green);
  dotRing(ctx, 1096, 96, 92, 28, 3, 'rgba(242,169,59,0.8)');
  dotRing(ctx, 1096, 96, 80, 24, 2.4, 'rgba(255,241,214,0.7)');
  ctx.fillStyle = C.cream;
  ctx.beginPath(); ctx.arc(1096, 96, 50, 0, Math.PI * 2); ctx.fill();
  dotRing(ctx, 1010, 600, 220, 50, 6, C.green, 0.3);
}

export async function createShareCard({ summary, player, portraitUrl, faceUrl, dailyLabel, rank }) {
  // fonts first: the card must never be drawn in a fallback face
  try {
    await Promise.all([document.fonts.load('900 64px Archivo'), document.fonts.load('800 24px Archivo'), document.fonts.load('600 20px "Cormorant Garamond"')]);
    await document.fonts.ready;
  } catch { /* draw with whatever is loaded */ }

  // the portrait: the rendered one first; the start.ng face only if it loads with crossOrigin and the canvas still exports
  let portrait = await usableImage(portraitUrl);
  if (!portrait) portrait = await usableImage(faceUrl);
  const logo = await svgImage(wordmarkSVG({ ink: C.ink, accent: C.saffron }));

  const draw = (withPortrait) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    drawBackdrop(ctx);

    // the poster card
    const x = 44, y = 40, w = 1104, h = 536;
    ctx.fillStyle = C.vermilion; ctx.fillRect(x + 14, y + 14, w, h);                       // the hard offset shadow
    ctx.fillStyle = C.paper; ctx.fillRect(x, y, w, h);
    const rnd = seeded(7);
    for (let i = 0; i < 1800; i++) {                                                         // paper grain: 1 px dots
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(43,26,16,0.06)' : 'rgba(255,241,214,0.09)';
      ctx.fillRect(x + rnd() * w, y + rnd() * h, 1.4, 1.4);
    }
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1.2; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);                     // the inner rule
    ctx.fillStyle = C.ink;
    for (const [dx, dy] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) {
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    }
    for (let i = 0; i * 28 < w - 80; i++) ctx.fillRect(x + 40 + i * 28, y + h - 26, 14, 10);  // a woven strip along the bottom edge

    // left: the wordmark, the portrait in a saffron dot ring, the name
    if (logo) ctx.drawImage(logo, x + 48, y + 38, 232, 104);
    const px = x + 168, py = y + 300, pr = 104;
    dotRing(ctx, px, py, pr + 26, 30, 6.5, C.saffron);
    dotRing(ctx, px, py, pr + 12, 26, 3.4, C.ink);
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = C.paperLight; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    if (withPortrait && portrait) {
      const s = Math.max((pr * 2) / portrait.width, (pr * 2) / portrait.height);
      ctx.drawImage(portrait, px - (portrait.width * s) / 2, py - (portrait.height * s) / 2, portrait.width * s, portrait.height * s);
    } else {
      ctx.fillStyle = C.saffron; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      ctx.fillStyle = C.ink; ctx.font = '900 110px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((player?.name || 'G').trim().charAt(0).toUpperCase() || 'G', px, py + 6);
    }
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '800 28px Archivo, system-ui, sans-serif';
    spaced(ctx, String(player?.name || 'Guest').toUpperCase().slice(0, 14), px, y + 478, 3, 'center');

    // right: kicker, score, stamp, medal + stats, footer
    const rx = x + 372;
    ctx.fillStyle = C.ink; ctx.font = '600 22px "Cormorant Garamond", Georgia, serif';
    const kicker = fill(summary.mode === 'daily' ? 'Daily run · {date}' : 'Free play · {date}', { date: dailyLabel || '' }).toUpperCase();
    spaced(ctx, kicker, rx, y + 78, 8);
    const scoreText = num(summary.score);
    ctx.textAlign = 'left';
    ctx.font = '900 156px Archivo, system-ui, sans-serif';
    try { ctx.fontStretch = 'expanded'; } catch { /* optional */ }
    let fs = 156;
    while (ctx.measureText(scoreText).width > 620 && fs > 80) { fs -= 6; ctx.font = `900 ${fs}px Archivo, system-ui, sans-serif`; }
    ctx.fillStyle = C.vermilion; ctx.fillText(scoreText, rx + 7, y + 232 + 7);
    ctx.fillStyle = C.ink; ctx.fillText(scoreText, rx, y + 232);
    try { ctx.fontStretch = 'normal'; } catch { /* optional */ }
    if (summary.isBest) {                                                                    // the rotated stamp
      ctx.save(); ctx.translate(rx + 640, y + 112); ctx.rotate(-0.12);
      ctx.fillStyle = C.paper; ctx.fillRect(-110, -22, 220, 44);
      ctx.lineWidth = 3; ctx.strokeStyle = C.vermilionDark; ctx.strokeRect(-110, -22, 220, 44);
      ctx.fillStyle = C.vermilionDark; ctx.font = '800 20px Archivo, system-ui, sans-serif';
      spaced(ctx, TEXT.gameOver.newBest.toUpperCase(), 0, 8, 5, 'center');
      ctx.restore();
    }
    if (rank) {
      ctx.fillStyle = C.ink; ctx.font = '800 22px Archivo, system-ui, sans-serif';
      spaced(ctx, fill(TEXT.gameOver.rank, { rank }).toUpperCase(), rx, y + 276, 3);
    }

    // the medal ring and the four stats
    const mx = rx + 62, my = y + 372, medal = summary.medal || 'none';
    dotRing(ctx, mx, my, 56, 24, 4.6, MEDAL[medal] || MEDAL.none);
    dotRing(ctx, mx, my, 42, 20, 2.9, C.ink, 0.1);
    ctx.fillStyle = MEDAL[medal] || MEDAL.none; ctx.beginPath(); ctx.arc(mx, my, 31, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.font = `900 ${medal === 'diamond' || medal === 'bronze' || medal === 'silver' ? 11 : 14}px Archivo, system-ui, sans-serif`;
    ctx.fillText(medal === 'none' ? '—' : (TEXT.medals[medal] || '').toUpperCase(), mx, my + 5);
    const stats = [[TEXT.gameOver.stats.mangoes, num(summary.mangoes)], [TEXT.gameOver.stats.bestCombo, `×${summary.bestMultiplier}`], [TEXT.gameOver.stats.nearMisses, num(summary.nearMisses)], [TEXT.gameOver.stats.survived, mmss(summary.timeSurvived)]];
    const sx0 = rx + 150, sw = 148;
    ctx.fillStyle = C.ink; ctx.fillRect(sx0 - 10, my - 50, sw * 4, 2); ctx.fillRect(sx0 - 10, my + 50, sw * 4, 2);
    stats.forEach(([label, value], i) => {
      const cx = sx0 + i * sw;
      if (i > 0) ctx.fillRect(cx - 14, my - 50, 1.5, 100);
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink;
      ctx.font = '800 12px Archivo, system-ui, sans-serif'; spaced(ctx, label.toUpperCase(), cx, my - 20, 2.4);
      ctx.font = '800 40px Archivo, system-ui, sans-serif'; ctx.fillText(value, cx, my + 28);
    });
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.font = '800 23px Archivo, system-ui, sans-serif';
    ctx.fillText(TEXT.share.cardFooter, rx, y + 486);
    ctx.font = '600 17px "Cormorant Garamond", Georgia, serif';
    spaced(ctx, 'MANGO-RUSH.START.NG', x + w - 44, y + 486, 3, 'right');
    return c;
  };

  const toBlob = (c) => new Promise((res, rej) => {
    try { c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned nothing'))), 'image/png'); } catch (e) { rej(e); }
  });
  try {
    return await toBlob(draw(true));
  } catch (e) {
    if (portrait) return toBlob(draw(false));   // a tainted canvas: draw again without the picture
    throw e;
  }
}

export async function shareScore({ summary, blob, url, dailyLabel }) {
  try {
    const text = fill(summary.mode === 'daily' ? TEXT.share.dailyMessage : TEXT.share.message, { score: num(summary.score), url, date: dailyLabel || '' });
    const file = new File([blob], 'mango-rush-score.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], text, title: TEXT.title });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';   // the user closed the sheet: nothing more to do
        /* any other failure: fall through to the download */
      }
    }
    let saved = false;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mango-rush-score.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      saved = true;
    } catch { saved = false; }
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
    if (saved) return copied ? 'downloaded' : 'saved';
    return copied ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}
