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

One 9-beat phrase (beat 0.691 s, 86.8 BPM) played twice. Heavy kicks at 0.06, 0.75, 1.44, 2.13, drop at 2.82;
again at 6.28, 6.97, 7.66, 8.35, drop at 9.04. The letters land on the first four kicks, the word glitches out
into the first drop, the grade flips cool -> fiery on each drop.

## To redo with other pictures

Put `character.webp` (on white) and `shrine.webp` in a folder, then:

    python -P prep/depth.py <that folder> <depth model .onnx> <work folder>
    python -P prep/layers.py <that folder> <work folder> assets

The puppet's pivots (neck, grip, hips) and the enclosed see-through gaps are set by eye for this character:
see the numbers in `scene.js` (vertex shader) and the label list in `layers.py`.
