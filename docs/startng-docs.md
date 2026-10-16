# Build a game for start.ng

start.ng is a home for small browser games made by the community. Every game lives at its own address, like `yourgame.start.ng`, and every signed-in player brings their own start.ng character into every game.

This page is everything you need to build a start.ng game and put it live, by hand or with your AI. If you're using an AI, give it this page as plain text: **https://start.ng/docs.md**.

> **For AI assistants:** follow this page exactly. Build a static game, push it to a public GitHub repo, call `POST https://api.start.ng/games/check` and fix anything it reports, then call `POST https://api.start.ng/games/publish`, and show the human the `approve_url` from the reply if there is one. Everything you need is below.

## How it works

Your game is **frontend only**: HTML, CSS and JavaScript running in the player's browser. You don't need a server or a database, and you never handle passwords.

**start.ng is your backend.** It gives every game:

- **Players:** sign-in, a name and a character that looks the same in every game
- **A shared leaderboard,** with the columns you choose
- **Multiplayer rooms,** for games where players see each other live
- **Hosting** at `<name>.start.ng`, kept up to date with your GitHub repo

Your game talks to start.ng in one of two ways. Use whichever suits you; they share the same accounts and leaderboards.

| | The connect page | The HTTP API |
| --- | --- | --- |
| How | `postMessage` to a hidden `https://start.ng/connect` frame | `fetch` to `https://api.start.ng` with a **game session** |
| Sign-in | Already signed in on start.ng? Your game knows straight away | The player goes to start.ng once and comes back with a session |
| Gives you | The player and their face picture, scores, leaderboard, multiplayer tickets | The player, scores, leaderboard |
| See | [Talk to start.ng](#talk-to-start-ng) | [The HTTP API: game sessions](#the-http-api-game-sessions) |

Your game's name is its address: `relic-hunter.start.ng` is the game `relic-hunter`.

## What a start.ng game is

- **A static website:** HTML, CSS, JavaScript, images, sounds and fonts. It runs entirely in the browser; there's no server code.
- **In a public GitHub repo,** with a ready-to-play `index.html` either at the top of the repo or in `dist/`, `build/`, `docs/` or `out/` (start.ng looks in that order).
- **Already built.** start.ng never runs your code or installs packages (no `npm install`, no `npm run build`). If you use Vite, React or similar, build it and commit the built folder (for example `dist/`). A source `index.html` that loads `/src/main.ts` is refused with "needs building first".
- **No secrets.** Everything in your game is public. Never put API keys or passwords in it.
- **Any game engine works,** as long as the result is static files: plain JavaScript, canvas, three.js, Phaser, PixiJS, Babylon.js and so on.

### Rules for the files

| Rule | Detail |
| --- | --- |
| Served file types | `html htm css js mjs json map txt svg png jpg jpeg gif webp avif ico woff woff2 ttf otf mp3 ogg wav mp4 webm wasm`. Other files are skipped (and listed in the reply) |
| Size | Up to 2,000 files and 100 MB in total, 25 MB per file |
| Left out | Hidden files and folders (`.git`, `.env`…), `node_modules`, links |
| Paths | Use **relative** paths (`./game.js`, `assets/hero.png`, not `/assets/hero.png`) so the game works anywhere |
| Extra pages | Link to them with a trailing slash: `help/`, not `help` |
| Safety | Files are checked against known malware patterns before they go live |

### The name and address

Your game plays at `<name>.start.ng`. The name comes from `name` in the publish request, or from the repo name if you leave it out. It's turned into lowercase letters, numbers and hyphens (`Tower Stack` becomes `tower-stack`), at most 40 characters. `api`, `auth`, `login`, `www` and `3rdmainland` can't be used. The first person to put a name live owns it.

## Put your game live

Games go live through the API: one request with your repo link. No key or account is needed, so it works the same by hand, from a script, or from your AI. The game goes live at `<name>.start.ng` and on the start.ng homepage.

Uploading from **Your games** on your start.ng profile is switched off for now. That's still where you manage your games: see them, change their cover, or click **Remove** to take one down.

### With the API

```
POST https://api.start.ng/games/publish
Content-Type: application/json

{ "repo_url": "https://github.com/you/tower-stack", "name": "tower-stack" }
```

| Field | Required | Meaning |
| --- | --- | --- |
| `repo_url` | Yes | A **public** GitHub repo: `https://github.com/<owner>/<repo>`, optionally `/tree/<branch>` |
| `name` | No | The game's name and address. Defaults to the repo name |
| `branch` | No | Which branch to publish. Defaults to the repo's main branch |

What happens next depends on whether the repo is already live.

### A new game: approve it once

The first time you publish a repo, start.ng downloads it, checks it, and replies **202** with an approve link:

```json
{
  "status": "pending",
  "name": "tower-stack",
  "repo_url": "https://github.com/you/tower-stack",
  "approve_url": "https://start.ng/approve/7Q4K9XPA2M3b",
  "expires_at": "2026-11-14T10:00:00Z",
  "folder": "dist",
  "files": 14,
  "size_bytes": 812345,
  "skipped": ["README.md"],
  "message": "Checked and ready. Open https://start.ng/approve/7Q4K9XPA2M3b to sign in with start.ng and put it live on your account. ..."
}
```

**Open `approve_url`** (AI assistants: show it to the human and ask them to open it). It signs you in to start.ng, which creates your account if you're new, and asks "Put tower-stack live?". Say yes and it's live at `https://tower-stack.start.ng` on your account. That repo is now linked to your account for good.

- The link works **once** and lasts **30 days**. If it runs out, publish again for a new one.
- Problems with the game come back **before** the link, so you never approve something that doesn't work (see [Checks before anything goes live](#checks-before-anything-goes-live)).
- New games published without signing in are limited to 20 an hour per address.

Signed-in requests (`Authorization: Bearer <start.ng token>`, as the start.ng website sends) skip the approve step and go live on that account straight away.

### An approved game: publishing again updates it

Publishing a repo that's already live updates the game immediately, on its owner's account, with no link. The reply is **200**:

```json
{
  "name": "tower-stack",
  "url": "https://tower-stack.start.ng",
  "repo_url": "https://github.com/you/tower-stack",
  "created": false,
  "folder": "dist",
  "files": 15,
  "size_bytes": 830112,
  "skipped": []
}
```

A repo can only update the game it's linked to; asking for a different `name` gives **409**.

### Updates: just push

However you put your game live, **start.ng watches the branch it came from and updates the game by itself after every push**, usually within a minute or two (games that haven't changed in a while are checked less often, up to once an hour). So the everyday loop is: change the game, push to GitHub. Done.

If a push doesn't publish (say `index.html` went missing), the game stays as it was until a push that works. Calling publish again updates it right away.

### A cover picture

Your game's card on start.ng shows a cover picture. Put **`cover.png`** (or `cover.jpg` / `cover.webp`) next to your `index.html` or at the top of your repo: start.ng picks it up automatically.

- **16:10**, at least **640 × 400** (1600 × 1000 looks sharp). Cards crop to 16:10.
- PNG, JPEG or WebP, under 2 MB.
- Make it look like the game, with its title on it. AI assistants: generate one, save it as `cover.png` next to `index.html`, and publish.
- Or upload one from **Your games** on your start.ng profile; that one wins over the repo's.
- Without one, the card shows the first letter of the game's name.

## Checks before anything goes live

Every time a game is published or updated (through the API, or by a push), start.ng downloads the repo and checks it **before** anything goes live. It reports **every** problem at once, so you can fix them in one go.

- **Errors** stop the game going live: it doesn't meet the rules above, or something in it could harm players.
- **Warnings** don't stop it, but are worth fixing. They come back in `warnings` when a game goes live.

To check a repo without publishing anything, call `POST https://api.start.ng/games/check` with the same body as publish. It replies **200** if the game would go live (with any `warnings`), or **422** with every problem. AI assistants: check first, fix what it finds, then publish.

```json
{
  "ok": false,
  "detail": "src/game.js looks like a crypto miner (and 1 more problem)",
  "errors": [
    { "code": "crypto_miner", "message": "src/game.js looks like a crypto miner", "file": "src/game.js" },
    { "code": "password_field", "message": "index.html asks for a password. Games never do: start.ng handles sign-in (see the docs, Sign in)", "file": "index.html" }
  ],
  "warnings": [
    { "code": "no_cover", "message": "No cover.png next to index.html, so your card shows a letter. Add a 16:10 picture", "file": null }
  ]
}
```

Every refusal from publish and check has this shape: `detail` for people, and `errors` and `warnings`, each with a `code` for scripts and AI tools, a `message`, and the `file` when there is one.

### Error codes

| Status | Code | When | What to do |
| --- | --- | --- | --- |
| 400 | `bad_link` | The link isn't a GitHub repo link | Use `https://github.com/<owner>/<repo>` |
| 400 | `bad_branch`, `bad_name`, `reserved_name` | The branch or name can't be used | Fix `branch` or `name` |
| 409 | `name_taken` | Someone else has that name | Pick another `name` |
| 409 | `repo_linked` | This repo is live under another name, or on another account | Leave out `name` to update the linked game |
| 422 | `repo_not_found` | The repo or branch doesn't exist, or isn't public | Make the repo public, check the branch |
| 422 | `no_index` | No `index.html` at the top or in `dist/`, `build/`, `docs/`, `out/` | Commit a ready-to-play `index.html` |
| 422 | `needs_build` | The `index.html` is source code that needs building | Build it and commit the built folder |
| 422 | `file_too_big`, `game_too_big`, `too_many_files`, `repo_too_big` | Over the size rules | Make it smaller |
| 422 | `malware` | A file matches a known malware pattern | Remove the file, and check your packages |
| 422 | `crypto_miner` | A file looks like a crypto miner | Remove it |
| 422 | `obfuscated_code` | A file runs code hidden in an encoded string, or is obfuscated so it can't be checked | Publish the readable code (normal minified builds are fine) |
| 422 | `password_field` | The game asks for a password | Remove it: start.ng handles sign-in |
| 422 | `redirect` | A page sends players to another site as soon as it opens | Remove the redirect |
| 422 | `hidden_program` | A file is really a program (for example an `.exe` renamed to `.png`), or carries one as text | Remove it |
| 429 | `rate_limited` | Too many new games or checks from your address | Try again in an hour |
| 502 / 503 | `download_failed`, `upload_failed`, `not_set_up` | GitHub or start.ng had a hiccup | Try again later |

### Warning codes

| Code | When |
| --- | --- |
| `external_script` | A script comes from a site other than start.ng or a well-known CDN (jsDelivr, unpkg, cdnjs, esm.sh…). Whatever is there runs in your game, so copy it into your repo |
| `insecure_link` | Something loads over `http://`, which browsers block on https sites |
| `leaves_start_ng` | The game sends players to another site |
| `no_cover` | No `cover.png` next to `index.html` |
| `no_start_ng_player` | The game doesn't ask start.ng who's playing (see the character rule) |

### When an update doesn't pass

If a push has errors, the game **stays on its last good version** and players notice nothing. The owner sees why on the game's card in **Your games** on their profile ("Your latest push didn't go live"), with every problem listed. Fix them and push again; the note goes away once a push goes live. If GitHub has a hiccup, start.ng simply tries the same push again on its next check.

## Players and their character

start.ng handles sign-in. Your game never sees passwords, emails or the player's start.ng sign-in. It either asks start.ng's connect page who's playing, or calls the API with a game session that only works for your game.

### Talk to start.ng

The connect page is a hidden page, `https://start.ng/connect`, that your game talks to with the browser's `postMessage`. It only answers games served from a `*.start.ng` address, which publishing does for you. Add this to your game once:

```js
// Talks to start.ng through its hidden connect page.
const START_NG = 'https://start.ng';
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

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
async function askStartNg(message, replyType, timeoutMs = 5000) {
  const el = await connectFrame();
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}
```

Always check `e.origin` like this: it's what makes the reply trustworthy.

### Who's playing

```js
const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
const player = reply?.user ?? reply?.guest; // signed in, or start.ng's guest
```

The reply:

```json
{
  "type": "startng:user",
  "user": {
    "id": 42,
    "name": "Runner Tee",
    "account": "Hamzat",
    "style": { "body": "female", "primaryColor": "#a55eea", "secondaryColor": "#0c6e5a", "skinColor": "#8d5524", "hairColor": "#17120f", "hair": "braids", "hat": "crown", "accessory": "earrings" },
    "face": "data:image/png;base64,iVBORw0KGgo..."
  },
  "guest": { "name": "Guest", "style": { "...": "start.ng's guest look" }, "face": "data:image/png;base64,..." }
}
```

| Field | Meaning |
| --- | --- |
| `user` | The signed-in player, or `null` for a guest |
| `user.id` | Their start.ng id |
| `user.name` | Their **character's** name: show this in your game |
| `user.account` | Their account name, for a small `@name` |
| `user.style` | How their character looks (below) |
| `user.face` | A picture of their character's face (PNG data URL), for a profile card |
| `guest` | start.ng's one guest look and face, so guests look the same in every game |

Ask again when the player comes back to your tab (`visibilitychange` and `focus`): they may have signed in or out on start.ng.

### Sign in

Send the player to start.ng with a link back to your game; it signs them in (and has them make a character if they're new) and sends them back:

```js
location.href = `https://start.ng/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
```

They come back with a game session in the address, `https://your-game.start.ng/#startng_session=eyJ...&expires_in=7200`. If you use the connect page you can ignore it (just ask `startng:whoami` again); if you use the HTTP API, keep it (next section).

The start.ng homepage asks signed-out players "sign in or play as a guest?" before opening a game. If they pick guest, your game opens with `?guest` in its address: skip your own sign-in question then.

### The HTTP API: game sessions

To call the API with `fetch`, your game needs a **game session**: a key start.ng gives your game after the player signs in. It only works for **your** game's player API, lasts **2 hours**, and is never the player's password or real sign-in.

Read it once when your game loads, keep it, and clean the address:

```js
const params = new URLSearchParams(location.hash.slice(1));
if (params.get('startng_session')) {
  sessionStorage.setItem('startng_session', params.get('startng_session'));
  history.replaceState(null, '', location.pathname + location.search); // remove it from the address bar
}
const session = sessionStorage.getItem('startng_session'); // null = not signed in
```

Send it as a header: `Authorization: Bearer <session>`. If it has expired, the API answers **401**: send the player through [Sign in](#sign-in) again.

Who is playing:

```
GET https://api.start.ng/games/{game}/player
Authorization: Bearer <session>
```

```json
{ "id": 7, "name": "Trini", "style": { "body": "female", "primaryColor": "#4b7bec", "secondaryColor": "#2b2f4a", "skinColor": "#8d5524", "hairColor": "#17120f", "hair": "braids", "hat": "none", "accessory": "backpack" } }
```

`style` is the player's start.ng character (`null` if they haven't made one). It never includes the email.

### The character rule

**Every start.ng game shows the player's start.ng character.** That's what makes start.ng one place instead of many separate games.

- **Your game has a player character:** draw it from `style`, so it looks like it does on start.ng. Your art style can differ (pixel art, low-poly…), but keep the body, colours, hair, hat and accessory recognisable.
- **Your game has no character** (cards, puzzles, quizzes, strategy…): show a **profile card** at the top of the screen: the `face` picture, the character `name`, and `@account`. Style it to fit your game.
- **Guests:** use `guest` (the default look, named "Guest"), and offer a sign-in button.

Working examples: [Lane Dash](https://github.com/Blackburn0/HNG-Game) (a runner that dresses as your character) and [the Hangout](https://github.com/Blackburn0/startng-hangout) (start.ng's 3D park, where your full character walks around).

### Character style fields

| Field | Values |
| --- | --- |
| `body` | `female`, `male` |
| `primaryColor` | The top, `#rrggbb` |
| `secondaryColor` | Trousers or skirt, `#rrggbb` |
| `skinColor` | `#rrggbb` |
| `hairColor` | `#rrggbb` |
| `hair` | `short`, `afro`, `braids`, `bun`, `ponytail`, `dreads`, `bald` |
| `hat` | `none`, `cap`, `beanie`, `tophat`, `crown` |
| `accessory` | `none`, `glasses`, `earrings`, `beard`, `scarf`, `backpack` |

Fall back to something sensible for any missing or unknown value: start.ng may add more options later.

### A profile card, for games without a character

```html
<div class="startng-card" id="player-card" hidden>
  <img id="player-face" alt="">
  <div>
    <b id="player-name"></b>
    <span id="player-account"></span>
  </div>
  <button id="player-sign-in" hidden>Sign in</button>
</div>

<style>
  .startng-card { position: fixed; top: 16px; left: 16px; display: flex; align-items: center; gap: 12px;
    padding: 8px 16px 8px 8px; border-radius: 999px; background: #292a23; color: #fffefa; font-family: sans-serif; }
  .startng-card img { width: 48px; height: 48px; border-radius: 50%; background: #d8fd71; }
  .startng-card b { display: block; font-size: 16px; }
  .startng-card span { font-size: 12px; opacity: .7; }
  .startng-card button { margin-left: 8px; border: 0; border-radius: 999px; padding: 6px 12px; background: #d8fd71; font-weight: 700; cursor: pointer; }
</style>

<script type="module">
  // askStartNg is the helper from "Talk to start.ng".
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  const player = reply?.user ?? reply?.guest;
  if (player) {
    document.getElementById('player-face').src = player.face;
    document.getElementById('player-name').textContent = player.name;
    document.getElementById('player-account').textContent = reply.user?.account ? `@${reply.user.account}` : 'Not signed in';
    document.getElementById('player-sign-in').hidden = !!reply.user;
    document.getElementById('player-sign-in').onclick = () =>
      (location.href = `https://start.ng/?return_to=${encodeURIComponent(location.origin + location.pathname)}`);
    document.getElementById('player-card').hidden = false;
  }
</script>
```

## Leaderboards

**Leaderboards are optional.** Each game's board keeps every signed-in player's **best run**. There are two kinds:

- **A plain score:** send one whole number, `score`. Highest wins. Nothing to set up.
- **Your own columns:** waves and kills, gems and time, coins and distance, whatever fits your game. Describe them in `startng.json`.

A game that has never saved a score and has no `startng.json` has no leaderboard. Once it has one, its card on start.ng gets a **Leaderboard** button showing your columns.

### Your own columns: `startng.json`

Add a file called **`startng.json`** next to your `index.html` (or at the top of your repo):

```json
{
  "leaderboard": {
    "stats": [
      { "key": "waves", "label": "Waves survived", "order": "highest" },
      { "key": "kills", "label": "Enemies killed", "order": "highest" }
    ]
  }
}
```

| Field | Meaning |
| --- | --- |
| `key` | The name your game sends: lowercase letters, digits and `_`, starting with a letter, up to 24 characters |
| `label` | The column title players see, up to 30 characters |
| `order` | `"highest"` (default) or `"lowest"` wins, for example the fastest time |
| `format` | Optional: `"number"` (default) or `"time"` (send seconds, shown as `m:ss`) |

- **1 to 5 stats.** Players are ranked by the **first** stat; the next ones break ties, then whoever got there first.
- start.ng reads `startng.json` when the game is published (and on every update). If something's wrong in it, publishing tells you what to fix.

Examples:

| Game | `stats` |
| --- | --- |
| Wave shooter | `waves` (highest), `kills` (highest) |
| Runner | `distance` "Km run" (highest), `coins` (highest) |
| Race or escape | `gems` (highest), `time` (lowest, `"format": "time"`) |

### Save a run

Signed-in players only. Send **exactly** the stats in your `startng.json` (or a plain `score` if you don't have one), each a **whole number** from 0 to 1,000,000,000. Anything else is refused.

With the connect page:

```js
// With startng.json:
const saved = await askStartNg({ type: 'startng:score', stats: { waves: 5, kills: 10 } }, 'startng:scoreSaved');
// Or a plain score:
const saved = await askStartNg({ type: 'startng:score', score: 1240 }, 'startng:scoreSaved');
// { ok: true, result: { best: 5, improved: true, rank: 3, stats: { waves: 5, kills: 10 } } }
// or { ok: false, error: "Sign in to save your score" }
```

With the HTTP API:

```
POST https://api.start.ng/games/{game}/scores
Authorization: Bearer <session>
Content-Type: application/json

{ "stats": { "waves": 5, "kills": 10 } }
```

```json
{ "best": 5, "improved": true, "rank": 3, "stats": { "waves": 5, "kills": 10 } }
```

Only the player's **best run** is kept: `improved` tells you whether this one beat it, and `stats` is their best run. `best` is its first stat.

### Read the board

Works for everyone, guests included. `limit` is 1 to 50 (default 10).

```js
const board = await askStartNg({ type: 'startng:leaderboard', limit: 10 }, 'startng:leaderboardData');
// { ok: true, entries: [...] }
```

```
GET https://api.start.ng/games/{game}/leaderboard?limit=10
```

```json
[ { "rank": 1, "player_id": 7, "name": "Trini", "color": "#4b7bec", "score": 8, "stats": { "waves": 8, "kills": 2 } } ]
```

- Highlight the player's own row by comparing `player_id` with their `id`.
- start.ng works out which game a score belongs to from your game's address (or its session), so a game can only save its own scores.
- Guests can see the leaderboard but can't save. Invite them to sign in.

## Multiplayer

For games where players see each other live, like the Hangout. This uses the connect page.

1. Get a one-minute ticket: `askStartNg({ type: 'startng:ticket' }, 'startng:ticketData')` → `{ ok, ticket, url }` (signed-in players only).
2. Open a WebSocket to `url` with `?ticket=` and the ticket added (URL-encoded), within a minute.
3. Exchange JSON messages:

| Direction | Message |
| --- | --- |
| You send | `{ "type": "move", "x", "z", "ry", "moving" }` (up to about 25 a second), `{ "type": "wave" }` (once a second at most) |
| You get first | `{ "type": "welcome", "you", "players": [...], "seats": [...] }` |
| You get after | `join`, `move`, `wave` and `leave` from everyone else |

Players are `{ id, name, style, seat, x, z, ry, moving }`, with names and looks from start.ng, so nobody can pretend to be someone else. Positions stay within ±60 metres. If the connection closes with code `4401`, the player needs to sign in; `4403`, the room is full; `4409`, they joined from another tab. Up to 50 players share a room. See [the Hangout](https://github.com/Blackburn0/startng-hangout) for a full example.

## API reference

Base URL: `https://api.start.ng`. Games on `*.start.ng` can call it straight from the browser.

| Endpoint | Sign-in | What it does |
| --- | --- | --- |
| `POST /games/publish` | None (or a start.ng sign-in) | Put a game live or update it. See [With the API](#with-the-api) |
| `POST /games/check` | None | Every check publishing does, without publishing. See [Checks before anything goes live](#checks-before-anything-goes-live) |
| `GET /games/publish/{code}` | None | What's waiting at an approve link |
| `GET /games` | None | Every live game: `[{ name, url, repo_url, by, updated_at, cover_url, leaderboard }]`. `leaderboard` is its columns, or `null` |
| `GET /games/{game}/player` | Game session | Who's playing: `{ id, name, style }` |
| `POST /games/{game}/scores` | Game session | Save a run: `{ "stats": {...} }` or `{ "score": n }` |
| `GET /games/{game}/leaderboard?limit=10` | None | The top players |
| `DELETE /games/{game}/scores/{player_id}` | The owner's start.ng sign-in | Remove a bad score |

| Status | Meaning |
| --- | --- |
| 401 | No session, it expired, or it's for another game: sign the player in again |
| 404 | No game with that name |
| 422 | A bad run: a stat missing or extra, not a whole number, below 0 or too big |

## Full example

A game using the HTTP API: a sign-in link, saving a run, and showing the board.

```html
<a id="signin" hidden>Sign in with start.ng to save your score</a>
<p id="message"></p>
<ol id="board"></ol>

<script type="module">
  const API = 'https://api.start.ng';
  const GAME = location.hostname.split('.')[0]; // "relic-hunter" on relic-hunter.start.ng

  // pick up the session after sign-in
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('startng_session')) {
    sessionStorage.setItem('startng_session', params.get('startng_session'));
    history.replaceState(null, '', location.pathname + location.search);
  }
  const session = sessionStorage.getItem('startng_session');
  const signin = document.getElementById('signin');
  signin.href = `https://start.ng/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
  signin.hidden = !!session;

  // call this when a round ends, with your startng.json stats, e.g. roundOver({ waves: 5, kills: 10 })
  window.roundOver = async (stats) => {
    if (session) {
      const res = await fetch(`${API}/games/${GAME}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
        body: JSON.stringify({ stats }),
      });
      const message = document.getElementById('message');
      if (res.ok) {
        const saved = await res.json();
        message.textContent = saved.improved ? `New best! You're #${saved.rank}` : `Not your best this time (#${saved.rank})`;
      } else if (res.status === 401) {
        sessionStorage.removeItem('startng_session');
        signin.hidden = false;
      }
    }
    const top = await fetch(`${API}/games/${GAME}/leaderboard?limit=10`).then((r) => r.json());
    const board = document.getElementById('board');
    board.replaceChildren(...top.map((e) => {
      const li = document.createElement('li');
      li.textContent = `#${e.rank} ${e.name}: ${e.stats.waves} waves, ${e.stats.kills} kills`;
      return li;
    }));
  };
</script>
```

## Good to know

- **Shared vs personal:** `localStorage` only lives in one browser, so other players never see what's in it. A personal best can live there, but anything other players should see must go to start.ng.
- **Cheating:** a browser game can never be fully cheat-proof. start.ng only accepts your declared numbers, within limits, from signed-in players. As the owner you can remove a bad score: `DELETE /games/{game}/scores/{player_id}` with your start.ng sign-in.
- **Testing:** sign-in, scores and multiplayer only work once your game is live at `your-game.start.ng`. Opened as a local file there's no player, so make sure your game still plays without one.
- **Privacy:** your game never sees the player's email or real sign-in. A game session only works for your game.

## Checklist before you publish

1. A built `index.html` is committed, at the top of the repo or in `dist/`, `build/`, `docs/` or `out/`, and runs without a build step.
2. Paths are relative, every file type you need is on the served list, and there are no secrets.
3. The game finds out who's playing (`startng:whoami`, checking `e.origin`; or `GET /games/{game}/player` with a session).
4. It shows the player's start.ng character, or a profile card if the game has no character.
5. Guests see the guest look and a way to sign in.
6. Want a leaderboard? A `startng.json` if you want your own columns, then save runs and read the board through start.ng.
7. There's a `cover.png` (16:10) next to `index.html`.
8. The repo is public on GitHub and pushed.
9. `POST /games/check` passes with no errors (and you've looked at the warnings).
10. Publish with the API and open the `approve_url` the first time. After that, pushing to the branch is enough.