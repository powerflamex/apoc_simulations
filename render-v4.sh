#!/usr/bin/env bash
# Re-render the given projects from scratch (v4: action from the first frame, camera moves),
# then make the TikTok upload copies.   usage: bash render-v4.sh asteroid sun-vanishes
# Each upload copy is compressed in the background while the next video renders; then older videos in that
# project's out/ are deleted (only the new video and its upload copy are kept).
cd "$(dirname "$0")"
T0=$SECONDS
# keep only the video just made and its upload copy in the project's out folder (no old versions)
clean_old() {
  local d=$1 m=$2 f
  for f in "$d"/out/*.mp4; do
    [ -e "$f" ] || continue
    [ "$f" = "$m" ] || [ "$f" = "${m%.mp4}_tiktok.mp4" ] || { rm -f "$f"; echo "$d: removed old $(basename "$f")"; }
  done
}
upload_copy() {
  local d=$1 m=$2 t=$SECONDS
  ffmpeg -y -loglevel error -i "$m" -c:v libx264 -preset medium -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart "${m%.mp4}_tiktok.mp4" \
    && echo "$d done: ${m%.mp4}_tiktok.mp4 (upload copy $((SECONDS - t)) s)" && clean_old "$d" "$m" || echo "$d upload copy FAILED"
}
for d in "$@"; do
  case $d in
    asteroid) name=asteroid_island_v4 ;;
    sun-vanishes) name=sun-vanishes_alpine_v4 ;;
    black-hole) name=black-hole_v4 ;;
    *) name=${d}_v4 ;;
  esac
  # a new project folder needs its packages once (three.js, the renderer's Chrome driver, the font)
  [ -d "$d/node_modules" ] || (cd "$d" && npm install --no-audit --no-fund --loglevel=error) || { echo "$d: npm install FAILED"; continue; }
  rm -rf "$d/out/.segments"
  t=$SECONDS
  (cd "$d" && node render.mjs --out "out/${name}_1080x1920_60fps.mp4" > out_render_v4.log 2>&1) || { echo "$d FAILED (see $d/out_render_v4.log)"; continue; }
  echo "$d rendered in $((SECONDS - t)) s ($(grep -m1 '^encoder:' "$d/out_render_v4.log"))"
  upload_copy "$d" "$d/out/${name}_1080x1920_60fps.mp4" &
done
wait
echo "all done in $(((SECONDS - T0) / 60)) min $(((SECONDS - T0) % 60)) s"
