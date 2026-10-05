#!/usr/bin/env bash
# Re-render the given projects from scratch (v4: action from the first frame, camera moves),
# then make the TikTok upload copies.   usage: bash render-v4.sh asteroid sun-vanishes
cd "$(dirname "$0")"
for d in "$@"; do
  case $d in
    asteroid) name=asteroid_island_v4 ;;
    sun-vanishes) name=sun-vanishes_alpine_v4 ;;
    black-hole) name=black-hole_v4 ;;
    *) name=${d}_v4 ;;
  esac
  rm -rf "$d/out/.segments"
  (cd "$d" && node render.mjs --out "out/${name}_1080x1920_60fps.mp4" > out_render_v4.log 2>&1) || { echo "$d FAILED"; continue; }
  m="$d/out/${name}_1080x1920_60fps.mp4"
  ffmpeg -y -loglevel error -i "$m" -c:v libx264 -preset slow -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart "${m%.mp4}_tiktok.mp4"
  echo "$d done"
done
echo "all done"
