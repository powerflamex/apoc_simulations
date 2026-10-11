#!/usr/bin/env bash
# Render the 7 parts of the long-form video in 16:9 (1920x1080, 60 fps), each ending inside its full cover
# (no loop tail), then join them: bash longform/render-parts.sh [part ...]   (no args = all 7, then join)
# Re-rendering one part after a fix:  bash longform/render-parts.sh black-hole   (then: bash longform/join.sh)
cd "$(dirname "$0")/.."
PARTS=(asteroid earth-spins sun-vanishes earth-falls black-hole speed-doubles electrons)   # #7 .. #1
[ $# -gt 0 ] && PARTS=("$@")
mkdir -p longform/parts
T0=$SECONDS
for d in "${PARTS[@]}"; do
  n=$(printf '%s\n' asteroid earth-spins sun-vanishes earth-falls black-hole speed-doubles electrons | grep -nx "$d" | cut -d: -f1)
  # end of the part = the moment the loop would start (the cover is full there)
  end=$(cd "$d" && node -e "import('./src/timeline.js').then((T) => console.log((T.VIDEO_DURATION - T.LOOP).toFixed(3)))")
  rm -rf "$d/out/.segments"            # never reuse the tall Shorts segments
  t=$SECONDS
  (cd "$d" && node render.mjs --wide --end "$end" --out "../longform/parts/$(printf '%02d' "$n")_$d.mp4" > ../longform/parts/$d.log 2>&1) \
    && echo "$d: rendered to $end s in $((SECONDS - t)) s" || echo "$d FAILED (see longform/parts/$d.log)"
  rm -rf "$d/out/.segments"
done
[ $# -eq 0 ] && bash longform/join.sh
echo "all done in $(((SECONDS - T0) / 60)) min $(((SECONDS - T0) % 60)) s"
