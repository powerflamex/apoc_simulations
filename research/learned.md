# What we've learned (so any session or account can pick up from here)

## Stats (owner's YouTube Studio)
- **Black hole v4 repost** (Oct 7, 1:05, title + racing countdown on frame 0, seamless loop): ~99K views after
  1.5 days, ~490K by Oct 9, 94.6% from the Shorts feed, 62-66% stayed to watch, ~83% average viewed, +105 subs in
  the first 1.5 days. Same topic as the old version (1,778 views / 49% stayed): the opening + loop made a ~55x difference.
- Other v4s (Oct 8): earth-falls 3,257 views / 63.7% stayed; sun-vanishes 2,107 / 65.2%; old asteroid 2,082 / 45%;
  new asteroid (meteor on frame 0) 226 views / 78.7% after 12 h (mostly channel-page views, not proven yet).
- The owner says 60-70% stayed to watch and 80-90% average viewed are normal for their videos, even from strangers,
  so those two numbers don't explain the black hole's push. Best guesses: a broader topic (anyone gets "a black
  hole you can't see coming"), comment debates, shares, rewatches from the loop, timing. To find out, compare
  likes / comments / shares / subs per 1,000 views between the black hole and another video.
- "Unique viewers" in Studio lags behind live view counts (clock icon), so views / unique viewers looks too high.
  Since March 2025 every Shorts start/replay counts as a view; "engaged views" is closer to real plays.
- Don't use `ytb/*.csv`: the owner says that export was out of date.

- YouTube views as of Sun Oct 11 ~9 PM (owner's Studio screenshot): black hole v4 (Oct 7) 1,358,269; speed-doubles
  (Oct 10) 390,266; sun-vanishes (Oct 6) 169,583; asteroid v4 (Oct 8) 153,742; earth-spins (Oct 9) 104,518;
  electrons (Oct 11, under a day) 53,926.
- Channel export through Oct 13 (owner's Studio CSVs, Oct 14): 4.03M views, +9,846 subs in 10 days. Per video
  (views / avg view duration of length / subs per 1,000 views): black hole v4 1.91M / 78% / 1.6; speed-doubles 847K /
  79% / 2.2; asteroid v4 292K / 78% / 2.8; sun-vanishes 269K / 76% / 3.3; earth-spins 181K / 70% / 2.8; moon-falls
  147K / 71% / 3.0; electrons 119K / 67% / 2.4; earth-falls 102K / 75% / 3.4; women-vanish 80K (1.5 days) / 69% / 1.2;
  long-form 8.3K / 3:03 avg / 4.3. The two big hits are also the two best-watched (~78-79%). Channel views per day
  peaked Oct 11 (994K) and are easing (822K, 693K) as the black hole's push fades (461K -> 224K a day).
- Yellowstone (posted Oct 14 ~10 AM): 34.4K views at ~11 h, 63.6% stayed to watch, avg 0:41 of 1:04 (64%, the lowest
  so far), +63 subs, still ~2,900 views an hour at 9 PM. Slower start than moon-falls (65K at ~7 h).
- Views in the first 11 h 12 min (Studio "top recent videos", Oct 14): speed-doubles 119.8K, moon-falls 70.9K,
  women-vanish 67.3K, electrons 53.8K, yellowstone 34.3K, earth-spins 7.1K, black hole v4 5.1K, earth-falls 646,
  sun-vanishes 250, asteroid v4 219. Every Short posted after the black hole took off (Oct 9) starts ~10x faster, so
  the channel's history now buys a big first-day test. The black hole itself had only 5.1K at 11 h and exploded on
  day 3, so a slow first day doesn't mean a Short is finished. Oct 15 morning: moon-falls 160.8K (~2.9 days),
  electrons 127.9K (~3.9 days), women-vanish 120.3K (~45 h); all flatten after day 1, the normal Shorts shape.

## Posting
- One Short a day on YouTube, around 10 AM ET. The owner stopped TikTok on 2026-10-12: no TikTok captions.
- YouTube title max 100 characters (count emoji as 2), plus a short description.
- Songs: add them in the apps (the YouTube Shorts song picker), never mixed into the file:
  YouTube blocks Shorts over 1 minute that carry a copyright claim. The speed-doubles video uses "Charlie's
  Inferno" (That Handsome Devil) from 2:50.

- Topics that attract gender-war comments (e.g. women-vanish): before posting, turn on YouTube "hold potentially
  inappropriate comments for review", and pin a comment that steers to the question.
- Long-form: weekly, Sundays 1 PM ET (the first one, "7 ways the world could end", went up Oct 11).

## How the owner likes to work
- Quality over render speed: keep the two-step render (GPU master + careful CPU upload copy); don't trade
  picture quality for faster renders.
- Plain words, no jargon; show the frames you checked; say which files to upload.
- When asked "what do you think" / "is this normal": answer and wait, don't start building.
- Competitor videos stay in the scratchpad, never in the repo.

## Keeping people watching to the end (from the Oct 14-15 stats; apply to every new video)
- The two hits (black hole, speed-doubles) kept ~78-79% of the video watched; later Shorts 64-71%. The openings work
  ("stayed to watch" is the same); the middles lose people. So build every video as ONE rule that gets worse every few
  seconds, with the biggest moment at the very end (not a big event early followed by aftermath).
- Put a finish line on screen from frame 0 that the counter races toward (speed-doubles: "light speed in 53 s";
  gravity-doubles: a red badge "EARTH CAVES IN AT 6,000x" under the counter).
- Give the escalation a beat: gravity-doubles pops a big gold "4x", "8x"... in the lower middle at each doubling,
  with a camera jolt and a deep boom in the sound.
- Never let the middle sit still: if the story leaves "you" (e.g. you die), move the camera somewhere new (gravity-doubles
  flies out over the river into the burning city).
- Owner rule (Oct 15): don't reuse an old project's scene without asking him first. Shared building blocks
  (crowd.js, cars.js, smoke.js, compose/render code) are fine.

## The owner's feedback on the videos (apply to every new one)
- **Show it, don't just say it.** If a caption claims something (nurses gone, fires, collapse, "more than every nuke"),
  the picture must show it: cutaways (a hospital ward, a classroom), damage, fires, people. A plain time-lapse of an
  empty city was called boring.
- **Effects must be physically believable and connected.** Meteors that appear out of nowhere were rejected: they must be
  visible pieces of the rubble dropping out. Rocks that vanish on landing look wrong: leave a fire/trail into the ground.
  Hits right next to a city with no damage look wrong.
- **Escalate, don't peak early.** Make each hit/event closer or bigger than the last (moon-falls: horizon -> islands ->
  bay -> towers -> half a mile away), so there's always something new to destroy.
- **The first 15 s must change constantly.** "Nothing changes for 15 s" was the main complaint about the first moon cut.
- **Crowds:** people must never jump, teleport or change size. Plan every path up front so nobody overlaps
  (women-vanish/src/people.js) instead of pushing people apart each frame (that caused the jumping in electrons).
  Keep the scene at real scale (Shibuya scramble ~44 x 40 m).
- **Sound:** no harsh clicks/clacks/crackles. The owner noticed "plastic breaking" clacks from many short noise bursts
  (car bumps, dropped items). Use soft, low thuds and distance falloff, and scan the track for sharp spikes before rendering.
- A human moment lands well (the last man dying on a bench, counter 1 -> 0, heartbeat stopping).

## Long-form competitors (Oct 18)
- 9 channels doing "...and couldn't stop?" long videos, almost all started Oct 10-16: see
  `research/longform_wave_2026-10-18.md`. First video on a topic wins 10-100x over the copies; hits open with a
  3-6 s flash-forward of the ending, then the title; logo intros and calm 20-30 s openings flop.

## Ideas in the queue
- Long-form "7 ways the world could end" compilation: see `longform/PLAN.md`.
- Status Oct 12: moon-falls (Day 8, 66 s) and women-vanish (Day 9, 64 s) are finished, checked and in CAPTIONS.md.
  After these two, no finished Short is left: a new one is needed for the following day.
- Status Oct 15 (evening): earth-stops (Day 12, "What if Earth stopped spinning?", 66 s, new equator-avenue scene) finished and in CAPTIONS.md.
- Status Oct 15 (late): trillion-years (Day 13, "What if you lived 1 trillion years?", 66.6 s, new seaside-promenade scene, time 10x every 3.5 s) finished and in CAPTIONS.md. The owner chose to keep "1 trillion" even though the biggest moment (the Sun swallowing Earth) comes at 58 s, with a quieter space ending after it.
- earth-stops (Day 12) stats from the owner, Oct 16: 70% stayed to watch, avg view duration 0:44 of 1:07 (66%): the best
  stayed-to-watch so far (vs ~60-65% for the others). Frame 0 already busy and moving (people walking, the counter racing).
- Status Oct 16: big-crunch (Day 14, "What if you lived to the Big Crunch?", 65.4 s) built on the trillion-years engine
  with the owner's OK to reuse the scene (he is watching his weekly usage): Earth part squeezed to 34 s, new space ending.
- Status Oct 15: gravity-doubles (Day 11) finished, posting Oct 15. Next to build: "What if Earth stopped spinning?"
  (see the memory note on Lunar's competitor hit; new city, new camera, our frame-0 hook + loop), then oxygen gone for 5 s
  or a black hole sequel.
- Status Oct 18: jupiter (Day 15, "What if you stood on Jupiter?", ~70 s) built as a new project from `research/next-jupiter-fall.md`:
  a spacesuit falling through three cloud decks into the glowing deep; chase camera instead of a street scene.
- Proven topics not built yet: a black hole follow-up (e.g. through the Moon); more "X disappears" topics.
