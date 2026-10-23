# Long video: "What if you watched the universe die?" (the heat death)

16:9 (1920x1080, 30 fps), 6:14, to be narrated by the owner (script: `longform/heat-death/SCRIPT.md`). Third of the
"how the universe ends" set, promised at the end of the Big Crunch ("That ending is even stranger. And it's the one
I'm simulating next."): the Big Rip (torn apart), the Big Crunch (crushed), this one (frozen, faded out).
Its own video with its own title, not "Part 3".

Place (new, Oct 22): the stone terrace of an observatory on a ridge, 300 m above a city that spreads west to the
horizon (a street grid with a boulevard every mile, freeways, downtown's towers, mountains on the right), the
observatory's copper dome on the right. People strolling and watching the sunset at the railing. Project:
`longform/heat-death/`, a new scene; the long-video parts (overlay, counter with a NEXT line, the big word at each
step, voice placement, render) from `longform/big-crunch/`, the black hole's light-bending from the black-hole Short.

Topic check (web, Oct 22): no ground-level "you are standing there" heat-death sim with a counter turned up; the big
ones are explainers and the all-endings timelapses (melodysheep, Stargaze). None of the clone channels has it.

## The science (numbers we say out loud)
- Space keeps growing, faster and faster, forever (dark energy): the standard picture most scientists expect.
- ~5 billion years: the Sun runs out of hydrogen in its core and swells into a red giant (~200x wider); ~7.6-8 billion:
  it sheds its outer layers (a planetary nebula) and its core is left, a white dwarf about Earth's size. "Imagine
  Earth is still here" (it may be swallowed). Around a white dwarf Earth would freeze to roughly -230 °C, below the
  freezing points of nitrogen (-210) and oxygen (-218): the air freezes and falls as snow.
- ~2 trillion years: every galaxy beyond our own (the Milky Way merged with Andromeda) has gone past the horizon;
  astronomers born then would see only one galaxy (Krauss & Scherrer 2007, "The Return of a Static Universe").
- ~100 trillion (10^14): the gas for new stars runs out; the last stars, small red dwarfs that live trillions of
  years, die (Adams & Laughlin 1997, "A Dying Universe"). ~10^15: white dwarfs have cooled into black dwarfs.
- Dead stars collide now and then and flare. Over ~10^19-10^20 years the galaxy evaporates: most dead stars are
  flung out, the rest fall into the central black hole (Earth is imagined to fall in with them).
- ~10^40 years: if protons decay (never seen; half-life over ~10^34 years), every atom is gone.
- Black holes evaporate by Hawking radiation: a star's mass in ~10^67 years; the biggest (~10^11 suns, as ours is
  after eating ~a tenth of the galaxy) in ~10^100, a googol. They end in a flash.
- After that: almost nothing, a hair above absolute zero, forever.
- Roger Penrose (Nobel 2020), conformal cyclic cosmology: with nothing left but light there is no way to tell big
  from small, so the cold empty universe may become the next Big Bang. The video says "a wild idea".

## What the viewer sees and hears, 0:00 to the end
On screen the whole time: the title for the first ~6 s, the counter **YEARS FROM NOW** (racing, braking at each step;
past 10^15 as a power of ten) with a **NEXT: ...** line, and from the freeze a second number: **EARTH: -230 °C**, then
**EMPTY SPACE: -273.1499... °C**. A big word pops at each step. The voice goes quiet for the big moments.

| Time | Picture | Counter / NEXT |
|---|---|---|
| 0:00-0:06 | **Flash-forward:** the frozen white city under a black hole with a glowing disk. Title on frame 0: "What if you watched the universe die?" / "The last light goes out in a googol years." | 3 × 10^20 years / EARTH -268 °C |
| 0:06-0:35 | **The whole universe from outside:** a ball of galaxies, ours marked YOU ARE HERE; space speeds up and every other galaxy races away, reddening; ours goes red, then dark; points of light flash and go out (black holes), the last in the middle; black; then one point swells into a new Big Bang (0:30.6). White. | YEARS FROM NOW: today -> 10^100; A NEW UNIVERSE |
| 0:35-1:04 | The terrace at sunset: people walking and filming, the city's lights coming on below, cars on the boulevards, the dome on the right. | Today / NEXT: THE SUN DIES |
| 1:04-1:22 | Time races; the Sun swells into a huge red giant over the city, boiling; the sky turns red. | 5 billion years |
| 1:17-1:35 | It dissolves into glowing shells (red, pink, teal) sweeping across the sky; a tiny blinding white dwarf is left; the sky goes black in daytime, stars out at noon. | 8 billion / NEXT: THE GALAXIES LEAVE |
| 1:35-1:50 | Earth freezes (EARTH -230 °C), the city goes dark in patches, the air falls as glinting snow. **Silence.** | |
| 1:50-2:20 | Night: the merged galaxy, one big ball of stars; the coin telescope: a far galaxy redder, fainter, GONE FOR GOOD. | 20 billion -> 2 trillion |
| 2:20-2:59 | The stars go out, the brightest first, the rest redden; one red star left; it goes out (**silence**). The white-dwarf Sun fades to a dull red dot, then black. | 100 trillion / 1 quadrillion |
| 2:59-3:24 | The frozen city in the dark; two dead stars crash: a flash lights it all (3:06). | 10^16 -> 10^19 |
| 3:24-3:41 | A black hole grows overhead, its disk lighting the frozen city orange. **Silence.** | 10^20 / NEXT: ATOMS |
| 3:41-4:05 | Atoms fall apart: the terrace, the city and you crumble into rising sparks. **Silence.** | 10^40 / EMPTY SPACE |
| 4:05-4:51 | You float in the dark under the black hole's faint ring (Hawking glow); far black holes flash out; it shrinks, hotter, brighter... the last flash, white (4:45.5). **Silence.** | 10^67 -> 10^100 |
| 4:51-5:16 | Nothing: black, the last light's afterglow spreading away. "Forever." "The heat death." | 10^100+ |
| 5:16-5:46 | Penrose: the empty universe from outside, a faint red shell; the camera pulls back until it's one point, which turns white-hot and bursts: a new Big Bang (5:39.5). White. | 10^1000 ... |
| 5:46-6:14 | White clears onto the terrace at sunset (the end returns to the start). "It just fades out." / "Which ending scares you most?" | |

Thumbnail: the black hole over the frozen city with **THE HEAT DEATH** in big gold letters (like the Big Rip's and
the Big Crunch's).

## Build notes
- `src/layout.js` (where everything is, the ridge's height), `terrain.js` (ridge + mountains), `basin.js` (the city:
  ground shader, ~100k light points thinned with distance so nothing shimmers, cars, buildings, downtown),
  `terrace.js` (terrace, parapet, observatory, coin telescope, lamps), `fx.js` (snow, flash light and evaporation
  shared by every material), `sky.js` (dusk, red giant, shells, white dwarf, stars going out, crashes, black hole,
  last flash), `demo.js` (the universe from outside, twice), `timeline.js` (story, counter, temperature).
- Voice: `src/voice.js` is empty until the recording; `node readalong.mjs` makes the read-along video from the
  finished draft. The audio cleanup in `audio.mjs` is the one that worked on his Big Crunch take.
