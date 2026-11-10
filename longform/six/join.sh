#!/usr/bin/env bash
# Join "6 more ways the world could end": the flash-forward intro, the 6 parts (#6 .. #1) each with its gold "#N"
# over its opening question, cross-fades between parts (each ends inside its white / water cover), and the outro.
# Output: longform/out/6-more-ways-the-world-ends_1920x1080.mp4 (x264 CRF 18, the careful upload-quality encode,
# on 4 cores at low priority so the PC stays usable).
cd "$(dirname "$0")"
OUT=../out/6-more-ways-the-world-ends_1920x1080.mp4
mkdir -p ../out
parts=(parts/0[1-6]_*.mp4)
[ ${#parts[@]} -eq 6 ] || { echo "need all 6 parts in longform/six/parts (have ${#parts[@]})"; exit 1; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
XF=0.8     # cross-fade between parts
XI=0.25    # intro (ends white) into #6
inputs=(-i clips/intro.mp4 -i clips/outro.mp4); filt=""
filt+="[0:v]fps=60,format=yuv420p,settb=1/60000[intro];[0:a]aresample=48000,aformat=channel_layouts=stereo[introa];"
filt+="[1:v]fps=60,format=yuv420p,settb=1/60000[outro];[1:a]aresample=48000,aformat=channel_layouts=stereo[outroa];"
i=2
for p in "${parts[@]}"; do
  num=$((8 - i))
  inputs+=(-i "$p" -loop 1 -t 4 -i "clips/num$num.png")
  vi=$(( 2 + (i - 2) * 2 )); ni=$((vi + 1))
  filt+="[$ni:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1,fade=out:st=3.3:d=0.6:alpha=1[n$i];"
  filt+="[$vi:v]fps=60,format=yuv420p,settb=1/60000[b$i];[b$i][n$i]overlay=0:0:eof_action=pass,format=yuv420p[v$i];"
  filt+="[$vi:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
  i=$((i + 1))
done
prev="intro"; preva="introa"; off=$(awk "BEGIN{print $(dur clips/intro.mp4) - $XI}"); xf=$XI
for j in 0 1 2 3 4 5; do
  k=$((j + 2))
  filt+="[$prev][v$k]xfade=transition=fade:duration=$xf:offset=$off[x$j];[$preva][a$k]acrossfade=d=$xf[y$j];"
  prev="x$j"; preva="y$j"
  off=$(awk "BEGIN{print $off + $(dur "${parts[$j]}") - $XF}"); xf=$XF
done
filt+="[$prev][outro]xfade=transition=fade:duration=$XF:offset=$off[vout];[$preva][outroa]acrossfade=d=$XF[aout]"
t=$SECONDS
nice -n 10 ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filt" -map "[vout]" -map "[aout]" \
  -c:v libx264 -threads 4 -preset medium -crf 18 -maxrate 16M -bufsize 32M -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k \
  -movflags +faststart "$OUT" \
  && echo "joined: longform/out/$(basename "$OUT") ($((SECONDS - t)) s, $(dur "$OUT") s long)" || echo "join FAILED"
# YouTube chapters: where each part starts in the joined video (the first one must be 0:00, so #6 includes the intro)
off=$(awk "BEGIN{print $(dur clips/intro.mp4) - $XI}")
names=("Earth stops spinning" "Every woman disappears" "Yellowstone erupts" "The Moon falls" "Gravity doubles" "The end of the universe")
for j in 0 1 2 3 4 5; do
  s=$(awk "BEGIN{printf \"%d\", $off}"); [ $j -eq 0 ] && s=0
  printf '%d:%02d #%d %s\n' $((s / 60)) $((s % 60)) $((6 - j)) "${names[$j]}"
  off=$(awk "BEGIN{print $off + $(dur "${parts[$j]}") - $XF}")
done > chapters.txt
cat chapters.txt
