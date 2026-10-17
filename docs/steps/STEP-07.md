# Step 7: Thrill pass A (danger)

Owner feedback: with dash, carving and Swoop chains the game has no thrill; danger is too low and starts too slowly.
Do NOT weaken the player's powers; raise the danger. Keep the camera, visuals, pot, skills and journey as they are.

1. **Thrilling from the start:** compress the difficulty curve in `CONFIG.difficulty`.
   - After a 5 s gentle ramp-in, the run starts at today's 60 s values.
   - It reaches today's 150 s values by 90 s and today's 240 s values by 150 s.
   - Breathers shrink to 3 s. Keep the early golden mango (8-14 s).
2. **Lead-aiming:** 35% of coconuts are aimed at the player, from the start. Half of the aimed ones lead the player:
   target = position + velocity x 0.5 s, clamped inside the walkable ellipse. Rings stay honest.
3. **Patterns at every wave peak from 20 s**, using normal coconuts, warning >= 0.9 s, honest rings:
   - LINE: 4-5 coconuts in a row across the player's path.
   - CAGE: 6 around the player at radius ~2.2 with ONE gap of at least 1.6 units (the dash is the answer).
   - SWEEP: a wall of 5 across the deck landing in sequence 0.15 s apart.
   Pattern type and gap direction come from the run rng with a fixed number of draws per event (Daily Run identical for
   everyone). Respect the mercy window (no pattern within 1.5 s of a hit).
4. **Golden mango = double danger:** from a golden mango's spawn until it is caught or rots, coconuts spawn twice as
   often, and half of them land within 2.5 units of the golden mango's spot. Its ring pulses red-gold as a "hot" tell.
   This applies to the early golden too.
5. **Keep:** lock >= 0.35 s, max one late-lock, first appearances alone, budget <= 110 draw calls, all node tests
   passing, Daily Run identical across two runs (check the first-20 logs).
6. Keep the report SHORT (under 20 lines): what changed, one bot run at reaction 0.5 only (survival and hits per minute
   vs before), anything you couldn't do. Commit on v1 as "step 07: thrill pass A".
