#!/usr/bin/env bash
# contact sheet of stills/t_*.png -> stills/sheet.png (3 columns)
cd "$(dirname "$0")/stills" && rm -rf .seq && mkdir .seq
i=0; for f in t_*.png; do cp "$f" .seq/$(printf '%03d' $i).png; i=$((i+1)); done
rows=$(( (i + 2) / 3 ))
ffmpeg -y -loglevel error -framerate 1 -i .seq/%03d.png -vf "scale=360:640,tile=3x${rows}" -frames:v 1 sheet.png
rm -rf .seq
