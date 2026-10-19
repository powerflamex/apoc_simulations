#!/usr/bin/env bash
# Re-render the given projects from scratch (v4: action from the first frame, camera moves),
# then make the upload copies (with the channel watermark).   usage: bash render-v4.sh asteroid sun-vanishes
# bash render-v4.sh --copy-only asteroid   remakes just the upload copy from the existing video
# The upload copy is compressed on the CPU (lowest priority, 4 of the 8 cores, so the PC stays usable) piece by
# piece while the GPU renders; then older videos in that
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
# The channel watermark (branding/lunarzone_watermark_text.png: small, half see-through text) is stamped on the
# upload copy, top-left in line with the counter (same settings in render.mjs). It stays off for the first 3 s (frame 0 is only the question and the number) and fades out
# before the loop point (video length minus ~1 s) so the last frame still matches the first.
WM="$PWD/branding/lunarzone_watermark_text.png"
upload_copy() {
  local d=$1 m=$2 t=$SECONDS
  local out=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$m" | awk '{print $1 - 1.0 - 1.8}')
  nice -n 19 ffmpeg -y -loglevel error -i "$m" -framerate 60 -loop 1 -i "$WM" -filter_complex     "[1:v]format=rgba,colorchannelmixer=aa=0.5,fade=in:st=3:d=0.5:alpha=1,fade=out:st=$out:d=1:alpha=1[w];[0:v][w]overlay=74:180:shortest=1[v]"     -map "[v]" -map 0:a -c:v libx264 -threads 4 -preset medium -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart "${m%.mp4}_tiktok.mp4" \
    && echo "$d done: ${m%.mp4}_tiktok.mp4 (upload copy $((SECONDS - t)) s)" && clean_old "$d" "$m" || echo "$d upload copy FAILED"
}
# --copy-only: skip the render and just remake the upload copies from the videos already in out/
COPY_ONLY=; [ "$1" = --copy-only ] && { COPY_ONLY=1; shift; }
# projects live in week folders ("week 2/earth-stops"); a bare name is looked up there
find_dir() { local w; [ -d "$1" ] && { echo "$1"; return; }; for w in week*/"$1"; do [ -d "$w" ] && { echo "$w"; return; }; done; echo "$1"; }
for p in "$@"; do
  d=$(find_dir "$p")
  case $(basename "$d") in
    asteroid) name=asteroid_island_v4 ;;
    sun-vanishes) name=sun-vanishes_alpine_v4 ;;
    black-hole) name=black-hole_v4 ;;
    *) name=$(basename "$d")_v4 ;;
  esac
  [ -n "$COPY_ONLY" ] && { upload_copy "$d" "$d/out/${name}_1080x1920_60fps.mp4" & continue; }
  # a new project folder needs its packages once (three.js, the renderer's Chrome driver, the font)
  [ -d "$d/node_modules" ] || (cd "$d" && npm install --no-audit --no-fund --loglevel=error) || { echo "$d: npm install FAILED"; continue; }
  rm -rf "$d/out/.segments"
  t=$SECONDS
  # render.mjs makes the upload copy itself, piece by piece while it renders (the CPU is idle while the GPU draws)
  (cd "$d" && node render.mjs --out "out/${name}_1080x1920_60fps.mp4" --upload "out/${name}_1080x1920_60fps_tiktok.mp4"     --watermark "$WM" > out_render_v4.log 2>&1) || { echo "$d FAILED (see $d/out_render_v4.log)"; continue; }
  echo "$d done in $((SECONDS - t)) s ($(grep -m1 '^encoder:' "$d/out_render_v4.log")): $d/out/${name}_1080x1920_60fps_tiktok.mp4"
  clean_old "$d" "$d/out/${name}_1080x1920_60fps.mp4"
done
wait
echo "all done in $(((SECONDS - T0) / 60)) min $(((SECONDS - T0) % 60)) s"
