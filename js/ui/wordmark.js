// Mango Rush — the custom wordmark as an inline SVG string.   OWNER: Claude Code  ·  STATUS: done
// Usage: el.innerHTML = wordmarkSVG();   Size it with CSS (width); the viewBox keeps the shape (500 x 224).

export function wordmarkSVG({ ink = 'var(--ink, #2B1A10)', accent = 'var(--saffron, #F2A93B)', label = 'Mango Rush' } = {}) {
  return `<svg class="wordmark" viewBox="0 0 500 224" role="img" aria-label="${label}">
  <g fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M8 92 V8 L44 60 L80 8 V92"/>
    <path transform="translate(102 0)" d="M8 92 V48 A36 36 0 0 1 80 48 V92 M8 66 H80"/>
    <path transform="translate(204 0)" d="M8 92 V8 L72 92 V8"/>
    <path transform="translate(298 0)" d="M76 23 A42 42 0 1 0 86 50 H50"/>
    <path transform="translate(0 124)" d="M8 92 V8 H46 A21 21 0 0 1 46 50 H8 M42 50 L80 92"/>
    <path transform="translate(100 124)" d="M8 8 V52 A36 36 0 0 0 80 52 V8"/>
    <path transform="translate(202 124)" d="M74 16 H32 A17 17 0 0 0 32 50 H48 A21 21 0 0 1 48 92 H6"/>
    <path transform="translate(296 124)" d="M8 8 V92 M72 8 V92 M8 50 H72"/>
  </g>
  <g transform="translate(406 0)">
    <circle cx="44" cy="50" r="42" fill="none" stroke="${accent}" stroke-width="11" stroke-linecap="round" stroke-dasharray="0 13.19"/>
    <circle cx="44" cy="50" r="25" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 11.22"/>
    <circle cx="44" cy="50" r="11" fill="${accent}"/>
  </g>
  <g transform="translate(448 176) rotate(-28)">
    <ellipse rx="27" ry="34" fill="${accent}"/>
    <ellipse cx="-9" cy="-10" rx="8" ry="12" fill="#FFF1D6" opacity="0.45"/>
    <path d="M2 -34 C10 -46 26 -48 34 -42 C24 -36 12 -34 2 -34 Z" fill="${ink}"/>
  </g>
</svg>`;
}
