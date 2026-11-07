# Long video: "What if a nuke hit your city? Survive the first hour"

16:9 (1920x1080, 30 fps), 4:18 (5:31 before the Nov 7 rework), **no voiceover**. Project: `longform/nuke-hour/`. Built Nov 7 on the black hole long
video's format (`BLACK-HOLE-PASS.md`): a goal (survive the hour), your phone telling the story (texts from Mom, Dad and
Jay, a car radio's emergency broadcast), a counter racing all the way, chapter stamps, and a big visible moment every
45-60 s, each closer to you. The city, crowd, cars, fireball, cloud and blast are the Short's (`week 6/biggest-nuke`, owner
OK); new: your building's doorway, lobby and stairwell (`lobby.js`), the hour after (`after.js`: the wreck, the fires, the
firestorm wind, the gas main, the park on the crest, the ash) and the underground garage (`garage.js`).

## Why this topic (Nov 7 YouTube check, `research/learned.md`)
Survival videos are hot this month (405K "Day 1 to Day 30", 252K, 38K, 35K); plain "what if a nuke hit your city" copies
get under 100 views. Our angle: real time, from one person 13 miles away, with what a person should actually do.

## Order, as the viewer sees it (Nov 7 rework: 4:18)
| Video | Where | What happens |
|---|---|---|
| 0:00 | promenade (the Short's spot) | Flash-forward: the dust wall up the hill, the street on fire, a car thrown at the lens (slow motion), white. Title + BLAST REACHES YOU IN racing. |
| 0:05 | sidewalk outside your building | A normal evening, 8:41 PM: crowds, lights, your phone (Jay, Mom). |
| 0:12 | | The flash. You dash into the building's recessed doorway, out of the light. GET OUT OF THE LIGHT. BLAST REACHES YOU IN 45.00 s. |
| 0:14-0:54 | the doorway, cut every 5-6 s | Past the corner: the city goes dark (0:20). Your phone: No Service, "Not Delivered" (0:21). The people crouched beside you, crowds running outside (0:26). Over your shoulder: the street catching fire (0:32). The helicopter spinning down (0:38-0:41). The burning shops across the street (0:43). Up at the cloud (0:48). The dust wall coming up the hill, the tallest tower going (0:51). |
| 0:55 | lobby, stairwell door | "Get inside. Away from the windows." You run into the stairwell and get down. |
| 0:59-1:01 | | Slow motion: the lobby's glass bursts in, the door slams. |
| 1:01 | stairwell (7 s) | Dust, the emergency lamp; THE WIND COMES BACK yanks the door open. |
| 1:08 | lobby, the street | 5 MINUTES IN. Out through the wrecked lobby; the whole city on fire; then straight up at the cloud over you (1:19, IT'S RIGHT ABOVE YOU). |
| 1:44 | promenade | 10 MINUTES IN. The cloud is 40 miles high and 60 wide. YOUR BUILDING IS ON FIRE; a burning piece of its front peels off and lands near you (2:00). THE WIND TURNS TOWARD THE FIRE. |
| 2:20 | walking down the avenue | 20 MINUTES IN. Into the firestorm wind: paper, sheet metal and burning bits fly at you. A GAS MAIN EXPLODES 17 m ahead (2:38). |
| 2:50 | the park on the crest | 30 MINUTES IN. The city below is one fire (THE FIRES BECOME ONE). Ash starts falling (3:17). "Get under concrete." |
| 3:35 | underground garage (30 s) | 45 MINUTES IN. Down the ramp; the radio's emergency broadcast; people along the wall; your phone: one bar, Delivered, Mom and Dad reply one by one (A TEXT GETS THROUGH); sirens at the top of the ramp. |
| 4:05 | | 1:00:00.00: YOU MADE IT THROUGH THE FIRST HOUR. White, "Would you have made it?" |

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
- The heli, the tower and the dust wall are shown in zoomed-in views past the corner (a camera, not your eyes).
- The dust wall is drawn taller than real so it can be seen from miles off (the Short's note).
- Rescue in the first hour this close is optimistic; the video only shows sirens arriving, not a rescue.
- No one is shown hurt (no gore): the city, the fire, the wreck, and people sheltering.

## Build and render
Stills: `node render.mjs --stills 15,60,96,230` in `longform/nuke-hour/`. Render: `bash ../../render-gate.sh nuke-hour-long
node render.mjs --upload ../out/nuke-hour_1920x1080.mp4` (upload copy: `longform/out/nuke-hour_1920x1080.mp4`).
Thumbnail: `node render.mjs --cover 40`, copied to `longform/out/nuke-hour_thumb.png`.
