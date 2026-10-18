# Long-form video: "7 ways the world could end" (plan, not started)

One 16:9 video (1920x1080, 30 fps, ~9-10 min) made from the existing sims, ordered from least to most destructive.
No loops; each part ends on its cover (white / deep water / ice) and fades into a title card over the next part.
Voiceover (decided 2026-10-18): the owner will record his own voice for the first few long videos to see if the
audience likes it, before paying for an ElevenLabs clone of his voice (~30 min of speech/month, ~2 long videos). Claude
writes the script (~1,400 words for 10 min: why things happen, a promise up front like "In the next 10 minutes, the
world ends 7 times", a hand-off line at the end of each part, silence over each impact); the owner sends one recording
of the whole script; Claude cuts it into lines, places them on the timeline and lowers the music under the voice.
Compare against long videos without a voice by average view duration and comments.

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
