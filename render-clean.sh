#!/usr/bin/env bash
# Re-render all three without film grain, plus upload copies (60fps) and 30fps upload copies.
cd "$(dirname "$0")"
for d in black-hole sun-vanishes asteroid; do
  (cd $d && node render.mjs --out out/${d}_1080x1920_60fps_v2.mp4 > out_render_v2.log 2>&1) || { echo "$d FAILED"; continue; }
  m=$d/out/${d}_1080x1920_60fps_v2.mp4
  ffmpeg -y -loglevel error -i $m -c:v libx264 -preset slow -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart ${m%.mp4}_tiktok.mp4
  ffmpeg -y -loglevel error -i $m -vf fps=30 -c:v libx264 -preset slow -crf 17 -maxrate 20M -bufsize 40M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart $d/out/${d}_1080x1920_30fps_v2_tiktok.mp4
  echo "$d done"
done
echo "all done"
