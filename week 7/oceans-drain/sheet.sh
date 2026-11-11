#!/usr/bin/env bash
# test frames -> one contact sheet:  bash sheet.sh <name> <t1> <t2> ...   (stills/<name>.png, 3 per row, half size)
cd "$(dirname "$0")"
name=$1; shift
ts=$(IFS=,; echo "$*")
node render.mjs --stills "$ts" 2>&1 | grep -iv "^still\|^GPU" | head -20
in=(); n=0
for t in "$@"; do in+=(-i "stills/t_$(printf '%05s' "$t" | tr ' ' 0).png"); n=$((n + 1)); done
cols=3; [ $n -lt 3 ] && cols=$n
ffmpeg -y -v error "${in[@]}" -filter_complex "concat=n=$n:v=1:a=0,scale=540:960,tile=${cols}x$(( (n + cols - 1) / cols ))" -frames:v 1 "stills/$name.png" && echo "stills/$name.png"
