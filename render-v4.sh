#!/usr/bin/env bash
# Render the given projects (v4: action from the first frame, camera moves) and their TikTok upload copies.
#   usage: bash render-v4.sh asteroid sun-vanishes
# One pass per project: render.mjs --upload writes the master and the _tiktok.mp4 copy together.
# Finished segments are reused only if the page source is unchanged, so nothing has to be deleted first.
cd "$(dirname "$0")"
for d in "$@"; do
  case $d in
    asteroid) name=asteroid_island_v4 ;;
    sun-vanishes) name=sun-vanishes_alpine_v4 ;;
    black-hole) name=black-hole_v4 ;;
    *) name=${d}_v4 ;;
  esac
  (cd "$d" && node render.mjs --upload --out "out/${name}_1080x1920_60fps.mp4" > out_render_v4.log 2>&1) || { echo "$d FAILED (see $d/out_render_v4.log)"; continue; }
  echo "$d done"
done
echo "all done"
