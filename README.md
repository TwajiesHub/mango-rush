# Mango Rush

A three.js game for [start.ng](https://start.ng). Mangoes fall from the sky: catch them, dodge the coconuts, chain catches for a combo. Golden mangoes are worth 5.

**You play as your own start.ng character.**

## How it uses start.ng

- Follows https://start.ng/docs.md: on load it asks start.ng's connect page who is playing (`startng:whoami`, checking the message origin), and falls back to `GET https://api.start.ng/auth/me`.
- Signed-in players' runs go to the start.ng leaderboard (columns in `startng.json`: score, survived, mangoes).
- It reads `character.name` and `character.style` (`primaryColor`, `secondaryColor`, `skinColor`, `hairColor`, `body`, `hair`, `hat`, `accessory`) and builds the 3D player from them (`js/character.js`).
  - Top uses `primaryColor`, bottoms use `secondaryColor`.
  - Skin, hair style and hair colour, body (male/female), hat (cap, beanie, top hat, crown) and extra (beard, glasses, scarf, backpack) all change the model.
  - The scarf and backpack colours are derived from your own palette.
- If you change your look on start.ng and come back to the tab, the game fetches it again and rebuilds your character.
- If you're not signed in, you play as a guest, with a link to sign in.
- Your best score is saved per start.ng user in the browser.

## Controls

- WASD or arrow keys to move, Space to dash.
- On mobile, drag anywhere to move and tap **Dash** to dash.

## Files

```
index.html       page + UI
style.css        UI styling
js/main.js       scene, game loop, spawning, scoring
js/character.js  builds the character from the start.ng style
js/startng.js    start.ng API (auth/me)
```

No build step: three.js loads from the jsDelivr CDN through an import map. To run it locally, use any static server, for example `npx serve .`. You'll play as a guest locally, because the start.ng cookie only exists on start.ng.
