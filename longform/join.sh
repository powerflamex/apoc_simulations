#!/usr/bin/env bash
# Join the rendered parts into the long-form video: an intro card, each part with its "#N" number over its
# opening title, cross-fades between parts (each ends inside its white / water / ice cover), and an outro card.
# Output: longform/out/7-ways-the-world-ends_1920x1080.mp4 (x264 CRF 18, the careful upload-quality encode).
cd "$(dirname "$0")"
mkdir -p out
FONT="C\\:/Windows/Fonts/georgia.ttf"
FONTB="C\\:/Windows/Fonts/georgiab.ttf"
names=("" "Asteroid" "Earth spins 17x faster" "The Sun vanishes" "Earth stops orbiting" "A black hole passes by" "Your speed doubles" "Every electron disappears")
parts=(parts/0[1-7]_*.mp4)
[ ${#parts[@]} -eq 7 ] || { echo "need all 7 parts in longform/parts (have ${#parts[@]})"; exit 1; }
XF=0.8   # cross-fade seconds
inputs=() ; filt="" ; i=0
# intro card (4 s, black) and outro card (5 s)
filt+="color=c=black:s=1920x1080:r=60:d=4,drawtext=fontfile='$FONTB':text='7 ways the world could end':fontsize=96:fontcolor=0xf4efe6:x=(w-tw)/2:y=(h-th)/2-40:alpha='min(1,t/0.6)',drawtext=fontfile='$FONT':text='from bad to total annihilation':fontsize=48:fontcolor=0xe8dfd0:x=(w-tw)/2:y=(h)/2+60:alpha='min(1,max(0,(t-0.8)/0.6))',format=yuv420p[intro];"
filt+="anullsrc=r=48000:cl=stereo,atrim=0:4[introa];"
for p in "${parts[@]}"; do
  inputs+=(-i "$p")
  k=$((8 - i - 1)); num=$((7 - i))
  # "#N" badge + the part's name for its first 4 s
  filt+="[$i:v]fps=60,format=yuv420p,drawtext=fontfile='$FONTB':text='#$num':fontsize=150:fontcolor=0xf1c978:borderw=4:bordercolor=black@0.55:shadowcolor=black@0.5:shadowx=0:shadowy=4:x=(w-tw)/2:y=90:alpha='if(lt(t,3.4),min(1,t/0.4),max(0,(4-t)/0.6))',drawtext=fontfile='$FONT':text='${names[$((i + 1))]}':fontsize=50:fontcolor=0xf4efe6:borderw=3:bordercolor=black@0.55:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-tw)/2:y=260:alpha='if(lt(t,3.4),min(1,t/0.4),max(0,(4-t)/0.6))'[v$i];"
  filt+="[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
  i=$((i + 1))
done
filt+="color=c=white:s=1920x1080:r=60:d=5,drawtext=fontfile='$FONTB':text='Which one scares you most?':fontsize=88:fontcolor=0x1a1a1a:x=(w-tw)/2:y=(h-th)/2-30:alpha='min(1,t/0.6)',drawtext=fontfile='$FONT':text='Tell me in the comments':fontsize=44:fontcolor=0x333333:x=(w-tw)/2:y=(h)/2+70:alpha='min(1,max(0,(t-0.8)/0.6))',format=yuv420p[outro];"
filt+="anullsrc=r=48000:cl=stereo,atrim=0:5[outroa];"
# chain with cross-fades: intro -> part 1 -> ... -> part 7 -> outro
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
prev="intro"; preva="introa"; off=$(awk "BEGIN{print 4 - $XF}")
for j in $(seq 0 6); do
  filt+="[$prev][v$j]xfade=transition=fade:duration=$XF:offset=$off[x$j];[$preva][a$j]acrossfade=d=$XF[y$j];"
  prev="x$j"; preva="y$j"
  off=$(awk "BEGIN{print $off + $(dur "${parts[$j]}") - $XF}")
done
filt+="[$prev][outro]xfade=transition=fade:duration=$XF:offset=$off[vout];[$preva][outroa]acrossfade=d=$XF[aout]"
t=$SECONDS
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filt" -map "[vout]" -map "[aout]" \
  -c:v libx264 -preset medium -crf 18 -maxrate 16M -bufsize 32M -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k \
  -movflags +faststart out/7-ways-the-world-ends_1920x1080.mp4 \
  && echo "joined: longform/out/7-ways-the-world-ends_1920x1080.mp4 ($((SECONDS - t)) s)" || echo "join FAILED"
