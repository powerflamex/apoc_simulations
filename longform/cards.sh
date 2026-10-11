#!/usr/bin/env bash
# Builds the long-form intro and outro from the clean montage clips (clips/1..8.mp4, rendered with ?clean=1) and the
# text cards from cards.mjs:  bash longform/cards.sh  -> clips/intro.mp4, clips/outro.mp4
# Intro (~9.5 s): the seven climaxes, 1 s each with a white flick and a boom on every cut and "#7".."#1" in the
#   corner, then the #1 shot slowed down under the title. Outro (7 s): stars, "Which one scares you most?", a row of
#   the seven shots with their numbers, "subscribe for more", fade to black.
cd "$(dirname "$0")/clips"
BOOM="aevalsrc='0.85*sin(2*PI*(42+70*exp(-t*22))*t)*exp(-t*3.5)+0.35*(random(0)*2-1)*exp(-t*14)|0.85*sin(2*PI*(42+70*exp(-t*22))*t)*exp(-t*3.5)+0.35*(random(1)*2-1)*exp(-t*14)':s=48000"
args=(); filt=""
for n in 1 2 3 4 5 6 7; do
  args+=(-i "$n.mp4" -loop 1 -t 1 -i "num$((8 - n)).png")
  vi=$(( (n - 1) * 2 )); ni=$((vi + 1))
  filt+="[$vi:v]trim=0:1,setpts=PTS-STARTPTS,fps=60,format=yuv420p,fade=in:st=0:d=0.14:color=white[b$n];[b$n][$ni:v]overlay=0:0[s$n];"
  filt+="$BOOM:d=1[a$n];"
done
# the #1 shot slowed down under the title
args+=(-i 7.mp4 -loop 1 -t 2.8 -i title.png -loop 1 -t 2.8 -i num1.png)
filt+="[14:v]trim=0:0.55,setpts=PTS-STARTPTS,setpts=5.2*PTS,fps=60,trim=0:2.8,setpts=PTS-STARTPTS,format=yuv420p[t0];[16:v]format=rgba,fade=out:st=0:d=0.4:alpha=1[n1f];[t0][n1f]overlay=0:0[t1];"
filt+="[15:v]format=rgba,fade=in:st=0.15:d=0.5:alpha=1[ti];[t1][ti]overlay=0:0,fade=in:st=0:d=0.14:color=white[s8];"
filt+="aevalsrc='1.2*sin(2*PI*(30+60*exp(-t*12))*t)*exp(-t*1.1)+0.4*(random(0)*2-1)*exp(-t*5)|1.2*sin(2*PI*(30+60*exp(-t*12))*t)*exp(-t*1.1)+0.4*(random(1)*2-1)*exp(-t*5)':s=48000:d=2.8[a8];"
filt+="[s1][a1][s2][a2][s3][a3][s4][a4][s5][a5][s6][a6][s7][a7][s8][a8]concat=n=8:v=1:a=1[v][a]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$filt" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k intro.mp4 && echo "intro.mp4"

# outro: stars (clip 8 slowed), the text card, the seven shots as thumbnails with their numbers
for n in 1 2 3 4 5 6 7; do ffmpeg -y -loglevel error -ss 0.5 -i "$n.mp4" -frames:v 1 -vf "scale=240:135" "th$n.png"; done
ffmpeg -y -loglevel error -ss 0.15 -i 8.mp4 -frames:v 1 bg.png
args=(-loop 1 -t 7 -i bg.png -loop 1 -t 7 -i outro.png); filt="[0:v]fps=60,scale=2880:1620,crop=1920:1080:x=480-t*14:y=t*6,format=yuv420p[bg0];"
prev="bg0"
for i in 0 1 2 3 4 5 6; do
  n=$((i + 1)); args+=(-loop 1 -t 7 -i "th$n.png" -loop 1 -t 7 -i "onum$((7 - i)).png")
  ti=$((2 + i * 2)); oi=$((ti + 1)); x=$((60 + i * 260))
  filt+="[$ti:v]format=rgba,pad=244:139:2:2:color=0xf4efe6@0.8,fade=in:st=$(awk "BEGIN{print 0.9 + $i * 0.12}"):d=0.4:alpha=1[th$i];[$prev][th$i]overlay=$x:520[p$i];"
  filt+="[$oi:v]format=rgba,fade=in:st=$(awk "BEGIN{print 0.9 + $i * 0.12}"):d=0.4:alpha=1[on$i];[p$i][on$i]overlay=0:0[q$i];"
  prev="q$i"
done
filt+="[1:v]format=rgba,fade=in:st=0.2:d=0.6:alpha=1[ot];[$prev][ot]overlay=0:0,fade=out:st=5.8:d=1.2[v];"
filt+="aevalsrc='0.12*(sin(2*PI*110*t)+0.7*sin(2*PI*164.8*t)+0.5*sin(2*PI*220*t)+0.4*sin(2*PI*277.2*t))*min(1,t/0.8)*min(1,(7-t)/1.5)|0.12*(sin(2*PI*110.4*t)+0.7*sin(2*PI*165.1*t)+0.5*sin(2*PI*220.6*t)+0.4*sin(2*PI*277.6*t))*min(1,t/0.8)*min(1,(7-t)/1.5)':s=48000:d=7[a]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$filt" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k outro.mp4 && echo "outro.mp4"
