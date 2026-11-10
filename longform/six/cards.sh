#!/usr/bin/env bash
# Intro and outro for "6 more ways the world could end":  bash longform/six/cards.sh  -> clips/intro.mp4, clips/outro.mp4
# (run node longform/six/cards.mjs first for the text PNGs)
# Intro (~4.3 s): a flash-forward to the very end (the Big Crunch: all of space squeezed into one white ball),
#   slowed down, with the title and "In 6 minutes, the whole universe ends." readable from frame 0; it flashes white
#   into #6. Outro (7 s): deep space, "Which one scares you most?", the six climaxes with their numbers, subscribe.
cd "$(dirname "$0")"
HERE=$PWD; ROOT=$(cd ../.. && pwd)
W2="$ROOT/week 2"
mkdir -p clips
# 1) the flash-forward: big-crunch without text, 63.1-64.55 s (the white ball with black around it: bright and readable
#    from the first frame, never hazy), drawn at 150 fps so it plays at 0.4x speed at 60 fps
if [ ! -s clips/ff_raw.mp4 ]; then
  rm -rf "$W2/big-crunch/out/.segments"
  (cd "$W2/big-crunch" && node render.mjs --wide --clean --start 63.1 --end 64.55 --fps 150 --seg 3 --out "$HERE/clips/ff_raw.mp4" > "$HERE/clips/ff.log" 2>&1) || { echo "flash-forward render FAILED (clips/ff.log)"; exit 1; }
  rm -rf "$W2/big-crunch/out/.segments"
fi
# 2) clean stills for the outro: deep space for the background and each part's climax for the thumbnails
shot() {   # project time name
  [ -s "clips/$3.png" ] && return
  (cd "$W2/$1" && node render.mjs --wide --clean --stills "$2" > /dev/null 2>&1) || { echo "still $1 $2 FAILED"; exit 1; }
  f=$(ls -t "$W2/$1"/stills/t_*.png | head -1); cp "$f" "clips/$3.png"
}
shot big-crunch 47 bgraw
shot earth-stops 58 th6
shot women-vanish 50.4 th5
shot yellowstone 50 th4
shot moon-falls 52 th3
shot gravity-doubles 52.3 th2
shot big-crunch 63.5 th1

# the outro background: the empty left half of deep space mirrored (the floating "you" is in the right half)
[ -s clips/bg.png ] || ffmpeg -y -loglevel error -i clips/bgraw.png -filter_complex "[0]crop=960:1080:0:0,split[l][r];[r]hflip[rf];[l][rf]hstack" clips/bg.png

# intro: the slowed flash-forward (150 fps -> 60 fps = 0.4x), title + promise on top from the first frame,
# a white flash at the end; the sound is the crunch's own rising tone pitched down to match, plus a boom at the cut
D=$(awk 'BEGIN{print 1.45 * 150 / 60}')
ffmpeg -y -loglevel error -i clips/ff_raw.mp4 -loop 1 -t "$D" -i clips/title.png -loop 1 -t "$D" -i clips/promise.png -filter_complex "\
[0:v]setpts=PTS*150/60,fps=60,trim=0:$D,setpts=PTS-STARTPTS,format=yuv420p[b];\
[1:v]format=rgba,fade=out:st=$(awk "BEGIN{print $D - 0.45}"):d=0.3:alpha=1[t];[2:v]format=rgba,fade=out:st=$(awk "BEGIN{print $D - 0.45}"):d=0.3:alpha=1[p];\
[b][t]overlay=0:0[bt];[bt][p]overlay=0:0,fade=out:st=$(awk "BEGIN{print $D - 0.22}"):d=0.22:color=white[v];\
[0:a]asetrate=48000*0.5,aresample=48000,atempo=0.8,atrim=0:$D,asetpts=PTS-STARTPTS,volume=1.4[a0];\
aevalsrc='0.9*sin(2*PI*(36+60*exp(-t*14))*t)*exp(-t*2.2)|0.9*sin(2*PI*(36+60*exp(-t*14))*t)*exp(-t*2.2)':s=48000:d=1.2,adelay=$(awk "BEGIN{print int(($D - 0.2) * 1000)}")|$(awk "BEGIN{print int(($D - 0.2) * 1000)}")[boom];\
[a0][boom]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89:level=false,aformat=channel_layouts=stereo[a]" \
  -map "[v]" -map "[a]" -t "$D" -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k clips/intro.mp4 && echo "intro.mp4 ($D s)"

# outro: the space background drifting, the text card, the six climaxes as thumbnails with their numbers
for n in 1 2 3 4 5 6; do ffmpeg -y -loglevel error -i "clips/th$n.png" -vf "scale=280:158" "clips/ths$n.png"; done
args=(-loop 1 -t 7 -i clips/bg.png -loop 1 -t 7 -i clips/outro.png); filt="[0:v]fps=60,scale=2880:1620,crop=1920:1080:x=480-t*14:y=t*6,eq=brightness=-0.06,format=yuv420p[bg0];"
prev="bg0"
for i in 0 1 2 3 4 5; do
  n=$((6 - i)); args+=(-loop 1 -t 7 -i "clips/ths$n.png" -loop 1 -t 7 -i "clips/onum$n.png")
  ti=$((2 + i * 2)); oi=$((ti + 1)); x=$((60 + i * 300))
  st=$(awk "BEGIN{print 0.9 + $i * 0.12}")
  filt+="[$ti:v]format=rgba,pad=284:162:2:2:color=0xf4efe6@0.8,fade=in:st=$st:d=0.4:alpha=1[th$i];[$prev][th$i]overlay=$x:520[p$i];"
  filt+="[$oi:v]format=rgba,fade=in:st=$st:d=0.4:alpha=1[on$i];[p$i][on$i]overlay=0:0[q$i];"
  prev="q$i"
done
filt+="[1:v]format=rgba,fade=in:st=0.2:d=0.6:alpha=1[ot];[$prev][ot]overlay=0:0,fade=out:st=5.8:d=1.2[v];"
filt+="aevalsrc='0.12*(sin(2*PI*110*t)+0.7*sin(2*PI*164.8*t)+0.5*sin(2*PI*220*t)+0.4*sin(2*PI*277.2*t))*min(1,t/0.8)*min(1,(7-t)/1.5)|0.12*(sin(2*PI*110.4*t)+0.7*sin(2*PI*165.1*t)+0.5*sin(2*PI*220.6*t)+0.4*sin(2*PI*277.6*t))*min(1,t/0.8)*min(1,(7-t)/1.5)':s=48000:d=7[a]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$filt" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k clips/outro.mp4 && echo "outro.mp4"
