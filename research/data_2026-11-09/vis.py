import csv, os, subprocess, sys, json
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageChops, ImageStat
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheets as S
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from an import V, spear, ret
D = S.D
W, H, FPS, DUR = 48, 86, 2, 31
CACHE = os.path.join(D, 'vis.json')
def frames(vid):
    v = S.video(vid)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-t', str(DUR), '-i', v, '-vf', 'fps=%d,scale=%d:%d' % (FPS, W, H), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], capture_output=True).stdout
    n = len(raw)//(W*H*3)
    return [Image.frombytes('RGB', (W, H), raw[i*W*H*3:(i+1)*W*H*3]) for i in range(n)]
def diff(a, b):
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean)/3
def lum(a):
    return ImageStat.Stat(a.convert('L')).mean[0]
def sat(a):
    return ImageStat.Stat(a.convert('HSV')).mean[1]
def measure(vid):
    f = frames(vid)
    at = lambda s: f[min(len(f)-1, int(round(s*FPS)))]
    step = [diff(f[i], f[i-1]) for i in range(1, len(f))]          # per 0.5 s
    sec = lambda a, b: [diff(at(t), at(t-1)) for t in range(a+1, b+1)]
    m = dict(lum0=lum(f[0]), lum10=sum(lum(x) for x in f[:20])/20, sat10=sum(sat(x) for x in f[:20])/20,
             chg0_3=sum(sec(0, 3))/3, chg3_10=sum(sec(3, 10))/7, chg10_15=sum(sec(10, 15))/5, chg15_30=sum(sec(15, 30))/15,
             nov3=diff(at(3), f[0]), nov5=diff(at(5), f[0]), nov7=diff(at(7), f[0]), nov10=diff(at(10), f[0]),
             maxstep15=max(step[:30]), steps=[round(x, 1) for x in step])
    for th in (15, 20, 30):
        m['cuts%d_10' % th] = sum(1 for x in step[:20] if x > th); m['cuts%d_15' % th] = sum(1 for x in step[:30] if x > th)
        m['cuts%d_15_30' % th] = sum(1 for x in step[30:60] if x > th)
    # first time the picture is "far" from frame 0
    m['t_new'] = next((i/FPS for i in range(len(f)) if diff(f[i], f[0]) > 30), 31)
    return vid, m
if not os.path.exists(CACHE):
    with ThreadPoolExecutor(4) as ex: res = dict(ex.map(measure, list(S.FOLDER)))
    json.dump(res, open(CACHE, 'w'))
M = json.load(open(CACHE))
ids = [i for i in M if i in ret]
for i in ids:
    V[i].update({k: v for k, v in M[i].items() if k != 'steps'})
    V[i]['hold3_10'] = V[i]['c10']/V[i]['c3']; V[i]['hold3_15'] = V[i]['c15']/V[i]['c3']; V[i]['hold15_30'] = V[i]['c30']/V[i]['c15']
    V[i]['loss3_10'] = V[i]['c3']-V[i]['c10']
feats = ['lum0', 'lum10', 'sat10', 'chg0_3', 'chg3_10', 'chg10_15', 'chg15_30', 'nov3', 'nov5', 'nov7', 'nov10', 'maxstep15', 'cuts15_10', 'cuts20_10', 'cuts30_10', 'cuts20_15', 'cuts20_15_30', 't_new']
tg = ['hold3_10', 'hold3_15', 'c10', 'c15', 'hold15_30', 'c30', 'v24', 'v168', 'now']
def tab(title, sub):
    print('\n==', title, 'n=%d' % len(sub)); print('%-13s' % '' + ''.join('%10s' % t for t in tg))
    for ft in feats:
        row = '%-13s' % ft
        for t in tg:
            c, n = spear([V[i].get(ft) for i in sub], [V[i].get(t) for i in sub]); row += '%10s' % ('%.2f' % c if c is not None else '-')
        print(row)
if __name__ == '__main__':
    tab('all with curve + file', ids)
    tab('Oct 11+', [i for i in ids if V[i]['posted'] >= '10-11'])
    tab('60s+ Oct 11+', [i for i in ids if V[i]['posted'] >= '10-11' and V[i]['len'] > 55])
    tab('45-55s', [i for i in ids if V[i]['len'] <= 55])
    print('\n%-14s %5s %5s %5s %5s %5s %5s %5s %4s %5s | %5s %5s %5s %5s %9s' % ('name', 'lum10', 'c0_3', 'c3_10', 'nov5', 'nov7', 'nov10', 'maxst', 'cuts', 't_new', 'h3_10', 'c15', 'h1530', 'c30', 'now'))
    for i in sorted(ids, key=lambda i: -V[i]['hold3_10']):
        v = V[i]
        print('%-14s %5.0f %5.1f %5.1f %5.1f %5.1f %5.1f %5.1f %4d %5.1f | %5.3f %5.1f %5.3f %5.1f %9d' % (v['name'], v['lum10'], v['chg0_3'], v['chg3_10'], v['nov5'], v['nov7'], v['nov10'], v['maxstep15'], v['cuts20_15'], v['t_new'], v['hold3_10'], v['c15'], v['hold15_30'], v['c30'], v['now']))
    for i in M:
        if i not in ret: print(V[i]['name'], {k: round(v, 1) for k, v in M[i].items() if k != 'steps'})
