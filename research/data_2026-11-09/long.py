import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
D = os.path.dirname(os.path.abspath(__file__))
REPO = r'C:\Users\andyw\OneDrive\Desktop\deepseek harness\apoc sims\longform'
OUT = os.path.join(D, 'sheets'); FR = os.path.join(D, 'frl'); os.makedirs(FR, exist_ok=True)
# name: (file, length s, posted, views, impressions, ctr, curve)
L = {
 '7ways': (r'out\old\7-ways-the-world-ends_1920x1080.mp4', 432, '10-11', 43707, 377308, 4.75, '100 89 84 79 75 70 68 66 65 62 57 56 56 56 57 58 61 60 58 56 55 54 54 53 52 52 52 52 52 53 54 53 50 48 47 46 45 44 44 43 43 42 42 43 45 46 44 42 42 42 43 43 42 42 42 42 42 45 43 41 41 40 40 39 39 39 39 39 39 40 40 41 43 41 40 40 40 40 40 40 40 41 42 41 40 39 40 43 41 40 38 36 35 34 32 31 30 27 25 18'),
 '6more': (r'out\old\6-more-ways-the-world-ends_1920x1080.mp4', 394, '10-19', 3598, 38705, 3.61, '110 89 84 76 68 63 61 57 56 54 53 50 50 50 52 54 55 64 59 54 51 49 49 48 47 46 46 47 47 46 46 44 49 51 47 44 42 41 40 39 39 37 38 37 38 37 38 37 42 41 38 38 38 37 36 36 36 35 34 34 34 34 35 37 47 48 45 44 41 39 38 37 37 38 39 38 38 39 40 41 42 52 50 49 49 50 49 49 47 46 44 42 40 40 41 42 43 42 38 22'),
 'bigrip': (r'big-rip\out\big-rip_1920x1080_30fps.mp4', 416, '10-21', 3578, 28007, 4.44, '100 81 76 68 60 54 52 50 55 53 49 45 44 43 43 40 40 38 42 43 45 44 41 40 41 39 43 41 40 39 39 38 37 35 37 36 41 39 38 36 36 35 34 34 33 33 33 32 32 33 33 31 37 34 33 32 32 31 32 32 33 33 34 40 38 39 39 38 38 38 40 45 47 44 45 45 42 41 40 39 38 42 42 40 42 45 45 48 49 49 52 53 56 51 42 36 31 24 18 10'),
 'bigcrunch': (r'big-crunch\out\big-crunch_1920x1080_30fps.mp4', 394, '10-24', 1384, 12517, 4.51, '103 81 74 68 60 59 59 56 56 53 50 44 42 40 42 40 41 40 38 38 37 38 37 34 37 35 34 37 33 32 32 32 35 34 34 37 38 35 33 32 31 33 33 31 32 34 34 34 36 38 39 39 40 37 35 37 36 36 37 36 37 38 35 36 39 38 36 37 36 34 33 33 35 39 37 37 37 36 37 37 35 36 35 36 35 42 42 45 56 44 36 30 26 25 22 19 15 10 8 5'),
 'heatdeath': (r'heat-death\out\heat-death_1920x1080_30fps.mp4', 224, '10-26', 1498, 13349, 3.61, '113 95 87 82 92 88 84 86 86 78 75 72 69 69 68 62 64 61 56 56 51 49 50 47 48 51 52 49 47 48 47 50 47 46 47 52 51 46 45 45 42 48 47 48 45 45 43 41 42 42 48 48 45 50 53 55 56 52 45 45 40 40 39 36 38 38 39 38 38 38 40 40 39 38 40 39 36 36 36 40 41 39 41 39 37 40 39 39 39 37 38 35 31 29 26 25 23 20 18 13'),
 'iq': (r'iq-1000\out\iq-1000_1920x1080_30fps.mp4', 335, '10-28', 4427, 33499, 4.65, '97 87 82 81 74 71 71 69 66 64 62 60 59 56 55 54 53 51 51 51 50 49 48 47 47 45 43 43 42 41 40 39 39 38 37 35 34 33 33 32 32 31 30 30 30 28 27 28 27 26 25 26 26 25 26 25 24 23 22 22 23 23 21 21 21 22 22 22 22 22 21 20 20 20 22 21 21 21 20 20 21 21 20 20 20 23 22 22 23 23 21 20 19 17 16 15 14 12 9 7'),
 'bhpass': (r'black-hole-pass\out\black-hole-pass_1920x1080_30fps.mp4', 330, '10-30', 6839, 44726, 4.9, '108 91 81 81 74 69 67 68 65 65 61 59 57 58 57 55 53 52 51 51 50 50 49 48 49 49 46 46 51 48 48 46 46 46 46 44 45 44 44 44 47 46 46 45 45 45 45 45 46 45 45 44 44 44 46 44 44 43 43 44 44 48 47 47 45 44 42 43 41 42 42 48 47 47 47 46 46 46 47 48 49 50 48 46 46 46 47 50 50 50 48 47 45 45 46 44 42 37 30 23'),
 'nukehour': (r'nuke-hour\out\nuke-hour_1920x1080_30fps.mp4', 259, '11-08', 669, 5908, 4.54, '111 93 86 88 83 74 65 66 65 64 61 61 56 58 54 57 55 52 51 52 51 54 55 55 53 52 49 47 49 47 47 45 45 43 43 41 39 39 41 38 36 33 34 34 34 30 35 33 30 29 30 27 29 31 33 31 33 32 29 30 29 30 30 30 27 30 29 32 30 26 25 29 28 27 25 25 29 29 26 26 25 28 25 29 29 31 31 30 32 31 29 29 31 34 33 34 33 28 23 18'),
}
def cv(n): return [float(x) for x in L[n][6].split()]
def at(n, s):
    r = cv(n); p = s/L[n][1]*100-1
    if p <= 0: return r[0]
    if p >= 99: return r[99]
    i = int(p); return r[i]+(r[i+1]-r[i])*(p-i)
def dur(f):
    o = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip()
    return float(o) if o else 0
def grab(job):
    v, t, out = job
    if os.path.exists(out): return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '%.2f' % t, '-i', v, '-frames:v', '1', '-vf', 'scale=320:-2', out])
def sheet(n, times, tag):
    f = os.path.join(REPO, L[n][0]); jobs = [(f, t, os.path.join(FR, '%s_%06.1f.jpg' % (n, t))) for t in times]
    with ThreadPoolExecutor(6) as ex: list(ex.map(grab, jobs))
    tw, th, lab, cols = 320, 180, 26, 6
    rows = (len(times)+cols-1)//cols
    im = Image.new('RGB', (cols*tw, rows*(th+lab)), (20, 20, 20)); dr = ImageDraw.Draw(im); font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
    prev = None
    for k, t in enumerate(times):
        x = (k % cols)*tw; y = (k//cols)*(th+lab); fp = jobs[k][2]
        if os.path.exists(fp): im.paste(Image.open(fp).resize((tw, th)), (x, y+lab))
        r = at(n, t); txt = '%d:%02d  %.0f%%' % (t//60, t % 60, r); col = (255, 255, 255)
        if prev:
            rate = (prev[1]-r)/(t-prev[0])*10; txt += '  %+.1f/10s' % -rate
            col = (255, 90, 90) if rate >= 4 else (255, 200, 80) if rate >= 1.5 else (120, 255, 120) if rate <= 0 else (255, 255, 255)
        prev = (t, r); dr.text((x+4, y+3), txt, fill=col, font=font)
    im.save(os.path.join(OUT, 'LONG_%s%s.jpg' % (n, tag)), quality=80); print('sheet LONG_%s%s' % (n, tag))
if __name__ == '__main__':
    for n in L:
        f = os.path.join(REPO, L[n][0]); d = dur(f); Ln = L[n][1]; r = cv(n)
        step = Ln/100
        # biggest rises (people skipping to) and steepest falls after the first 10%
        ch = [(r[i+1]-r[i], (i+1.5)*step) for i in range(8, 96)]
        rises = sorted(ch, reverse=True)[:5]; falls = sorted(ch)[:4]
        print('%-10s file %.0fs vs posted %ds | at 0:10 %.0f 0:20 %.0f 0:30 %.0f 0:45 %.0f 1:00 %.0f 1:30 %.0f 2:00 %.0f mid %.0f 90%% %.0f | rises %s | falls %s' % (
            n, d, Ln, at(n, 10), at(n, 20), at(n, 30), at(n, 45), at(n, 60), at(n, 90), at(n, 120), r[49], r[89],
            ' '.join('%d:%02d %+.0f' % (t//60, t % 60, c) for c, t in rises), ' '.join('%d:%02d %+.0f' % (t//60, t % 60, c) for c, t in falls)))
    if len(sys.argv) > 1:
        for n in L:
            if sys.argv[1] in ('all', n):
                sheet(n, [0, 3, 6, 10, 15, 20, 25, 30, 40, 50, 60, 75], '_open')
                Ln = L[n][1]; sheet(n, [round(Ln*k/24) for k in range(4, 24)][:18], '_rest')
