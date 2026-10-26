# Step 13: Release

Owner feedback on step 12: polish is done, the start.ng check on the beta is clean (zero errors, zero warnings), and the
owner has checked the cover and played a first run in a private window on laptop and phone. This step puts version 1
live at https://mango-rush.start.ng. **No new features and no gameplay changes.**

**Who does what.** You prepare and check everything on `v1`. **The owner runs every push** and the merge into `main`
himself (the commands are in part B). This step is the only one that lets `main` change, and only by a fast-forward to
`v1`. You still never push `main` yourself.

## Decisions already made (owner, 26 Oct)
- **Fast-forward, nothing removed.** `main` (`8c21fe9`) is the merge base of `v1`, so `main` moves straight to `v1` with
  `--ff-only`: no merge commit and no conflicts. `docs/` and `tests/` **stay**. `main` already has them, start.ng doesn't
  serve `docs/`, and the check passes with them included. (This replaces the old roadmap line "without `docs/`, `tests/`".)
- **Old scores:** the start.ng leaderboard keeps every player's best from the old version. That is accepted, and we
  delete nothing on start.ng.
- **Local bests reset:** the scoring rules changed after the live version (the Big One bonus, the Madness storm,
  showers, bats, new medal thresholds). `store.js` already says to raise `SCORE_VERSION` when the rules change, so
  raise it to **3**. A returning player's local best and daily best start fresh. The other saved data stays (settings,
  `warmupDone`, totals). A returning player still gets the warm-up if they never finished it.
- **`startng.json` does not change** (same stats, same order), so the leaderboard keeps working.

## Part A: prepare (you, on `v1`)
1. **Start clean.** `git status` is clean, `v1` is at `773accb` or later, and `git merge-base main v1` is `8c21fe9`
   (fetch first). If anything differs, stop and tell the owner.
2. **Security scan.** Teammates' repos were hit by a malware dropper this week, so check before going live. Report each
   item as clean, or list what you found:
   - no `api.js` and no `package.json` anywhere in the repo;
   - no `eval(`, `new Function`, `atob(`, `fromCharCode`, `createRequire`, `child_process` or `require(` in `js/`, `index.html` or
     `css/` (`tests/` may use Node built-ins; list what they import);
   - no line in any file longer than 400 characters, and no run of 20 or more tabs or spaces inside a line (that is
     how the dropper hides code). Skip binary files and the mockup PNGs;
   - every outside URL in `js/`, `index.html` and `css/` is one allowed in `CLAUDE.md` (jsDelivr, Google Fonts,
     start.ng, the X intent link);
   - `git log --format='%h %an <%ae> | %cn | %cd' 8c21fe9..v1` lists only the owner's commits, all at `+0100`. Flag
     any other name, email or timezone.
   If anything fails, **stop** and report it. Don't fix it silently.
3. **`SCORE_VERSION` 2 → 3** in `js/core/store.js`. Add a line to the header comment: "3 (step 13): v1's rules
   (happenings, Madness storm, Big One bonus, new medals)". Add a node test (or extend an existing one) for both cases:
   saved data with `scoreVersion: 2` loads with best 0 and daily best 0 but keeps settings and `warmupDone`, and saved
   data with `scoreVersion: 3` keeps its best.
4. **Docs.**
   - `CLAUDE.md` → "Where things are": `main` is now **version 1, live**. Future work goes on a branch, is tested on the
     beta first, and reaches `main` only when a step brief says so.
   - `docs/ROADMAP.md`: mark step 13 done once the owner confirms it's live. Add a short "After version 1" note: future
     changes follow the same beta-first flow.
   - `README.md`: check that the live URL, controls and credits are right. Add "Version 1 · October 2026".
5. **Tests.** Every node test in `tests/` prints `0 failed`. Run the game locally once: no console errors apart from the
   expected start.ng ones, and the countdown, a run and game over all work.
6. **Commit** on `v1`: `step 13: release prep`, with **no Co-Authored-By line**. Then give the owner the part B commands
   and wait.

## Part B: release (the owner runs these, in order, in PowerShell)
```
git push origin v1
git push beta v1:main
```
Wait about a minute, then (you) run the start.ng check on `TwajiesHub/mango-rush-beta` again: zero errors and zero
warnings. Then the owner releases:
```
git checkout main
git pull origin main
git merge --ff-only v1
git push origin main
git checkout v1
```
If `--ff-only` refuses, stop: `main` has changed since `8c21fe9`. Tell the planner and don't force anything.
start.ng redeploys `main` by itself. If https://mango-rush.start.ng still shows the old game after about 5 minutes, the
owner runs the publish block for the live game (it updates at once and replies `created : False`):
```
$body = '{"repo_url":"https://github.com/TwajiesHub/mango-rush","name":"mango-rush"}'
try { Invoke-RestMethod -Method Post -Uri "https://api.start.ng/games/publish" -ContentType "application/json" -Body $body } catch { $_.ErrorDetails.Message }
```
Then reload with `?v=13` to skip the browser's saved copy.

## Part C: after it's live
1. (You) run `POST https://api.start.ng/games/check` on `TwajiesHub/mango-rush`: zero errors and zero warnings.
2. (Owner) open https://mango-rush.start.ng in a normal window (a returning player: the local best should now be 0,
   the settings kept) and in a private window (a new player: the warm-up, then the countdown). Play one run signed in
   and check the score appears on the start.ng leaderboard. Do it on laptop and phone.
3. (Owner) tag the release:
   ```
   git tag -a v1.0 -m "Mango Rush version 1"
   git push origin v1.0
   ```
4. (You) after the owner confirms, mark step 13 done in `docs/ROADMAP.md` and commit `docs: version 1 is live` on `v1`.
   The owner pushes it to `v1`, `beta` and `main` the same way as in part B.

## If something goes badly wrong after release (emergency only)
Put the old version back. Only the owner does this, and only after telling the planner. `<release>` is the commit `main`
was pushed to in part B:
```
git push --force-with-lease=main:<release> origin 8c21fe9:main
```
start.ng redeploys the old version. Fix on `v1`, test on the beta, and release again.

## Out of scope
- Any gameplay, look or sound change; new features; a version 1.1 plan.
- Deleting or changing scores on start.ng.

## Done when
- [ ] Security scan clean (or every finding reported and resolved with the owner).
- [ ] `SCORE_VERSION` is 3, with its test; all tests pass.
- [ ] `CLAUDE.md`, `README.md` and `ROADMAP.md` updated; `step 13: release prep` committed with no Co-Authored-By line.
- [ ] Beta check clean after the final push.
- [ ] `main` fast-forwarded to `v1` by the owner; https://mango-rush.start.ng shows version 1.
- [ ] The check on `TwajiesHub/mango-rush` is clean; the owner's live test passes; `v1.0` is tagged.

## Report (in chat, under 20 lines)
1. The security scan result, item by item.
2. What changed in part A, file by file.
3. The part B commands for the owner (before he releases).
4. After release: the live check result and anything the owner's test turned up.
