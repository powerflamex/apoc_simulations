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
first four; the grade flips cool -> fiery on each drop.

The camera makes one long move per section and surges forward on each beat; it only whips on the two drops
and the turn into the second phrase (~6.1 s). Its blur follows its real speed.

## To redo with other pictures

Put `character.webp` (on white) and `shrine.webp` in a folder, then:

    python -P prep/depth.py <that folder> <depth model .onnx> <work folder>
    python -P prep/layers.py <that folder> <work folder> assets

The puppet's pivots (neck, grip, hips) and the enclosed see-through gaps are set by eye for this character:
see the numbers in `scene.js` (vertex shader) and the label list in `layers.py`.
