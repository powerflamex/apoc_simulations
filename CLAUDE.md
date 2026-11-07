# Apocalypse "what if" sims

Vertical (1080x1920, 60 fps) TikTok/YouTube Shorts videos, one self-contained Three.js project per folder, grouped by
the week they were posted (the owner's layout, Oct 18):
`week 1/`: `asteroid/`, `black-hole/`, `earth-falls/`, `sun-vanishes/`, `earth-spins/`, `speed-doubles/`, `electrons/`;
`week 2/`: `moon-falls/`, `women-vanish/`, `yellowstone/`, `gravity-doubles/`, `earth-stops/`, `trillion-years/`, `big-crunch/`;
`week 3/`: `jupiter/`, `jump-doubles/`, `oxygen-5s/`, `rain-1000-years/`, `quake-grows/`, `false-vacuum/`, `friction/`, `tsunami-nyc/`;
`week 4/`: `punch-10x/`, `black-hole-appears/`, `antimatter-rain/`, `time-stop/`.
`week 5/`: `fall-through-earth/`, `star-picker/`, `rogue-planet/`, `moon-explodes/`, `metal-rod/`.
`week 6/`: `biggest-nuke/`, `sand-grain/`, `volcano-fall/`. New projects go in the current week's folder. `render-v4.sh` takes bare names and finds the
folder itself. See README.md for how each project is built.

## The owner wants to be hands-off

A change is not done when the code is done. It is done when the new video is rendered and checked.
After changing any project, without being asked and without stopping to ask:

1. Re-render every project you changed, from the repo root: `bash render-v4.sh <project> [<project> ...]`
   (about 5 min per video; it clears `out/.segments` itself and writes `out/<name>_v4_1080x1920_60fps.mp4`
   plus the `_tiktok.mp4` upload copy). Overwrite the old videos; no backups are wanted (the script deletes any
   other .mp4 in that project's `out/` once the new upload copy is made).
   If only the sound changed (`audio.mjs`, `sounds/`), use `bash render-v4.sh --audio-only <project>` instead: it
   rebuilds the soundtrack and puts it into both existing videos without redrawing the picture (~30 s, no render gate).
   Run it in the background and don't ask the owner whether the PC is free: every video goes through the render
   gate (`render-gate.sh`), which waits by itself while another session renders, while he has paused renders (the
   "Pause renders" / "Resume renders" shortcuts on his desktop), while he's playing a game, while the laptop is on
   battery or while the graphics card is still hot (starts under 65°C). It prints why it's waiting, and the wait
   can be long (hours, if he's paused it): that's expected, don't stop it or tell him to unpause. Any other long
   render (long-form videos) goes through it too: `bash render-gate.sh <label> node render.mjs ...`.
   The upload copy uses 4 CPU cores while he's at the PC, 8 once he's been away 5 min, 2 on battery.
2. Check the result in the rendered `_tiktok.mp4`, not just the code: pull frames with ffmpeg at the moments
   you changed (`ffmpeg -ss <sec> -i <video> -frames:v 1 frame.png`), look at them, and for timing problems step
   frame by frame (1/60 s). Fix and re-render if anything is off.
3. Make the thumbnail (cover) for every new video, and remake it when a changed video's best moment changes:
   `node render.mjs --cover <sec>` in the project folder renders that frame with the big title over it to
   `stills/cover.png`; pick the most striking moment (usually the last third: the giant Sun, the wave), look at it,
   and copy it to `out/<name>_v4_cover.png`. Note it under the video in `CAPTIONS.md` (`Cover: ...`).
4. Show the owner the frames you checked and the cover, say which video files to upload, and paste the YouTube
   title and description into the reply (copy-ready), not just into `CAPTIONS.md`.
5. Commit with a clear message (and push the current branch if the repo has a remote).

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
- **Length:** 45-50 s (owner's call, Nov 3). Viewers watch ~32-36 s of every Short whatever its length, so shorter
  ones get a bigger share watched (49 s -> 73%, 55 s -> 65%, 63 s -> 51%). **Loop:** always (nobody else in the niche does it).
- **Loop point on a plain screen:** TikTok and Shorts freeze the last frame for a moment when they loop, so the cut
  must sit inside a full white flash, deep water, or solid ice, never in the middle of a detailed shot.
- Topics that are proven hits: Earth stops spinning, the Moon crashes into Earth, "X disappears for 5 seconds".
  Silly novelty topics flop.
- **The question matters most** (Oct 25-31 Studio reads, details in `research/learned.md`): a 10-year-old must get it
  with zero science knowledge, and it should be about "you". Repeating one formula wears off (the doubling videos fell
  55 -> 48 -> 39; "10x every few seconds" is in grow-trillion, punch, black-hole-appears and antimatter-rain: vary it).
- **Judge a Short on % still watching at 0:30 first** (owner's call, Nov 6; ranking in `research/shorts_ranking_2026-11-06.md`):
  target 70%+ (72%+ is the hit zone: every Short there has 148K+ views, including the three biggest), then views at 24 h (50K+, hits
  100K+). The curve takes up to 2 days. Stayed-to-watch is not a target: it has no link with views (0.00, against 0.63 for 0:30; black
  hole 3.7M has 59%). The old score (stayed x % viewed) is gone too: cutting a video raises its % viewed without making it better.
- **Shorts are won or lost in the first ~15 s:** a visibly bigger step every ~3 s. On frame 0, people close to the camera
  in a busy place and the danger big and close (far, small or abstract subjects hold worse). Frame brightness does
  NOT predict stay. A loud human reaction (a scream) in the first second helped (rain, grow-trillion).
- **Danger comes at you, with a finish line** (Nov 4): rogue planet held 72% at 0:20 with one growing danger and a countdown;
  Moon explodes, with its rubble gone by ~0:13 and a counter with no end point, held 62% at 0:20 and 40% at 0:46 (rogue 62%).
- **Real objects beat space sightseeing, and the story must keep moving** (OutwardAnimates, Nov 4): a metal rod 7.9M, ice
  cream 4M, vs 30-128K for universe tours. Show the object big and clear on frame 0; bring in something new every ~10 s (new
  people, a new situation), not just a bigger number: same formula on a mug 123K, on ice cream with a moving story 3.97M.
- **Over 60 s, no copyrighted sounds** (a claim can block a long Short); the owner's own clips go in `sounds/`.

## Long videos (16:9, `longform/`)

- They lose about half the viewers in the first 30-45 s: open on a 3-6 s flash-forward of the biggest moment, no
  logo, no explaining early, and the next big visible moment within ~10 s of the first one (heat death fell off a
  cliff when it went dark and quiet right after the lava).
- A big visible moment every ~45-60 s; viewers skip ahead to the destruction. No slow pans of one scene: cut to a
  visual for every narrated line.
- Base topics on the channel's proven Shorts (the black hole long video came from the 3M-view Short) and check YouTube
  first: the first good video on a topic wins (taken topics: `research/longform_topics_2026-10-26.md`).
- After posting, the owner sets the long video as the "Related video" on its matching Short (Studio > the Short's
  details), so the Short's viewers see a link to it.
- Thumbnails must read at phone size (~360 px wide): one big subject, one short line of big text.

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
  Where the time goes (measured Oct 15): the GPU drawing each frame (JS ~2-6 ms, encoding overlapped). The
  logarithmic depth buffer that most projects turn on makes the GPU shade every hidden surface: earth-stops switched
  to a plain depth buffer (camera near plane 0.5 m) and draws 1.5x faster (4.9 -> 3.2 min) with frames that compare
  visually identical. Use that for new street-scale scenes (compare stills before/after); keep log depth for scenes
  spanning planets or space (speed-doubles, electrons, earth-falls). After that, the upload copy (x264 medium on 4
  cores, ~20 s per 5 s of video) is the limit on the whole job (~5.8 min for earth-stops).
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
