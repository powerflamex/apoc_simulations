import csv, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
D = os.path.dirname(os.path.abspath(__file__))
REPO = r'C:\Users\andyw\OneDrive\Desktop\deepseek harness\apoc sims'
OUT = os.path.join(D, 'sheets'); FR = os.path.join(D, 'fr')
os.makedirs(OUT, exist_ok=True); os.makedirs(FR, exist_ok=True)
FOLDER = {
 'ADi2j4F97Nw': 'week 6/biggest-nuke', 'K2_A0VJYgN0': 'week 5/giant-tornado', '3G-foZrzcy8': 'week 5/metal-rod', 'Pa0BwMhcSkk': 'week 5/iss-jump',
 'Bn9OlRNGsc4': 'week 5/fall-through-earth', 'kyqAq7K92Ac': 'week 5/moon-explodes', 'FSvnOcOwkVw': 'week 5/rogue-planet', '3RhIDawgbz4': 'week 4/time-stop',
 'DshwFRiQR-4': 'week 4/antimatter-rain', 'DngyY1pS_5o': 'week 4/black-hole-appears', 'raSaDCPCrwQ': 'week 3/rain-1000-years', 'F_3gPrcaUKg': 'week 3/sun-explodes',
 's1paI608Y8o': 'week 4/punch-10x', '2wcZW_getOI': 'week 3/quake-grows', 'G9DMSNzLxTE': 'week 3/grow-trillion', 'uKFBcfUZNHU': 'week 3/tsunami-nyc',
 'clxJiuSf-54': 'week 3/black-hole-fall', 'QgYnaXfl8JY': 'week 3/gojo', 'DMW3h6TkrTQ': 'week 3/false-vacuum', '_sLPegXv8RI': 'week 3/friction',
 '3Nt9HXPHJ3A': 'week 3/oxygen-5s', 'gJ4jmeakxhU': 'week 3/jump-doubles', 'DCMtl2wXskc': 'week 3/jupiter', '8pZYzcFzXfo': 'week 2/big-crunch',
 'QTTdnFbxqVA': 'week 2/trillion-years', 'sS_laj1p9ew': 'week 2/earth-stops', 'S1XLjqqcFak': 'week 2/gravity-doubles', 'n9z1EAAKrCs': 'week 2/yellowstone',
 'y10sSB_RZA8': 'week 2/women-vanish', 'A7FydA_qbGE': 'week 2/moon-falls', 'S9ybi2faVLc': 'week 1/electrons', 'pO_5m73e6Gg': 'week 1/speed-doubles',
 '-yjfrEkPdjE': 'week 1/earth-spins', 'bYnmt2etzsA': 'week 1/asteroid', '9KLW4rp-ou8': 'week 1/black-hole', 'Ye0evnGIPWs': 'week 1/sun-vanishes',
 '8cFQE9XAaI0': 'week 1/earth-falls', '6PfzQLWJ8Aw': 'week 5/star-picker', 'yhfE9a2UYnU': 'week 6/sand-grain', 'RHziC_FPPPs': 'week 6/world-freezes'}
meta = {r['id']: r for r in csv.DictReader(open(os.path.join(D, 'meta.csv'), newline=''))}
curves = {}
for line in open(os.path.join(D, 'curves.txt')):
    if line.startswith('#') or '|' not in line: continue
    p = [x.strip() for x in line.split('|')]
    curves[p[1]] = (float(p[2]), [float(x) for x in p[3].split()])
def at(vid, s):
    L, r = curves[vid]; p = s/L*100-1
    if p <= 0: return r[0]
    if p >= 99: return r[99]
    i = int(p); return r[i]+(r[i+1]-r[i])*(p-i)
def video(vid):
    d = os.path.join(REPO, FOLDER[vid], 'out')
    for f in os.listdir(d):
        if f.endswith('_tiktok.mp4'): return os.path.join(d, f)
TIMES = [0, 1, 2, 3, 5, 7, 9, 11, 13, 15, 18, 21, 25, 30, 37, 45]
def grab(job):
    v, t, out, w = job
    if os.path.exists(out): return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '%.3f' % t, '-i', v, '-frames:v', '1', '-vf', 'scale=%d:-2' % w, out])
def run(only=None, times=TIMES, tw=196, cols=8, tag=''):
    jobs = []
    vids = [v for v in FOLDER if (not only or v in only)]
    for vid in vids:
        v = video(vid)
        for t in times:
            jobs.append((v, t, os.path.join(FR, '%s_%05.1f_%d.jpg' % (vid, t, tw)), tw))
    with ThreadPoolExecutor(6) as ex: list(ex.map(grab, jobs))
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17 if tw < 300 else 24)
    th = int(tw*16/9); lab = 26 if tw < 300 else 34
    for vid in vids:
        rows = (len(times)+cols-1)//cols
        im = Image.new('RGB', (cols*tw, rows*(th+lab)), (20, 20, 20)); dr = ImageDraw.Draw(im)
        prev = None
        for k, t in enumerate(times):
            x = (k % cols)*tw; y = (k//cols)*(th+lab)
            fp = os.path.join(FR, '%s_%05.1f_%d.jpg' % (vid, t, tw))
            if os.path.exists(fp):
                try: im.paste(Image.open(fp).resize((tw, th)), (x, y+lab))
                except Exception as e: pass
            txt = '%d:%04.1f' % (t//60, t % 60) if t != int(t) else '0:%02d' % t
            col = (255, 255, 255)
            if vid in curves:
                r = at(vid, t); txt += '  %.0f%%' % r
                if prev is not None:
                    rate = (prev[1]-r)/(t-prev[0]); txt += '  -%.1f/s' % rate if rate >= 0 else '  +%.1f/s' % -rate
                    col = (255, 90, 90) if rate >= 2.5 else (255, 200, 80) if rate >= 1.2 else (120, 255, 120) if rate < 0.5 else (255, 255, 255)
                prev = (t, r)
            dr.text((x+4, y+3), txt, fill=col, font=font)
        name = meta[vid]['name'].replace(' ', '_')
        im.save(os.path.join(OUT, '%s%s.jpg' % (name, tag)), quality=82)
        print('sheet', name+tag)
if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'drops':
        for vid in FOLDER:
            if vid not in curves: continue
            L, r = curves[vid]; m = meta[vid]
            # loss per second between consecutive 1% points
            sec = [(i+1)*L/100 for i in range(100)]
            best = []
            for s in range(4, int(L)-3):
                best.append((at(vid, s)-at(vid, s+2), s))
            best.sort(reverse=True)
            picks = []
            for d, s in best:
                if all(abs(s-q) >= 3 for _, q in picks): picks.append((d, s))
                if len(picks) == 3: break
            flat = sorted(best)[:1]
            rises = [s for d, s in best if d < -0.3]
            print('%-14s L%2d  at0:03 %5.1f  steepest 2s drops after 0:04: %s | flattest %s | rises at %s' % (m['name'], L, at(vid, 3),
                  ', '.join('0:%02d -%.1f' % (s, d) for d, s in picks), '0:%02d %.1f' % (flat[0][1], -flat[0][0]), rises[:8]))
    else:
        run()
