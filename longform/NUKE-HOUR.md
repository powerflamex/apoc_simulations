# Long video: "What if a nuke hit your city? Survive the first hour"

16:9 (1920x1080, 30 fps), 5:31, **no voiceover**. Project: `longform/nuke-hour/`. Built Nov 7 on the black hole long
video's format (`BLACK-HOLE-PASS.md`): a goal (survive the hour), your phone telling the story (texts from Mom, Dad and
Jay, a car radio's emergency broadcast), a counter racing all the way, chapter stamps, and a big visible moment every
45-60 s, each closer to you. The city, crowd, cars, fireball, cloud and blast are the Short's (`week 6/biggest-nuke`, owner
OK); new: your building's doorway, lobby and stairwell (`lobby.js`), the hour after (`after.js`: the wreck, the fires, the
firestorm wind, the gas main, the park on the crest, the ash) and the underground garage (`garage.js`).

## Why this topic (Nov 7 YouTube check, `research/learned.md`)
Survival videos are hot this month (405K "Day 1 to Day 30", 252K, 38K, 35K); plain "what if a nuke hit your city" copies
get under 100 views. Our angle: real time, from one person 13 miles away, with what a person should actually do.

## Order, as the viewer sees it
| Video | Where | What happens |
|---|---|---|
| 0:00 | promenade (the Short's spot) | Flash-forward: the dust wall up the hill, the street on fire, a car thrown at the lens (slow motion), white. Title + BLAST REACHES YOU IN racing. |
| 0:05 | sidewalk outside your building | A normal evening, 8:41 PM: crowds, lights, your phone (Jay: "where are you? it starts at 9", Mom). |
| 0:12 | | The flash. You dash back into the building's recessed doorway, out of the light. GET OUT OF THE LIGHT. Counter: BLAST REACHES YOU IN 45.00 s, 13.35 MILES AWAY. |
| 0:15-0:53 | the doorway | The Short's 45 seconds, from the shade: the city goes dark, cars crash, people run, the street catches fire, the helicopter goes down, the cloud fills the sky, the towers fall. "Not Delivered" to Mom. |
| 0:53 | lobby | "Get inside. Away from the windows." You run through the lobby into the stairwell and get down. |
| 0:58-1:00 | stairwell door | Slow motion: the lobby's glass front bursts in, shards fly at you, the door slams. |
| 1:00 | stairwell | Dark, dust, the emergency light; the door rattles; THE WIND COMES BACK yanks it open. Counter: SURVIVE THE FIRST HOUR, DANGER NOW: THE BLAST. |
| 1:18 | lobby, then the street | 5 MINUTES IN. Glass everywhere, out into the street: wrecked cars, fires in every block, the cloud overhead. THE WHOLE CITY IS ON FIRE. DANGER NOW: FIRE. |
| 2:08 | promenade | 10 MINUTES IN. The cloud is 40 miles high and 60 miles wide: you're under it. YOUR BUILDING IS ON FIRE; a burning slab falls off it. THE WIND TURNS TOWARD THE FIRE. |
| 2:58 | walking down the avenue | 20 MINUTES IN. Into the wind, between the fires, embers streaming past. A GAS MAIN EXPLODES ahead of you. |
| 3:35 | the park on the crest | 30 MINUTES IN. The whole city below is one fire under the stem of the cloud (THE FIRES BECOME ONE). Then SOMETHING IS FALLING: ash. DANGER NOW: FALLOUT. "Get under concrete." |
| 4:25 | underground garage | 45 MINUTES IN. People sheltering, battery lamps, a car radio's emergency broadcast ("Stay inside 24 hours"). Take off your outer layer. One bar: A TEXT GETS THROUGH. Mom, Dad, Jay reply. Sirens down the ramp: HELP IS ON THE WAY. |
| 5:18 | | The counter reaches 1:00:00.00: YOU MADE IT THROUGH THE FIRST HOUR. White. |
| 5:24 | | "Would you have made it?" |

## The numbers (every one on screen is real; sources in `src/timeline.js` and `src/short.js`)
- 50 Mt (the Tsar Bomba's real yield), set off 2.5 miles (4 km) up, you 13.35 miles from ground zero.
- The blast: 47 s after the flash (Glasstone & Dolan's 1 Mt sequence scaled by the cube root of the yield), ~860 mph as it
  reaches you, 5 psi, 160 mph wind behind it. The wind reverses a few seconds later (the negative phase).
- The heat: a 50 Mt fireball's light peaks ~5 s in and keeps coming for ~50 s (Glasstone: t_max = 0.0417 W^0.44 s, most of
  the energy by 10 t_max); at 13 miles it is about 100 cal/cm^2 in the open, enough to light clothes, wood and awnings.
  Hence: out of the light in the first second, stay in the shade.
- The cloud: 42 miles (67 km) high, 59 miles (95 km) wide at the test (shown at ~10 min: big clouds stop rising then).
- Windows broken 560 miles (900 km) away at the test.
- Fallout: the test's fireball never touched the ground and the bomb was 97% fusion (the site was safe two hours later),
  so the ash in the park is from the fires; the advice is the same either way (Ready.gov/CDC: get inside, stay inside
  24 hours, take off your outer layer, which holds most of what fell on you).
- Fire: the firestorm pulls wind in toward the fires (Hiroshima's began ~20 min in); smoke kills more people than flames;
  open ground, upwind, is the safe place; broken gas lines feed the fires.

## Not to scale / honest notes
- The fireball's picture runs a few seconds ahead of the clock in the first ~40 s (as in the Short), so it has its shape.
- From the doorway you can see the fireball's edge past the corner; in reality the corner that hides you hides it too.
- The dust wall is drawn taller than real so it can be seen from miles off (the Short's note).
- Rescue in the first hour this close is optimistic; the video only shows sirens arriving, not a rescue.
- No one is shown hurt (no gore): the city, the fire, the wreck, and people sheltering.

## Build and render
Stills: `node render.mjs --stills 15,60,96,230` in `longform/nuke-hour/`. Render: `bash ../../render-gate.sh nuke-hour-long
node render.mjs --upload ../out/nuke-hour_1920x1080.mp4` (upload copy: `longform/out/nuke-hour_1920x1080.mp4`).
Thumbnail: `node render.mjs --cover 42`, copied to `longform/out/nuke-hour_thumb.png`.
