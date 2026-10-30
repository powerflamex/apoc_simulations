# Long video: "What if a black hole passed Earth?"

16:9 (1920x1080, 30 fps), about 5:40, **no voiceover** (owner, Oct 26). A new project (`longform/black-hole-pass/`):
new scenes (a night avenue with giant screens, a jammed highway to the airport, a subway platform, space), only the
shared blocks reused (people, cars, the render/compositor code, the lensing math and facade shader of the Short).

## Why this topic (Oct 26 YouTube check, `research/longform_topics_2026-10-26.md`)
The owner picked "stop time" first, but it is taken (IFOLOGY 593K in 10 days + ~8 copies), like every superpower.
A black hole passing Earth is the channel's biggest Short (1.9M) and no long version has more than 443 views.

## What carries it without a voice (owner: "make it more engaging")
- **A goal: survive.** You keep trying (get out of the city, the last flight, the subway) and keep almost making it.
- **Your phone tells the story:** text messages from Mom, Dad and your friend Jay, and emergency alerts, as
  notification cards top right.
- **The giant screens explain the science:** headlines and LIVE pictures from space on the avenue's screens.
- **A counter racing all the way:** BLACK HOLE · miles away (a chapter stamp says the time left). Then YOUR WEIGHT.
- **A bigger moment every ~45 s,** each one closer to you: Neptune, Saturn, Jupiter, the flights, the Moon, the
  flood, gravity flipping, the fall in.

## Order, as the viewer sees it
| Video | Where | What happens |
|---|---|---|
| 0:00 | avenue | Flash-forward: the avenue curling up into the sky toward the hole, things falling up. Title + BLACK HOLE · MILES AWAY racing down from 51,022. |
| 0:05 | avenue, night | "56 DAYS LEFT". A busy night: crowds, cabs, giant screens. Every phone buzzes: EMERGENCY ALERT. |
| 0:12 | | You look up: a spot where the stars bend. Mom: "are you seeing this??" The screens switch to the news. |
| 0:24 | space (LIVE) | Neptune is stretched and torn apart. |
| 0:37 | avenue | Panic; NASA: it will pass between Earth and the Moon. |
| 0:50 | avenue | "19 DAYS LEFT". Suitcases, gridlock, EVACUATE COASTAL CITIES. Dad: "got us 3 seats. flight 9pm". |
| 1:02 | space (LIVE) | Saturn's rings are dragged into a spiral and swallowed. |
| 1:18 | avenue | Now you can see it: a dark spot with a faint ring. Mom: "leave NOW". |
| 1:35 | highway, dusk | "8 DAYS LEFT". The road to the airport is jammed for miles. |
| 1:46 | space (LIVE) | Jupiter is torn into a glowing streak; the disk flares. |
| 2:00 | highway | Jupiter's streak in the sky. "Flight 802: CANCELLED". People leave their cars and walk. |
| 2:30 | avenue | "1 HOUR LEFT". The hole overhead, its disk lighting the street orange; the Moon is pulled into a shard. ALERT: TAKE SHELTER UNDERGROUND. You run for the subway. |
| 3:20 | subway | "30 MINUTES LEFT". Crowded platform, rumbling, flickering lights. The ocean is pulled toward the hole: water bursts down the stairs and floods the tracks. Lights out. You climb out. |
| 4:12 | avenue | "7 MINUTES LEFT". Flooded street, the Moon gone into the disk. YOUR WEIGHT drops. Water, cars, people fall up. "i love you" - Not Delivered. The horizon peels up. |
| 5:00 | space | You fall up into it: Earth's debris stream behind you, the ring of light, white. |
| 5:30 | white | "Would you have made it?" |

## Oct 29 rework (owner, before posting)
- Opening: the hole shown close (giant glowing ring, bhD 15) high over the avenue, taxis and people falling up toward it,
  the title moved under the ring; BLACK HOLE · MILES AWAY racing from frame 0. The thumbnail is the same shot.
- Two stretches of the story are cut out of the video (`SKIPS` / `storyOf` in `src/timeline.js`; every module still
  runs on story time): the avenue between Neptune and Saturn (story 49-62: NASA, Mom, 19 DAYS LEFT and Dad now fit in
  37-49) and the end of the highway (146-150). 5:40 -> 5:23. Video times in the table above are story times: subtract
  13 s after 0:49 and 17 s after 2:26.
- Highway: darker dusk sky, less fog, a shorter look up at Jupiter.
- Text cards that arrive while a chapter stamp is up sit lower (they covered "19 DAYS LEFT"); shop windows dimmer.

## Oct 29, second pass (owner: "people physics is rly bad")
- People: crowd.js people face +z at yaw 0, and every scene had them facing -z, so everyone walked backwards (pose()
  now gets yaw + PI). The avenue's walkers move in lanes 0.7 m apart at one pace per lane, evenly spaced (nobody walks
  through anyone); standing crowds stand on a grid; nobody on your path; the view-clearing push only acts (smoothly)
  while you zoom in on the big screen; the subway runners walk down the stairs instead of vanishing. Gravity going:
  a slow drift up with arms out, then an eased-in fall up (no hopping, no snapping into the flail). Highway: everyone
  by their car from the start, one pace. Subway: spots on a grid, everyone leaves at once at one pace in lanes; you
  run in a free lane by the wall.
- New shots (story 219-225): outside (`src/coast.js`): the ocean heaped into a dome toward the hole, the surge over the
  seawall; then the avenue: a breaking wave racing down it and into the subway stairs. The subway flood moved 4 s later.
- Subway water: the torrent and the floor are one dark green water with flowing foam streaks.
- Pulled up: 292-306 in first person (looking down at the street dropping away, then up into the ring); everything
  after moved 6 s (the fall 306-337). STORY_END 346, video 5:29.

## Built (Oct 28)
Rendered and checked: `longform/out/black-hole-pass_1920x1080.mp4` (5:40; 5:23 after the Oct 29 rework), thumbnail `longform/out/black-hole-pass_thumb.png`,
posting copy in `CAPTIONS.md`. Render: `bash ../../render-gate.sh black-hole-pass-long node render.mjs --upload
../out/black-hole-pass_1920x1080.mp4` in `longform/black-hole-pass/` (~14 min drawing + ~5 min upload copy).
