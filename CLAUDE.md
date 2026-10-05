# Apocalypse "what if" sims

Four vertical (1080x1920, 60 fps) TikTok/YouTube Shorts videos, one self-contained Three.js project per folder:
`asteroid/`, `black-hole/`, `earth-falls/`, `sun-vanishes/`. See README.md for how each project is built.

## The owner wants to be hands-off

A change is not done when the code is done. It is done when the new video is rendered and checked.
After changing any project, without being asked and without stopping to ask:

1. Re-render every project you changed, from the repo root: `bash render-v4.sh <project> [<project> ...]`
   (about 5 min per video; it clears `out/.segments` itself and writes `out/<name>_v4_1080x1920_60fps.mp4`
   plus the `_tiktok.mp4` upload copy). Overwrite the old videos; no backups are wanted.
2. Check the result in the rendered `_tiktok.mp4`, not just the code: pull frames with ffmpeg at the moments
   you changed (`ffmpeg -ss <sec> -i <video> -frames:v 1 frame.png`), look at them, and for timing problems step
   frame by frame (1/60 s). Fix and re-render if anything is off.
3. Show the owner the frames you checked and say which video files to upload.
4. Commit with a clear message (and push the current branch if the repo has a remote).

The owner is new to coding: explain in plain words, skip jargon, and never leave them a manual step you could do.

## Working on the sims

- Each sim is a pure function of time: `src/timeline.js` holds the story (captions, counters, when events happen),
  `src/world.js` the scene, `src/sky.js` / `ocean.js` the shaders, `src/main.js` the camera and post effects,
  `audio.mjs` the procedural soundtrack (synced to the same timeline).
- Times in `timeline.js` are story time; the video starts `STORY_START` seconds in. `earth-falls` also has a
  separate video clock (`storyTime()`: cold open + time-lapse); its captions are timed on the video clock.
- `crowd.js` and `cars.js` are the same file in every project: edit one, copy to the others.
- Single test frames: `node render.mjs --stills 12.5,30` (video time) -> `stills/`. Live preview:
  `node server.mjs`, then open `http://127.0.0.1:5178/?t=30`.
- Post titles and captions for each video are in `CAPTIONS.md`.

## Posting copy (keep `CAPTIONS.md` up to date for every new or changed video)

- YouTube Shorts title: **max 100 characters** (YouTube's limit; count emoji as 2 to be safe). Hook first,
  1-2 hashtags at the end. Write the count next to it.
- YouTube description: the key facts in a few short lines, a question to get comments, then hashtags.
- TikTok caption: longer, fact-first, ends with a question, then hashtags.
- Only claim what the video shows (same numbers as the captions/counters in `timeline.js`).
- The owner posts one video a day, YouTube first and TikTok a day or two later.
