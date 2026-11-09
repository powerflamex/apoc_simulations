cd "$(dirname "$0")/earth-falls"
node render.mjs --upload --out out/earth-falls_1080x1920_60fps.mp4 > out_render.log 2>&1 || { echo EF_FAILED; exit 1; }
node render.mjs --cover 56 >> out_render.log 2>&1 && cp stills/cover.png out/earth-falls_cover.png
echo EF_DONE
cd ..
bash render-v4.sh black-hole > render-v4-bh.log 2>&1
(cd black-hole && node render.mjs --cover 34 > /dev/null 2>&1 && cp stills/cover.png out/black-hole_v4_cover.png)
cat render-v4-bh.log
echo ALL_DONE
