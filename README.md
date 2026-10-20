# Apocalypse "What if" sims

Vertical (1080×1920, 60fps, 80s) first-person disaster simulations in the style of TikTok "what if" videos:
serif counter (left), italic narration (lower middle), opening title, one continuous POV shot that loops seamlessly (no end card),
calm → escalation → climax beats. Built with Three.js, rendered headlessly, soundtrack synthesized from the same timeline.

## Projects (each folder is self-contained)

| Folder | Video | Scene | Final upload file |
|---|---|---|---|
| `black-hole/` | What if a black hole passed by Earth? | Seaside city rooftop at dusk, ray-traced lensing + accretion disk | `out/black-hole_v4_1080x1920_60fps_tiktok.mp4` |
| `sun-vanishes/` | What if the Sun suddenly vanished? | Alpine lake village from a chalet balcony; pasture with picnic, kids, cows, hikers; paragliders, steamer, train; blackout ~10 s in; the grid fails in a sweep across the valley; star trails, freeze | `out/sun-vanishes_alpine_v4_1080x1920_60fps_tiktok.mp4` |
| `asteroid/` | What if a 1-mile asteroid hit the ocean? | Cycladic island bay from a clifftop terrace, steam column, drawback, 600 ft wave | `out/asteroid_island_v4_1080x1920_60fps_tiktok.mp4` |
| `earth-spins/` | What if Earth spun 17 times faster? | Singapore rooftop pool deck at golden hour; time-lapse sky (Sun streaking, star trails, Moon, Venus), days shrinking to minutes, the sea floods the avenue below, people bounce, then everything floats up (refracting water blobs from the pool) into a cloud | `out/earth-spins_v4_1080x1920_60fps_tiktok.mp4` |
| `speed-doubles/` | What if your speed doubled every 2 seconds? | Sprint down 42nd St at Manhattanhenge (crowds filming the Sun, stopped cabs, Times Square), sonic boom shatters the windows behind you, across the Hudson glowing white-hot; then a streak lapping Earth (NASA Blue Marble/Black Marble textures in `textures/`), light speed, the rings wrap and melt the planet, it breaks apart, laps of the Sun and the whole solar system into a ball of light | `out/speed-doubles_v4_1080x1920_60fps_tiktok.mp4` |
| `electrons/` | What if every electron disappeared? | Shibuya Crossing at noon (scramble crowd, giant screens, neon, Q-Front, 109); the electrons vanish: screens die, the sky goes black with stars, everything turns see-through (`xray.js` ghost materials, depth-free outlines), the nuclei push apart (sparks, swelling, white); Earth bursts at near light speed (NASA textures), the blast hits the Moon (1.28 s); the camera rides it to the Sun (8 min 19 s), Jupiter, Saturn and Neptune, each bursting in close-up (`solar.js`), then white | `out/electrons_v4_1080x1920_60fps_tiktok.mp4` |
| `moon-falls/` | What if the Moon fell to Earth? | Built on earth-spins (Singapore-style rooftop pool, night): the Moon falling from 20,000 miles (radial free fall, real angular size; `moon.js`), the sea floods the city, earthquakes, it breaks apart at the Roche limit (~11,500 mi): its crust splits into plates that carry the Moon's face (molten inside), then tumbles into rubble; rocks drop out of the cloud and hit closer and closer (`timeline.js` METEORS: beyond the horizon, the islands, the bay, the towers across the water, half a mile out) with fire/smoke columns, shockwave rings and flashes (`impacts.js`), towers burning and collapsing, islands blasted (`world.js`); the biggest piece hits the horizon, wall of fire, white (66 s) | `out/moon-falls_v4_1080x1920_60fps_tiktok.mp4` |
| `women-vanish/` | What if every woman disappeared? | Built on electrons' Shibuya Crossing, rebuilt at real proportions (scramble ~44 x 40 m). `people.js` plans every walker's whole path up front so nobody ever comes within 0.8 m of anyone (no per-frame pushing, so no jumping); women have long hair/skirts. At 0:02 the women vanish, what they carried drops, their cars creep into the cars ahead and a speeding car crashes into the queue (`traffic.js`); cutaways inside a hospital ward and a classroom (`interiors.js`); fires on the first night, crashed cars, the grid failing; then decades (population model in `timeline.js`: men by age, normal death rates, no births; last human ~2143): the city goes green (`G.uGreen`), windows break (`G.uDecay`), buildings collapse one after another in dust (`blocks.js` FALL, `smoke.js`); the last man dies on a bench at the crossing in 2143 (real time for 5 s, `V_LAST0`..`V_LAST1`); a turn up into the Sun, white | `out/women-vanish_v4_1080x1920_60fps_tiktok.mp4` |
| `yellowstone/` | What if Yellowstone erupted? | Built on sun-vanishes' alpine lake town (a low saddle in the ridge so the column shows), 60 miles south of the caldera. The eruption is in `sky.js`: a boiling column 97 km away and its umbrella cloud (physical: a ray hits its underside or sunlit side wall), which spreads until it covers the sky (`umbCover` in `timeline.js` dims the sun); lightning (`BOLTS`). The boom arrives 4.7 min later (time-lapse); ash falls (the old snow particles) and settles grey on roofs (`bend.js`); cars on the main street flee then stall (headlight glows); the nearest roofs cave in with dust; the grid fails; then the hot ash cloud (`flow.js`, ~900 sorted billboard puffs, red-hot base, steam on the lake) comes over the ridge at 300 mph in real time and the frame burns to white for the loop | `out/yellowstone_v4_1080x1920_60fps_tiktok.mp4` |
| `gravity-doubles/` | What if gravity doubled every 5 seconds? | A new scene: a riverside plaza at sunset (fountain, Ferris wheel, suspension bridge, skyline across the river, an airliner overhead). g = 2^((v + 2.5) / 5) on the video clock (`timeline.js`); every failure is placed at its g (people, birds, the plane, your grey-out and black-out at ~4x, the wheel, towers, bridge, your breath and heart, clouds raining out, rock flowing, the crust glowing). One vertex hook in `bend.js` crushes everything under a height cap (`softCap`/`rockCap`), rolls the ground in swells, and curls it into a ball when Earth caves in; after you die the view cranes up, then lifts away to see the glowing planet collapse (a black hole ~500 ft wide), white | `out/gravity-doubles_v4_1080x1920_60fps_tiktok.mp4` |
| `earth-stops/` | What if Earth stopped spinning? | A new scene: a downtown avenue on the equator at golden hour, seen from a footbridge over a crosswalk (crowd, cars at the red light, neon shop signs from a canvas atlas, an LED screen, rain trees on the median). The spin drops linearly from 1,037 mph to 0 in 64.5 s (`timeline.js`); the wind is the difference, and everything torn loose follows one closed-form drag law (`drift()` / `fly.js`): people, cars, lamps, signals, trees, signs, chunks; glass, litter, leaves and grit are GPU streaks (`streaks.js`). Each building has failure times from wind speed (`layout.js`): glass bursts, cladding peels (cells cut out in `facade.js`, the frame stays), collapse tipping east with dust (`buildings.js`). A gold wind stamp every 100 mph. The camera leaves the bridge at 20 s and flies up the avenue into the wind, rising to 92 m; the ocean's front (`ocean.js`) runs in from 9.7 miles and hits at 64 s; deep water, loop | `out/earth-stops_v4_1080x1920_60fps_tiktok.mp4` |
| `trillion-years/` | What if you lived 1 trillion years? | A new scene: a seaside promenade at 35° N at sunset, you at the railing, the sea and the sunset ahead, the shore and a city skyline running off to the right. Time speeds up 10x every 3.5 s (`timeline.js`: log10 of minutes = v / 3.5 up to a billion years, then a monotone spline that slows for the Sun's end and races to 10^12 years). Filmed like a real time-lapse: the first day runs straight through (sunset, night, dawn), then every frame is taken 23 min before sunset, so the Sun slides along the horizon with the seasons; anything faster than a frame smears like a long exposure (`exposure()`): people and cars vanish, headlights become ribbons (`trails.js`), the Sun becomes a streak (`sky.js` arcDist), the sea goes glassy (`sea.js`). Every building lot is rebuilt on its own cycle with cranes (`city.js`); the kiosk sign changes owners and, after a few centuries, script (`props.js` canvas atlas). Then Betelgeuse, ice-age sea levels, the land reshaping (`land.js` uLand/uMorph), a 10 km impact (fireball + debris streaks), the oceans boiling away, the red giant swallowing Earth (radius from Schröder & Smith 2008), and space (`space.js`: planetary nebula, white dwarf cooling, galaxies fading); fade to black, loop | `out/trillion-years_v4_1080x1920_60fps_tiktok.mp4` |
| `big-crunch/` | What if you lived to the Big Crunch? | Built on the trillion-years engine (same promenade scene): time 10x every 2 s, so Earth's story (the city rebuilt, Betelgeuse, ice ages, the asteroid, the oceans boiling, the red giant) is over by 34 s; the trillion-years camera moves are reused through `oldV()` (the trillion-years video time of the same story moment). Then space (`space.js`) runs on the time left until the crunch (`logLeft()`, 20 billion years from now, Tye et al. 2025): the galaxies recede, redder and smaller, the universe turns around (the counter switches to CRUNCH IN ...), they come back blue-shifted, bigger and more of them, crash together, the sky heats from red to orange to yellow to white-hot (a fire palette on `skyT`), stars boil; then the crunch itself: the whole sky is squeezed into a shrinking, spinning ball (`uSquash`: the sky shader maps each view direction to what was at angle/uSquash around the point) with light streaking in from the dark around it, and you are turned head-first, stretched long and thin and dragged into it (your figure in its own group, `youG.matrix`); the point vanishes in a short flash, loop | `out/big-crunch_v4_1080x1920_60fps_tiktok.mp4` |
| `jupiter/` | What if you stood on Jupiter? | A new scene with no ground: you (a spacesuit built from primitives, `suit.js`, posed per frame) step off Jupiter's cloud tops and sink, filmed by a chase camera (over the shoulder, round to your visor, above you, beside you). Everything beyond a few metres is one shader (`sky.js`, km units): three ray-marched cloud decks with Jupiter's curvature (white/orange banded ammonia clouds of cumulus puffs on irregular masses with the Great Red Spot on the horizon; brown NH4SH clouds; water-cloud storm towers with a clear shaft where you fall, lit by lightning `BOLTS`), fog inside each deck, then the glowing deep (billows from dull red to white). The Sun races across the sky and sets in the jet stream; frost on the suit and visor in the ammonia clouds; dark below the storms (helmet lamp, Galileo's probe and parachute in `probe.js`); the visor cracks; diamonds glint (`diamonds.js`); specks stream past (`streaks.js`); white at 20,000 km. Depth follows a monotone spline (`depthAt`), pressure/temperature from Galileo data and interior models | `out/jupiter_v4_1080x1920_60fps_tiktok.mp4` |
| `jump-doubles/` | What if every jump went twice as high? | A new scene: Brickell Avenue in Miami at dusk (palms on the median, stopped traffic, a crowd round the crossing, towers with lit windows and LED crowns, Biscayne Bay). Jump n goes 2^n ft (jump 6 at frame 0, jump 31 hits the Moon, which is overhead: Miami is far enough south); real takeoff speeds (`speedOf`: 990 mph at jump 15, so the sonic boom bursts the windows) and landing energies (`BOUNCES` in `timeline.js`: crater, cracks, glass, cars thrown, buildings down, fires, all from TNT-scaled radii that grow every landing). Altitude is a parabola in log space; one log-depth scene spans the street to the Moon: a curved ground disk (`ground.js`, procedural street + city lights, then NASA maps) inside the globe (`earth.js`), the Moon with craters at every scale. You are a jointed figure (`hero.js`); the camera mostly holds still on the ground (`shots.js`: the shot list, also used by the soundtrack for distance and wind), flying with you only for a few moments; from jump 12 on you crouch in the crater for a moment before each launch (`dw`); fixed street cameras for the big landings (15, 19, 22); the last jumps look up past you at the Moon with a zoom that keeps it big. Fireball streak and light pillar are camera-facing strips (`you.js`). A clamp pass before the bloom stops any overflowing pixel from blacking out the frame | `out/jump-doubles_v4_1080x1920_60fps_tiktok.mp4` |
| `earth-falls/` | What if Earth stopped orbiting the Sun? | City beach from a hotel balcony; opens on a 1.6 s flash-forward of the end, speed counter to 0, 65-day fall (first weeks as a time-lapse), Sun grows, sea boils, fires | `out/earth-falls_1080x1920_60fps_tiktok.mp4` |

Older versions are also in each `out/`. Covers: `out/*cover*.png`. Post captions: `CAPTIONS.md`.

**v4 openings (what the analytics taught us):** the story starts `STORY_START` seconds in (timeline.js) so the title
*and* a moving counter are on screen at frame 0 and the first event lands within seconds; a dark band sits behind the
title (finish pass); slow camera moves follow the action (`keys` in main.js). `node render.mjs --cover T` renders the
cover art. `earth-falls/node_modules` is a junction to `asteroid/node_modules`. Every Sun video before v3 has a silent soundtrack after ~3 s (the church
bells overflowed the phase array and turned the whole mix into NaN); v3 fixes it.

## Files in each project
- `src/timeline.js` — the whole story: captions, counters, timing of every event. Edit wording/pacing here.
- `src/world.js` — the 3D scene (terrain, buildings, people, water…), pure function of time.
- `src/sky.js` — sky shader. `src/bend.js` — material patches: procedural facades (windows, shutters, shopfronts…), snow. `src/main.js` — camera, post FX.
- `src/crowd.js` — articulated instanced people (walk/run/sit/point/phone/look up/tumble). `src/cars.js` — instanced cars
  (sedan/hatch/SUV/van: shaped body, glass cabin, wheels, lights). Same file in every project: edit one, copy to the others.
- Water (`asteroid/src/ocean.js`, the Sun lake, the black-hole sea) sums a wave *spectrum* (~24 components, filtered by
  pixel footprint, with wind patches and slicks). A handful of sines always reads as a regular lattice.
- `src/compose.js` — paints the HTML overlay (title/counter/captions) into the frame for encoding.
- `audio.mjs` — procedural soundtrack synced to the timeline.
- `render.mjs` — exporter.

## Export
```bash
node render.mjs                      # -> out/<folder>_1080x1920_60fps.mp4 with sound (~4 min)
node render.mjs --out out/name.mp4   # custom output name
node render.mjs --stills 5,30,60     # test frames -> stills/
node render.mjs --draft              # quick 30fps preview
node render.mjs --grain              # keep film grain (off by default: hurts TikTok compression)
node render.mjs --screenshot         # old slow path (screenshots + x264), fallback only
```
Upload copy (smaller file, same look):
```bash
ffmpeg -i out/X.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -c:a copy -movflags +faststart out/X_tiktok.mp4
```
Re-render from scratch + upload copies: `bash render-v4.sh asteroid sun-vanishes black-hole` (~5 min each).

Live preview: `node server.mjs` then open `http://127.0.0.1:5178/?t=45` (space = pause, ←/→ = seek).

## Things learned
- Fast renderer: frames are composited into one canvas and H.264-encoded in Chrome (WebCodecs) → ~20–25 fps
  render speed (4 min per video). The old screenshot path was ~2 fps (37 min). GPU draw is only ~7 ms/frame.
- Most of the render time was never the GPU draw (~7 ms) but the H.264 encode on the CPU and the hand-offs.
  So two Chromes now render alternate segments (`--workers 2`), the encode uses the GPU's video encoder when
  Chrome offers one (checked: no reordered frames; any failure falls back to the CPU), frames go to/from the
  page in batches of 15, and the upload copies use x264 `medium` in the background. Old behaviour:
  `--workers 1 --software`.
- Renders are crash-safe: 10 s segments in `out/.segments/`, auto-relaunch, re-run resumes. Delete
  `out/.segments/` before re-rendering after code changes (otherwise old segments are reused).
- A render died once because the laptop went to sleep (lid closed). Set lid-close to "Do nothing" when plugged in.
- TikTok serves new uploads at 540p first and upgrades to 720p/1080p as they age/get views. Keep
  "Allow high-quality uploads" on; don't re-upload to "fix" it.
- Film grain + tiny particles compress badly on TikTok; grain is off by default now.
- Facade windows are laid out in each building's object space (columns fitted to the wall, floors starting from an
  `aGround` instance attribute = highest ground under the building) and hashed only from integers (house id, face,
  window cell). Hashing interpolated varyings (normals, seeds) gives per-pixel speckle that flashes frame to frame.
- Text overlay: CSS font-variant-numeric doesn't work in canvas; compose.js loads a FontFace with
  `featureSettings: '"lnum" 1, "tnum" 1'` for the counter digits.

## Requirements
Node 26, ffmpeg (in PATH), Chrome. `npm install` already done in each folder (three, puppeteer-core, @fontsource/cormorant-garamond).


## Status at handoff (2026-10-04, evening)
- Done + checked: `sun-vanishes` v4 (star trails reworked, candle lantern now in shot, calm flicker), `black-hole` v4
  (Moon debris stream + disk keep the same tilt; `uMoonTail` follows the Moon's path).
- All four v4 videos finished and were checked on 2026-10-04 (durations 68-72 s, 66 s for earth-falls, audio throughout):
  1. DONE + checked: `asteroid` v4 (`render-v4-ast.log`): STORY_START 11, so the burning rock is in frame at 0 s and hits ~5.5 s;
     the shockwave ring now rushes in (low dome, `atan(0.06, 1-k)`) and a white spray line crosses the sea, arriving
     exactly with the blast. Then `--cover 58` -> `out/asteroid_v4_cover.png` and the Sun cover `--cover 42`.
  2. DONE + checked: `earth-falls` (writes `EF2_DONE`): palms ignite one by one, fronds burn away, trunks crumble; the shallow bay boils
     dry (cracked salt-crusted seabed); umbrellas burn; red-hot glow; sand fuses to glass. Cover `--cover 56` (old timing; since the cold open + time-lapse that frame is `--cover 49.5`).
  earth-falls now has two clocks: video time -> story time via `storyTime()` in its timeline.js; captions are on the video clock.
- Next checks: open the finished asteroid + earth-falls `_tiktok.mp4`s (durations 69 s / 66 s, audio throughout),
  then post per `CAPTIONS.md` (YouTube titles <=100 chars). If a render died, re-run `bash render-v4.sh asteroid`
  or the earth-falls block in `render-queue.sh` (it deletes `out/.segments` first).

## Working in the cloud (Claude Code cloud sessions)
- This repo holds code only; videos, stills and `node_modules` stay on the laptop (see `.gitignore`).
- On a fresh machine run `npm install` in each project folder (`earth-falls` used a junction to `asteroid/node_modules`
  locally; in the cloud just `npm install` there too).
- `render.mjs` looks for Chrome at Windows paths; elsewhere pass `--chrome /path/to/chrome`. A cloud box likely has no
  GPU, so WebGL falls back to the CPU: fine for code and a few `--stills` checks, far too slow for full renders.
  Do final renders on the laptop (`bash render-v4.sh <folder>`), after `git pull`.
