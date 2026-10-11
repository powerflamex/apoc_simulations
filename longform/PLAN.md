# Long-form video: "7 ways the world could end" (plan, not started)

One 16:9 video (1920x1080, 30 fps, ~9-10 min) made from the existing sims, ordered from least to most destructive.
No loops; each part ends on its cover (white / deep water / ice) and fades into a title card over the next part.
On-screen text only for now (no voiceover); a voice can be added later.

## Order, as the viewer sees it
0. **Intro (~15 s):** fast montage of the 7 climaxes (2 s each) + title "7 ways the world could end, from bad to total annihilation".
1. **#7 Asteroid** (`asteroid/`): one coastline wiped out.
2. **#6 Earth spins faster** (`earth-spins/`): the oceans flood the cities, you float away.
3. **#5 The Sun vanishes** (`sun-vanishes/`): the planet freezes.
4. **#4 Earth stops orbiting** (`earth-falls/`): we fall into the Sun.
5. **#3 Black hole** (`black-hole/`): Earth torn apart.
6. **#2 Your speed doubles** (`speed-doubles/`): you destroy Earth, then lap the solar system.
7. **#1 Every electron disappears** (`electrons/`): the solar system gone at near light speed.
8. **Outro (~8 s):** "Which one scares you most?" (comments) + subscribe.

Each part ~70-90 s of video at ~0.75x story speed (slower pacing; ~30% more time per beat).

## What has to change in each sim (same for all 7)
- **Aspect:** `W, H` in `src/main.js` and `src/compose.js` are 1080x1920; `render.mjs` sets the Chrome viewport,
  the WebCodecs encoder `width/height`, and `index.html` sizes `#stage`. Add a `?wide=1` URL flag (and
  `render.mjs --wide`) that switches all of these to 1920x1080, so the Shorts keep working unchanged.
- **Cameras:** every camera was framed for a tall screen (vertical FOV 50-62). For 16:9 keep the same *horizontal*
  view: `fov_wide = 2*atan(tan(fov/2) * (1080/1920) / (1920/1080))`... in practice lower the vertical FOV to ~35-40
  and check each scene's key moments; some pitch keys (looking up/down) need softening.
- **Overlay:** title, counter and captions are laid out for 1080 wide (`index.html` CSS). Wide layout: counter
  bottom-left, captions bottom-centre (one line, max ~60% width), title centred. Hide each part's own opening title
  (the chapter card replaces it).
- **Pacing:** add `?pace=0.75`: `renderFrame(t)` calls `update(t * pace)`; the soundtrack is rendered at the same
  pace (resample `audio.mjs` output, or synthesize with `v * pace`). Captions are timed on the same clock, so they
  slow down with it.
- **Ending:** skip the loop tail (render 0 .. T_SWITCH only; the part ends inside its full cover).

## Joining
- Render each part to `longform/parts/NN_<name>.mp4` (1920x1080, 30 fps).
- Chapter cards ("#5 - The Sun vanishes") as a small HTML page rendered the same way, or ffmpeg `drawtext` over
  the first 2 s of each part.
- Join with ffmpeg `xfade` (each part's white/water/ice cover dissolving into the next part's opening) and
  `acrossfade` for sound; final encode x264 CRF 18, ~12 Mbps, AAC 192k. Expect ~0.5-0.8 GB.
- YouTube chapters in the description (timestamps of each part).

## Effort / time
- Code: the `?wide` and `?pace` flags once (copy to all 7 projects), then camera/overlay checks per sim.
- Rendering: ~5 min per part at 30 fps, ~40 min total, unattended.
- Before starting: watch the older parts (asteroid, black hole, sun) in full and note anything that needs fixing.

## Progress (branch `longform`)
- [x] `asteroid/`: `?wide=1` / `node render.mjs --wide` -> 1920x1080 (main.js W/H + FOV x0.62 tangent, compose.js,
      index.html `.wide` layout, render.mjs viewport/encoder/clip/URL). Checked stills at 0, 8, 20, 45 s: works.
- [x] Wide mode for all 7 (space cameras via `widen()`, sun-vanishes lake reflection + frost aspect, speed-doubles
      ring widths). Bigger wide captions (64 px). Parts end at T_SWITCH (inside the cover, no loop tail).
- [x] `longform/render-parts.sh` (all parts, or just named ones) + `longform/join.sh` (intro card, "#N" + name
      over each part with outlined text, 0.8 s cross-fades, outro card, x264 CRF 18). v1 rendered 2026-10-11:
      `longform/out/7-ways-the-world-ends_1920x1080.mp4`, 7:03, 630 MB. Parts ~4-7 min each; the join ~15 min.
- [ ] Not done (owner didn't ask yet): slower pacing (`?pace`), intro montage of the climaxes, voiceover.
- Fixing one part later: `bash longform/render-parts.sh <project>` then `bash longform/join.sh` (no full re-render).
