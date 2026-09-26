# ZRace UX and Lightweight Graphics Improvement Plan

## Review summary

The current game has a confident visual identity: dark studio presentation, mint accent colour, clear car silhouettes, and a detailed player vehicle that looks good in motion. The race scene is readable at a glance, with a useful minimap, timing tower, speed display, and distinct circuit theming.

The biggest opportunities are not extra geometry or bigger textures. They are stronger information hierarchy, more purposeful use of the large menu canvas, and race feedback that makes speed, braking, track position, and mistakes easier to understand instantly.

### Observed strengths

- The title screen establishes the game and selected car well with a restrained palette.
- Car selection communicates the fleet, car identity, performance, and paints without a loading-heavy comparison screen.
- Circuit cards give a useful preview of layout, country, length, corner count, and character.
- The player scan makes the car feel premium; the surrounding world remains appropriately low-poly for browser performance.
- HUD elements are placed at familiar corners and do not obstruct the road centre.

### Observed friction

- Car and circuit screens leave a very large, mostly empty upper area while important selectable content sits at the edges or bottom of the viewport.
- On car selection, the left list has low-contrast secondary text and can extend below the viewport; the active selection is easy to miss at speed.
- On circuit selection, five cards compete for attention and their descriptive copy becomes small. Race settings at the very bottom are visually detached from the selected circuit and Start Race action.
- During a race, timing and tower text are faint against changing scenery. The player’s next-driving decision (brake, turn, or boost) is not surfaced strongly enough.
- The detailed player car and low-poly environment are a reasonable performance tradeoff, but the different visual densities are especially noticeable at the pit straight and near grandstands.

## Product guardrails

- Keep the game dependency-free and retain its procedural/canvas-first asset strategy.
- Do not add full-screen SSAO, screen-space reflections, dynamic shadows for every object, or high-resolution track textures.
- Preserve the current player-only detailed car default and optional glow / detailed-rival settings.
- Make quality adaptive: retain a stable frame rate before enabling visual flourishes.

## Priority plan

### P0 — improve clarity with almost no rendering cost

| Improvement | Experience outcome | Lightweight implementation |
| --- | --- | --- |
| Make the selected car/card unmistakable | Faster decision-making in both pickers | Add a 2–3 px mint edge, stronger surface tint, and a small `SELECTED` label; dim unselected cards slightly. CSS only. |
| Rebalance menu layout | Removes the empty upper half and reduces eye travel | Put selection content inside a responsive max-height panel; shift the turntable/car upward behind or between content zones. Keep the canvas scene unchanged. |
| Couple circuit choice, settings, and start action | Makes the race setup feel like one decision | Place laps, opponents, difficulty, and a short “race summary” beside/below the selected circuit; keep a sticky Start Race button on narrow screens. HTML/CSS/UI only. |
| Raise HUD contrast selectively | Lets players scan state without stopping watching the road | Put lap/position, timing, and tower on a subtle gradient chip with stronger text shadow; retain transparent backgrounds elsewhere. |
| Give actions stateful feedback | Confirms inputs and teaches systems | Brief text/colour confirmation for camera, rejoin, boost unavailable, and pause. Reuse existing centre-message element and CSS transitions. |
| Add a first-race control prompt | Lowers keyboard onboarding friction | Show a dismissible 4-second overlay: `W accelerate · A/D steer · Shift boost · C camera`. Store dismissal locally. No runtime scene cost. |

**Acceptance checks:** all primary text remains legible over the lightest/darkest scene areas; selected item is identifiable within one glance; Start Race and active settings are visible together at 1280×720 and common mobile widths.

### P1 — make the driving experience more legible

| Improvement | Experience outcome | Lightweight implementation |
| --- | --- | --- |
| Add a braking/turn-in cue | Helps new players learn circuits without a racing line painted on the track | Use path distance and the existing AI speed profile to show a small HUD chevron: `BRAKE` / `TURN LEFT` / `TURN RIGHT`, fading beyond a configurable distance. No new 3D objects. |
| Upgrade the minimap's information hierarchy | Better spatial awareness | Draw start/finish, player heading, nearest rival, and the next corner marker on the existing 2D canvas. Avoid a larger map or DOM updates each frame. |
| Improve boost readability | Makes boost a tactical resource rather than a hidden meter | Add a high-contrast “ready” state and a short pulse at full charge; make the drain/refill direction visually obvious. Existing canvas/CSS assets only. |
| Provide concise off-track feedback | Reduces frustration after an error | Show `OFF TRACK`, then a subtle rejoin direction/distance after a short delay. Use the existing track projection data, not physics changes. |
| Clarify race start | Builds anticipation and avoids false starts | Increase light size/contrast and show a one-line “hold throttle” prompt before lights out. These are existing overlay elements, not post-processing. |
| Make camera choice self-explanatory | Encourages use of the three views | Show a compact `CHASE / CLOSE / BONNET` label for 1.5 seconds after `C`; optionally remember preferred view. |

**Acceptance checks:** a first-time player can identify why they lost time (late brake, off track, unavailable boost) without pausing; advanced players can disable driving cues in Options.

### P2 — add visual richness via cheap, reusable detail

| Improvement | Experience outcome | Lightweight implementation |
| --- | --- | --- |
| Trackside palette pass per circuit | Makes circuits feel more distinct while preserving the stylized world | Change material colours, fog, sky gradient, banners, and a small set of instanced props per circuit. Reuse existing procedural geometries. |
| Add sparse speed markers and corner boards | Improves both authenticity and braking readability | Build a few shared sign meshes/textures once; instance them along high-value braking zones only. |
| Improve road/kerb definition | Adds depth at high speed | Blend inexpensive vertex colour variation and existing canvas texture detail; avoid additional material passes. |
| Use intermittent crowd and pit animation | Makes venues feel alive without simulation cost | Animate only a few shaderless emissive/colour groups or sprite-like panels at low frequency; keep the dense crowd static. |
| Refine the showroom floor | Makes menus feel intentional after layout changes | Add a softly animated ring-light reflection or moving light sweep limited to the menu scene; turn it off under reduced motion. |

**Acceptance checks:** no material type or render pass is added to every visible track object; circuit differences are recognizable from a screenshot without relying on text.

### P3 — performance resilience and accessibility

1. Add a `Visual quality` setting: `Auto`, `Performance`, and `Quality`. Auto should start conservatively, sample frame time after the first race start, and only step quality down/up between races or in pause—not every frame.
2. In Performance mode: cap renderer pixel ratio at 1–1.25, disable glow, use procedural player car if scan loading is slow, reduce scenery/prop density, and keep rival scans off.
3. In Quality mode: keep today’s 2× device-pixel cap, optional glow, and the current player scan. Do not enable expensive effects automatically merely because the device reports a high DPI display.
4. Respect `prefers-reduced-motion` beyond boost streaks: disable showroom sweeps, selection pulses, and other nonessential motion.
5. Add colour-independent states for selected cards, boost-ready, warning messages, and player position (border/icon/text as well as mint colour).
6. Test keyboard focus order and visible focus rings through every menu; ensure the racing canvas cannot trap focus after a race ends.

## Delivery sequence

1. **Menu and HUD clarity (P0):** lowest risk, highest impact, no new rendering budget.
2. **Driving feedback (P1):** use existing path, UI canvas, and race-state data; introduce each cue behind a setting if it changes challenge perception.
3. **Circuit art direction (P2):** ship one representative circuit first, measure, then roll the approach across all five.
4. **Quality ladder (P3):** implement before any optional visual effect that could increase GPU cost.

## Performance budget and verification

- Establish a baseline on a mid-range integrated GPU at 1280×720 and 1920×1080, with five opponents and each current option combination.
- Target stable 60 FPS at 720p in Performance/Auto and avoid frame-time spikes above 33 ms during race start, boost, collision, and camera changes.
- Use frame time (not only average FPS) and monitor renderer draw calls, triangles, texture memory, and scene build/loading time.
- Test a desktop high-DPI display and a touch-sized viewport. Confirm HUD does not overlap touch controls, selection cards remain reachable, and buttons remain at least 44 CSS px tall.
- Compare before/after screenshots for title, car select, circuit select, bright daytime circuit, dark/dusk circuit, boost, pause, and results states.

## Suggested success measures

- More players reach the grid after opening the game (title-to-race conversion).
- Fewer immediate restarts or pauses in the first lap.
- Players change camera/boost usage at least once in early races, indicating those systems are discoverable.
- No regression in median frame time on the baseline machine, and Performance mode is visibly smoother on lower-end hardware.
