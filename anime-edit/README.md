# embi edit (anime edit in the style of @kodoae2)

A one-off vertical 1080x1920 edit, not one of the "what if" sims. Two still pictures (a cut-out character and a
shrine background) turned into a moving 3D shot, cut to an 11 s clip of the song.

## What is where

- `prep/depth.py`, `prep/layers.py`: run once on the two source pictures. They cut the character off its white
  background, measure depth in both pictures (Depth Anything V2 small), and split the shrine into four layers:
  sky, shrine, near rocks, water. Results land in `assets/` (not in git: the pictures, the song and the font stay local).
- `src/timeline.js`: the whole edit as a function of time: beat map of the song, camera shots, the puppet's moves,
  the colour flip, the text.
- `src/scene.js`: the 3D scene. Every layer is a mesh pushed out to its measured distance, so a moving camera gets
  real parallax. The water is a true flat surface. The character is one sheet bent in the vertex shader
  (head, hair, chest, spear, hips each with their own weight map).
- `src/post.js`: depth of field, bloom, streaks, zoom/whip blur, flares, lightning, grade, the word, grain.
- `render.mjs`: headless Chrome draws each frame, ffmpeg joins them with the song.

## Commands (from this folder)

    node render.mjs --stills 0.5,2.9        # single frames -> stills/
    bash ../render-gate.sh embi-edit node render.mjs   # the video -> out/embi_edit_1080x1920_60fps.mp4
    node server.mjs                          # live preview at http://127.0.0.1:5197/ (click for sound)

## Song map (seconds)

The song is DJ Javi26's "MONTAGEM MERZYN (Ultra Slowed)" from 16.249 s, 11.05 s long, turned down 7 dB (the
same cut kodoae2 used, but without the "kodo" tag on his sound). The beat is perfectly steady: every 0.6914 s
from 0.058 s (86.8 BPM). One 9-beat phrase played twice: heavy kicks on beats 0-3, drop on beat 4 (2.82 s);
heavy kicks on beats 9-12, drop on beat 13 (9.05 s). The head nods on every beat; the letters land on the
first four; the grade flips cool -> fiery on the first drop and stays fiery through the cut (like the reference),
back to cool only at the loop.

A deep voice spells the tag like kodoae2's spoken "kodo" tag (his: a deep voice falling from ~80 to ~60 Hz, on the
drop, with an echo): "E, M, B, I" on the first four beats (with the letters on screen), then "embi" on the first
drop, the music dipping under it. `python -P prep/voice_tag.py [voice]` makes it offline with Kokoro (voice bm_lewis, the owner's pick; each letter's attack is measured and put on its beat; model files in
`assets/kokoro/`, from github.com/thewh1teagle/kokoro-onnx releases, `pip install kokoro-onnx`), pitched down a
little with an octave-down copy, drive and echo, and writes `assets/song_tagged.wav`, which the video uses
(`assets/song.wav` stays the clean song). `python -P prep/voice_tag.py <voice> <file.wav>` writes a 4.5 s sample.

The camera copies the reference kodoae2 edit's motion, measured frame by frame (`prep/kodo_curves.py` ->
`src/kodo_curves.js`; the reference uses the same song cut, so the timing lines up): head-on to the shrine, a slow
zoom wave (out to the wide shot, in through the drop, out again, then straight into him for the cut on beat 8 at
5.59 s), a pendulum roll that swings fastest on each beat, a slow slide, and a one-frame jolt on every beat. The
second half plays mirrored, like the reference. Its blur follows its real speed.

His four arms each have joints (`scene.js`): they pump out with the nod on each beat, swing about 8 degrees side
to side with the camera's swing (the right forearm a little later), and flare out on the drops. On the drops his
body makes one push forward that eases back, with no spring rocking. `?armx=4` exaggerates them to check the joints.

## To redo with other pictures

Put `character.webp` (on white) and `shrine.webp` in a folder, then:

    python -P prep/depth.py <that folder> <depth model .onnx> <work folder>
    python -P prep/layers.py <that folder> <work folder> assets

The puppet's pivots (neck, grip, hips) and the enclosed see-through gaps are set by eye for this character:
see the numbers in `scene.js` (vertex shader) and the label list in `layers.py`.
