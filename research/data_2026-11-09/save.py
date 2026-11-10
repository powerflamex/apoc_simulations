import os, shutil, io, contextlib, sys
D = os.path.dirname(os.path.abspath(__file__))
with contextlib.redirect_stdout(io.StringIO()):
    import loop
    from loop import V
import long as LG
REPO = r'C:\Users\andyw\OneDrive\Desktop\deepseek harness\apoc sims'
DATA = os.path.join(REPO, 'research', 'data_2026-11-09'); PICS = os.path.join(REPO, 'research', 'pictures_2026-11-10')
os.makedirs(DATA, exist_ok=True); os.makedirs(PICS, exist_ok=True)
for f in ['meta.csv', 'ret.csv', 'ext.csv', 'hourly.csv', 'curves.txt', 'vis.json', 'an.py', 'sheets.py', 'vis.py', 'loop.py', 'long.py', 'montage.py', 'save.py']:
    shutil.copy(os.path.join(D, f), os.path.join(DATA, f))
open(os.path.join(DATA, '.gitignore'), 'w').write('sheets/\nfr/\nfrl/\nshow/\n__pycache__/\n')
for f in os.listdir(os.path.join(D, 'show')): shutil.copy(os.path.join(D, 'show', f), os.path.join(PICS, f))
for n in ['bhpass', 'nukehour', 'heatdeath', '7ways']:
    for t in ['open', 'rest']: shutil.copy(os.path.join(D, 'sheets', 'LONG_%s_%s.jpg' % (n, t)), os.path.join(PICS, 'long_%s_%s.jpg' % (n, t)))
# channel daily series, Oct 12 -> Nov 8
views = '821099 690717 524558 505105 691253 818667 599464 601578 486294 376272 391534 376511 293867 160604 180057 166515 206970 317750 337184 410283 377061 246554 249224 275642 374180 360647 463454 409505'.split()
subs = '2163 1558 1172 1109 1571 1621 1080 1011 762 572 576 582 459 257 242 204 287 410 496 547 488 333 299 296 462 337 475 379'.split()
import datetime
d0 = datetime.date(2026, 10, 12)
with open(os.path.join(DATA, 'channel_daily.csv'), 'w') as f:
    f.write('date,views,subs_gained\n')
    for k in range(28): f.write('%s,%s,%s\n' % (d0+datetime.timedelta(days=k), views[k], subs[k]))
extra = {'7ways': ('-fGbBFumRws', '7 Ways the World Ends', '3:07', 43.4, 123, 1302, 97.2), '6more': ('cnpHCt6Vjw8', '6 More Ways the World Ends', '2:37', 39.9, 9, 87, 89.2),
         'bigrip': ('wflDGVLFdPM', 'Big Rip', '2:23', 34.4, 2, 69, 82.0), 'bigcrunch': ('CsW0hu22GlE', 'Big Crunch', '2:03', 31.3, 4, 28, 75.9),
         'heatdeath': ('RCYncGNNJqc', 'Heat death', '1:36', 43.0, 0, 19, 79.7), 'iq': ('x_shZMytDqw', 'IQ 1,000x', '1:45', 31.4, 5, 63, 86.2),
         'bhpass': ('BqtSGIZciXA', 'Black Hole Passed Earth (56 days)', '2:29', 45.0, 12, 142, 88.3), 'nukehour': ('K1SUpixJQQQ', 'Nuke: the first hour', '1:33', 36.1, -1, 9, 50.1)}
with open(os.path.join(DATA, 'long_videos.csv'), 'w') as f:
    f.write('id,name,title,length_s,posted,views,impressions,click_rate,avg_view,avg_pct,subs,watch_hours,pct_watch_from_non_subs,at0:10,at0:20,at0:30,at0:45,at1:00,at1:30,at2:00,curve_100_points\n')
    for n, (fl, ln, po, vw, im, ct, cu) in LG.L.items():
        e = extra[n]
        f.write('%s,%s,"%s",%d,%s,%d,%d,%s,%s,%s,%d,%d,%s,%s,"%s"\n' % (e[0], n, e[1], ln, po, vw, im, ct, e[2], e[3], e[4], e[5], e[6],
                ','.join('%.0f' % LG.at(n, s) for s in (10, 20, 30, 45, 60, 90, 120)), cu))
# ranking
NICE = {'bh passed': 'Black hole passed Earth', 'sun vanished': 'Sun vanishes', 'bh appears': 'Black hole appears', 'fall into bh': 'Fall into a black hole', 'women': 'Every woman vanishes',
        'electrons': 'Every electron vanishes', 'speed': 'Speed doubles', 'gravity': 'Gravity doubles', 'jump': 'Jump doubles', 'rain': 'Rain for 1,000 years', 'oxygen': 'Oxygen gone 5 s',
        'earthquake': 'Earthquake grows', 'tsunami': 'Tsunami NYC', 'punch': 'Punch 10x', 'gojo': 'Gojo', 'nuke': 'Biggest nuke', 'tornado': 'Giant tornado', 'fall through': 'Fall through the Earth'}
def nice(n): return NICE.get(n, n[0].upper()+n[1:])
def k(x): return '-' if x is None else ('%.1fM' % (x/1e6) if x >= 1e6 else '%.0fK' % (x/1e3) if x >= 1000 else '%d' % x)
MON = {'10': 'Oct', '11': 'Nov'}
def date(p): return '%s %d' % (MON[p[:2]], int(p[3:]))
ids = sorted(loop.ids, key=lambda i: -V[i]['c30'])
out = ['# Every Short ranked by % still watching at 0:30 (Nov 10, 2026)', '',
       'Exact numbers from each video\'s own Studio page, read Nov 9 (retention curve, 100 points per video; views at 24 h from the hourly series).',
       'Made by `research/data_2026-11-09/save.py` from the CSVs in that folder; the pictures are in `research/pictures_2026-11-10/`.', '',
       '- **At 0:30** is the rule in CLAUDE.md (70%+, 72%+ is the hit zone). **At 0:15** tracks views about as well and is listed next to it.',
       '- **Lost 0:03 to 0:10**: points of the curve lost in the steepest stretch of every Short. Under ~30 is good, 38+ is the weak group.',
       '- Curves start above 100% because people who loop are counted again; that inflates every early number a little, mostly on the 49 s Shorts.',
       '- Views at 24 h are unfair to Oct 4-8 (no audience yet). Views now depend on age.', '',
       '| # | Short | Posted | Length | At 0:10 | At 0:15 | At 0:30 | Lost 0:03 to 0:10 | Views at 24 h | Views now |', '|---|---|---|---|---|---|---|---|---|---|']
for r, i in enumerate(ids, 1):
    v = V[i]
    out.append('| %d | %s | %s | %d s | %.0f%% | %.0f%% | **%.0f%%** | %.0f | %s | %s |' % (r, nice(v['name']), date(v['posted']), v['len'], v['c10'], v['c15'], v['c30'], v['c3']-v['c10'], k(v['v24']), k(v['now'])))
out += ['', 'No curve yet (posted Nov 9; read their curves when the Studio window is open):', '',
        '| Short | Posted | Views after ~12 h | Views after ~18 h |', '|---|---|---|---|', '| World freezes | Nov 9, 7 AM | 20.9K | 22.9K |', '| Sand grain | Nov 9, 1 PM | 15.6K | - |', '']
import statistics as st
out += ['## Typical views by where the Short sits at 0:30', '', '| At 0:30 | Shorts | Typical (median) views now |', '|---|---|---|']
for lo, hi, lab in [(72, 999, '72%+'), (70, 72, '70-72%'), (55, 70, '55-70%'), (0, 55, 'under 55%')]:
    g = [V[i]['now'] for i in ids if lo <= V[i]['c30'] < hi]
    out.append('| %s | %d | %s |' % (lab, len(g), k(st.median(g)) if g else '-'))
open(os.path.join(REPO, 'research', 'shorts_ranking_2026-11-10.md'), 'w', encoding='utf-8').write('\n'.join(out)+'\n')
print('\n'.join(out[10:]))
