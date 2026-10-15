# Apocalypse "what if" sims

Vertical (1080x1920, 60 fps) TikTok/YouTube Shorts videos, one self-contained Three.js project per folder:
`asteroid/`, `black-hole/`, `earth-falls/`, `sun-vanishes/`, `earth-spins/`, `speed-doubles/`, `electrons/`, `moon-falls/`,
`women-vanish/`, `yellowstone/`, `gravity-doubles/`. See README.md for how each project is built.

## The owner wants to be hands-off

A change is not done when the code is done. It is done when the new video is rendered and checked.
After changing any project, without being asked and without stopping to ask:

1. Re-render every project you changed, from the repo root: `bash render-v4.sh <project> [<project> ...]`
   (about 5 min per video; it clears `out/.segments` itself and writes `out/<name>_v4_1080x1920_60fps.mp4`
   plus the `_tiktok.mp4` upload copy). Overwrite the old videos; no backups are wanted (the script deletes any
   other .mp4 in that project's `out/` once the new upload copy is made).
2. Check the result in the rendered `_tiktok.mp4`, not just the code: pull frames with ffmpeg at the moments
   you changed (`ffmpeg -ss <sec> -i <video> -frames:v 1 frame.png`), look at them, and for timing problems step
   frame by frame (1/60 s). Fix and re-render if anything is off.
3. Show the owner the frames you checked and say which video files to upload.
4. Commit with a clear message (and push the current branch if the repo has a remote).

The owner is new to coding: explain in plain words, skip jargon, and never leave them a manual step you could do.

How the owner likes to work:
- When they ask "what do you think" or "answer before you build", give your opinion and wait. Don't start building.
- Do only what was asked (e.g. "captions" means the posting text, not the on-screen title).
- When describing a video plan, lay it out in the order a viewer sees it, from 0:00 to the end, then the loop.
- Downloaded competitor videos stay private: keep them in the scratchpad, never in the repo.

Stats history, posting routine and other things learned: `research/learned.md`. Long-form plan: `longform/PLAN.md`.

## What makes these videos work (from `research/` and the owner's own stats)

Use this for every new video and every rework:
- **Frame 0:** the question (title) and a number already racing are on screen and readable. No subtitle, logo or
  "A SIMULATION" line: anything that delays the hook costs viewers.
- **First seconds:** something visibly happens right away, not just the counter. The owner's YouTube "stayed to
  watch": sun-vanishes 61.4% at 266 views (a countdown racing on frame 0 to an event you see at ~10 s, day
  turning to night; no cold open) and earth-falls 59.8% (cold open on the climax) are about equal; the old
  black hole 47% and asteroid 39% had no title or counter on frame 0. Early numbers (under ~300 views) swing by
  10 points, so compare videos once they have a few hundred views.
- **Frame 0 reads at a glance and is already strange** (`research/youtube_findings_2026-10-07.md`): strong
  contrast, never mostly white, black or hazy, and the unusual thing (giant Sun, meteor, rings) already on screen
  or visibly changing within ~2 s. On YouTube, Shorts that open on a calm "normal day" and make you wait 8-12 s
  stall at <300 views; same-channel twins that open on the spectacle get the first ~1,000.
- **Scenes:** bright and busy, with people, cars and city lights, so the viewer pictures themselves there.
- **On-screen captions:** short, put "you" somewhere concrete, and give one hard number.
- **Length:** 60-80 s. **Loop:** always (nobody else in the niche does it).
- **Loop point on a plain screen:** TikTok and Shorts freeze the last frame for a moment when they loop, so the cut
  must sit inside a full white flash, deep water, or solid ice, never in the middle of a detailed shot.
- Topics that are proven hits: Earth stops spinning, the Moon crashes into Earth, "X disappears for 5 seconds".
  Silly novelty topics flop.

## Working on the sims

- Each sim is a pure function of time: `src/timeline.js` holds the story (captions, counters, when events happen),
  `src/world.js` the scene, `src/sky.js` / `ocean.js` the shaders, `src/main.js` the camera and post effects,
  `audio.mjs` the procedural soundtrack (synced to the same timeline).
- Times in `timeline.js` are story time; the video starts `STORY_START` seconds in. `earth-falls` also has a
  separate video clock (`storyTime()`: cold open + time-lapse); its captions are timed on the video clock.
  `earth-spins` runs entirely on the video clock (`STORY_START = 0`): the Sun's hour angle is laid out per video second
  (`OMEGA`), story hours and the countdown follow from it, and the spin (day length) is keyed separately.
  `speed-doubles` also runs on the video clock: `storyT(v)` is real time in the city and a time-lapse in space (`RATE`;
  the counter shows a TIME-LAPSE badge), speed = 8 mph x 2^(T/2). It has three scenes (`city.js`, `space.js`, `solar.js`)
  that `main.js` switches between; `textures/` holds NASA's public-domain Earth maps.
- `crowd.js` and `cars.js` are the same file in every project: edit one, copy to the others.
- Rendering speed: `render.mjs` runs two Chromes on alternate 10 s segments, encodes H.264 on the GPU's video
  encoder when Chrome has one (it falls back to the CPU by itself and logs `encoder: ...`), and makes the upload
  copy (`--upload`, x264 CRF 18, the channel watermark via `--watermark`) piece by piece on the idle CPU while the
  GPU draws the next pieces (lowest priority, 4 threads, so the owner's PC stays usable). The GPU (Quadro M620) is
  at 99% while drawing: a third Chrome does not help. One video takes ~5.5 min in all. If a render misbehaves, the old
  settings are `node render.mjs --workers 1 --software`. `render-v4.sh` prints how long each step took.
- Single test frames: `node render.mjs --stills 12.5,30` (video time) -> `stills/`. Live preview:
  `node server.mjs`, then open `http://127.0.0.1:5178/?t=30`.
- Post titles and captions for each video are in `CAPTIONS.md`.
- Every video loops seamlessly (no end card: a black screen at the end made people swipe away). The ending builds
  to a full cover (white flash / deep water / solid lens ice), at `T_SWITCH` the scene jumps back to just before
  the first frame, and the cover clears over the last `LOOP` seconds (`renderFrame` in `main.js`); the soundtrack
  does the same (end of `audio.mjs`). Keep this working when changing an ending or an opening: the last frame
  (`VIDEO_DURATION - 1/60`) must look like the next frame after it would be frame 0, and the sound must not jump.

## Posting copy (keep `CAPTIONS.md` up to date for every new or changed video)

- YouTube Shorts title: **max 100 characters** (YouTube's limit; count emoji as 2 to be safe). Hook first,
  1-2 hashtags at the end. Write the count next to it.
- YouTube description: the key facts in a few short lines, a question to get comments, then hashtags.
- Only claim what the video shows (same numbers as the captions/counters in `timeline.js`).
- The owner posts one Short a day on YouTube only (stopped TikTok on 2026-10-12): give only the YouTube title and
  description, no TikTok caption. (The `_tiktok.mp4` name is just the upload copy; it's the file for YouTube.)
