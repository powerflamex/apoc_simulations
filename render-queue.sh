cd "C:/Users/andyw/OneDrive/Desktop/deepseek harness/apoc sims/earth-falls"
rm -rf out/.segments
node render.mjs --out out/earth-falls_1080x1920_60fps.mp4 > out_render.log 2>&1 || { echo EF_FAILED; exit 1; }
ffmpeg -y -loglevel error -i out/earth-falls_1080x1920_60fps.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 24M -bufsize 48M -pix_fmt yuv420p -profile:v high -level 5.1 -c:a copy -movflags +faststart out/earth-falls_1080x1920_60fps_tiktok.mp4
node render.mjs --cover 56 >> out_render.log 2>&1 && cp stills/cover.png out/earth-falls_cover.png
echo EF_DONE
cd ..
bash render-v4.sh black-hole > render-v4-bh.log 2>&1
(cd black-hole && node render.mjs --cover 34 > /dev/null 2>&1 && cp stills/cover.png out/black-hole_v4_cover.png)
cat render-v4-bh.log
echo ALL_DONE
