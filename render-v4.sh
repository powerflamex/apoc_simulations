#!/usr/bin/env bash
# Re-render the given projects from scratch (v4: action from the first frame, camera moves),
# then make the TikTok upload copies.   usage: bash render-v4.sh asteroid sun-vanishes
# Each upload copy is compressed in the background while the next video renders.
cd "$(dirname "$0")"
T0=$SECONDS
upload_copy() {
  local d=$1 m=$2 t=$SECONDS
  ffmpeg -y -loglevel error -i "$m" -c:v libx264 -preset medium -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart "${m%.mp4}_tiktok.mp4" \
    && echo "$d done: ${m%.mp4}_tiktok.mp4 (upload copy $((SECONDS - t)) s)" || echo "$d upload copy FAILED"
}
for d in "$@"; do
  case $d in
    asteroid) name=asteroid_island_v4 ;;
    sun-vanishes) name=sun-vanishes_alpine_v4 ;;
    black-hole) name=black-hole_v4 ;;
    *) name=${d}_v4 ;;
  esac
  rm -rf "$d/out/.segments"
  t=$SECONDS
  (cd "$d" && node render.mjs --out "out/${name}_1080x1920_60fps.mp4" > out_render_v4.log 2>&1) || { echo "$d FAILED (see $d/out_render_v4.log)"; continue; }
  echo "$d rendered in $((SECONDS - t)) s ($(grep -m1 '^encoder:' "$d/out_render_v4.log"))"
  upload_copy "$d" "$d/out/${name}_1080x1920_60fps.mp4" &
done
wait
echo "all done in $(((SECONDS - T0) / 60)) min $(((SECONDS - T0) % 60)) s"
