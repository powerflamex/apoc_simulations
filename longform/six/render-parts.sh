#!/usr/bin/env bash
# "6 more ways the world could end": render the 6 parts in 16:9 (1920x1080, 60 fps), each ending inside its full
# cover (no loop tail), one at a time:  bash longform/six/render-parts.sh [part ...]   (no args = all 6)
# Then: bash longform/six/cards.sh (intro + outro) and bash longform/six/join.sh
cd "$(dirname "$0")"
HERE=$PWD; ROOT=$(cd ../.. && pwd)
ORDER=(earth-stops women-vanish yellowstone moon-falls gravity-doubles big-crunch)   # #6 .. #1
PARTS=("${ORDER[@]}"); [ $# -gt 0 ] && PARTS=("$@")
mkdir -p parts
T0=$SECONDS
for d in "${PARTS[@]}"; do
  n=$(printf '%s\n' "${ORDER[@]}" | grep -nx "$d" | cut -d: -f1)
  dir=$(ls -d "$ROOT"/week*/"$d" | head -1)
  end=$(cd "$dir" && node -e "import('./src/timeline.js').then((T) => console.log((T.VIDEO_DURATION - T.LOOP).toFixed(3)))")
  rm -rf "$dir/out/.segments"            # never reuse the tall Shorts segments
  t=$SECONDS
  (cd "$dir" && nice -n 10 node render.mjs --wide --end "$end" --out "$HERE/parts/$(printf '%02d' "$n")_$d.mp4" > "$HERE/parts/$d.log" 2>&1) \
    && echo "$d: rendered to $end s in $((SECONDS - t)) s" || echo "$d FAILED (see longform/six/parts/$d.log)"
  rm -rf "$dir/out/.segments"
done
echo "all done in $(((SECONDS - T0) / 60)) min $(((SECONDS - T0) % 60)) s"
