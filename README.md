# Apocalypse "What if" sims

Vertical (1080×1920, 60fps, 80s) first-person disaster simulations in the style of TikTok "what if" videos:
serif counter (left), italic narration (lower middle), opening title + end card, one continuous POV shot,
calm → escalation → climax beats. Built with Three.js, rendered headlessly, soundtrack synthesized from the same timeline.

## Projects (each folder is self-contained)

| Folder | Video | Scene | Final upload file |
|---|---|---|---|
| `black-hole/` | What if a black hole passed by Earth? | Seaside city rooftop at dusk, ray-traced lensing + accretion disk | `out/black-hole_v4_1080x1920_60fps_tiktok.mp4` |
| `sun-vanishes/` | What if the Sun suddenly vanished? | Alpine lake village from a chalet balcony; pasture with picnic, kids, cows, hikers; paragliders, steamer, train; star trails, freeze | `out/sun-vanishes_alpine_v4_1080x1920_60fps_tiktok.mp4` |
| `asteroid/` | What if a 1-mile asteroid hit the ocean? | Cycladic island bay from a clifftop terrace, steam column, drawback, 600 ft wave | `out/asteroid_island_v4_1080x1920_60fps_tiktok.mp4` |
| `earth-falls/` | What if Earth stopped orbiting the Sun? | City beach from a hotel balcony; speed counter to 0, 65-day fall, Sun grows, sea boils, fires | `out/earth-falls_1080x1920_60fps_tiktok.mp4` |

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
node render.mjs                      # -> out/<folder>_1080x1920_60fps.mp4 with sound
node render.mjs --upload             # also writes out/<name>_tiktok.mp4 (the upload copy) in the same pass
node render.mjs --out out/name.mp4   # custom output name
node render.mjs --stills 5,30,60     # test frames -> stills/
node render.mjs --draft              # quick half-size 30fps preview
node render.mjs --grain              # keep film grain (off by default: hurts TikTok compression)
node render.mjs --workers 2          # pin the number of Chrome instances (default: finds out by itself, see below)
node render.mjs --preset veryfast --crf 12   # x264 settings of the master (default superfast / 14; this one: smaller file)
node render.mjs --webcodecs          # previous path (H.264 encoded inside Chrome), fallback only
```
The log ends with `rendered N frames in X min (Y fps once Chrome was up)`: that is the number to compare between
machines and settings.

Masters + upload copies for several projects: `bash render-v4.sh asteroid sun-vanishes black-hole`.
The upload copy of an existing master can still be made by hand (same settings `--upload` uses, but from the master
instead of from the raw frames):
```bash
ffmpeg -i out/X.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -c:a copy -movflags +faststart out/X_tiktok.mp4
```

Live preview: `node server.mjs` then open `http://127.0.0.1:5178/?t=45` (space = pause, ←/→ = seek).

## Things learned
- Renderer: frames are composited into one canvas, converted to YUV 4:2:0 on the GPU and handed to ffmpeg/x264 as
  raw planes (a worker POSTs them to `render.mjs`). The master is one x264 encode of lossless frames; `--upload`
  encodes the upload copy from the same frames in the same pass. Chrome's own H.264 encoder (the previous path,
  still there as `--webcodecs`) was slower on busy scenes and lower fidelity. Measured on 1 s of captured frames
  against the lossless originals (PSNR of luma): master 45.0 dB at 23 Mbps -> 52.5 dB at 44 Mbps (asteroid) and
  46.0 dB at 50 Mbps -> 47.3 dB at 46 Mbps (black hole); upload copy 43.3 -> 46.6 dB and 41.9 -> 43.1 dB at the same
  size. The master is constant-quality now, so calm scenes no longer get a smaller file than busy ones;
  `--preset veryfast --crf 12` gives 48.8 dB at 12 Mbps / 46.2 dB at 32 Mbps if disk space matters more than speed.
- `performance.now()` around `composer.render()` only times the *submission* of the GL commands. The GPU does the
  work later; to time it, read a pixel back afterwards.
- The read-back of frame N is collected after frame N+1 has been queued (two pixel-pack buffers), so the page keeps
  working while the GPU draws.
- Worker count: the render starts with one Chrome and tries a second (then a third) only if the frame rate really
  goes up; the log says what it decided. A second Chrome helps when the page is the limit, not when the GPU is.
- Each sky dome is drawn after the opaque objects and depth-tested at the far plane, so its shader only runs on
  visible sky (the world covers 50-90 % of the frame). Only the scene buffer is multisampled. Both are pixel-identical
  to drawing the sky first / multisampling every buffer.
- puppeteer turns on DevTools network tracking for every page, which throttles large uploads from the page to
  ~25 MB/s. `render.mjs` drives Chrome over the DevTools pipe itself (no puppeteer).
- Renders are crash-safe: 10 s segments in `out/.segments/`, auto-relaunch, re-run resumes. The segment folder is
  named after a hash of `index.html` + `src/*.js` + the encoder settings, so after a code change old segments are
  never reused (and are deleted on the next render).
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
Node 22 or newer, ffmpeg with libx264 (in PATH), Chrome. `npm install` in each folder (three, @fontsource/cormorant-garamond).


## Status at handoff (2026-10-04, evening)
- Done + checked: `sun-vanishes` v4 (star trails reworked, candle lantern now in shot, calm flicker), `black-hole` v4
  (Moon debris stream + disk keep the same tilt; `uMoonTail` follows the Moon's path).
- All four v4 videos finished and were checked on 2026-10-04 (durations 68-72 s, 66 s for earth-falls, audio throughout):
  1. DONE + checked: `asteroid` v4 (`render-v4-ast.log`): STORY_START 11, so the burning rock is in frame at 0 s and hits ~5.5 s;
     the shockwave ring now rushes in (low dome, `atan(0.06, 1-k)`) and a white spray line crosses the sea, arriving
     exactly with the blast. Then `--cover 58` -> `out/asteroid_v4_cover.png` and the Sun cover `--cover 42`.
  2. DONE + checked: `earth-falls` (writes `EF2_DONE`): palms ignite one by one, fronds burn away, trunks crumble; the shallow bay boils
     dry (cracked salt-crusted seabed); umbrellas burn; red-hot glow; sand fuses to glass. Cover `--cover 56`.
- Next checks: open the finished asteroid + earth-falls `_tiktok.mp4`s (durations 69 s / 66 s, audio throughout),
  then post per `CAPTIONS.md` (YouTube titles <=100 chars). If a render died, re-run `bash render-v4.sh asteroid`
  or the earth-falls block in `render-queue.sh` (finished segments are kept).

## Working in the cloud (Claude Code cloud sessions)
- This repo holds code only; videos, stills and `node_modules` stay on the laptop (see `.gitignore`).
- On a fresh machine run `npm install` in each project folder (`earth-falls` used a junction to `asteroid/node_modules`
  locally; in the cloud just `npm install` there too).
- `render.mjs` finds Chrome in the usual Windows/macOS/Linux places (else `--chrome /path/to/chrome` or `CHROME_PATH`).
  A cloud box has no GPU: add `--angle swiftshader` to run WebGL on the CPU. That is fine for code and a few
  `--stills` checks (3-5 s per frame), far too slow for full renders.
  Do final renders on the laptop (`bash render-v4.sh <folder>`), after `git pull`.
