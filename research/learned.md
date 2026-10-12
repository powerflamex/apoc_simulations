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

## Posting
- One video a day, the same video on YouTube and TikTok the same day (since 2026-10-09), around 10 AM.
- YouTube title max 100 characters (count emoji as 2). TikTok caption up to 4,000. Always give both.
- Songs: add them in the apps (TikTok "Add sound", YouTube Shorts song picker), never mixed into the file:
  YouTube blocks Shorts over 1 minute that carry a copyright claim. The speed-doubles video uses "Charlie's
  Inferno" (That Handsome Devil) from 2:50.

- Topics that attract gender-war comments (e.g. women-vanish): before posting, turn on YouTube "hold potentially
  inappropriate comments for review" and TikTok "filter offensive comments", and pin a comment that steers to the question.
- Long-form: weekly, Sundays 1 PM ET (the first one, "7 ways the world could end", went up Oct 11).

## How the owner likes to work
- Quality over render speed: keep the two-step render (GPU master + careful CPU upload copy); don't trade
  picture quality for faster renders.
- Plain words, no jargon; show the frames you checked; say which files to upload.
- When asked "what do you think" / "is this normal": answer and wait, don't start building.
- Competitor videos stay in the scratchpad, never in the repo.

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

## Ideas in the queue
- Long-form "7 ways the world could end" compilation: see `longform/PLAN.md`.
- Status Oct 12: moon-falls (Day 8, 66 s) and women-vanish (Day 9, 64 s) are finished, checked and in CAPTIONS.md.
  After these two, no finished Short is left: a new one is needed for the following day.
- Proven topics not built yet: a black hole follow-up (e.g. through the Moon); more "X disappears" topics.
