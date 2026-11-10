import csv, math, os, sys
D = os.path.dirname(os.path.abspath(__file__))
def load(n):
    with open(os.path.join(D, n), newline='') as f:
        return {r['id']: r for r in csv.DictReader(f)}
ret, ext, hr, meta = load('ret.csv'), load('ext.csv'), load('hourly.csv'), load('meta.csv')
def f(x):
    try: return float(x)
    except: return None
def rank(v):
    s = sorted(range(len(v)), key=lambda i: v[i]); r = [0]*len(v); i = 0
    while i < len(s):
        j = i
        while j+1 < len(s) and v[s[j+1]] == v[s[i]]: j += 1
        for k in range(i, j+1): r[s[k]] = (i+j)/2+1
        i = j+1
    return r
def pear(a, b):
    n = len(a); ma = sum(a)/n; mb = sum(b)/n
    sa = math.sqrt(sum((x-ma)**2 for x in a)); sb = math.sqrt(sum((x-mb)**2 for x in b))
    return sum((x-ma)*(y-mb) for x, y in zip(a, b))/(sa*sb) if sa and sb else 0
def spear(xs, ys):
    p = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(p) < 6: return None, len(p)
    return pear(rank([a for a, _ in p]), rank([b for _, b in p])), len(p)

ids = [i for i in meta if i in ret]
V = {}
for i in meta:
    m = meta[i]; e = ext.get(i, {}); h = hr.get(i, {})
    V[i] = dict(name=m['name'], len=f(m['len']), posted=m['posted'], slot=f(m['slot']),
                v24=f(m['views24']), v72=f(m['views72']), v168=f(m['views168']), now=f(e.get('views')),
                subs=f(e.get('subs')), new=f(e.get('newViewers')), pch=f(e.get('pChannel')), psh=f(e.get('pShorts')),
                eng=f(e.get('engaged')), uniq=f(e.get('unique')), last24=f(e.get('last24h')),
                h1=f(h.get('h1')), h3=f(h.get('h3')), h6=f(h.get('h6')), h12=f(h.get('h12')))
    if i in ret:
        r = ret[i]
        for k in ['r0', '1', '2', '3', '5', '7', '10', '15', '20', '25', '30', '35', '40', '45', 'end', 'stayed', 'avgS', 'avgPct']:
            V[i]['c'+k] = f(r[k])
        v = V[i]
        v['seg3_10'] = v['c10']/v['c3']; v['seg10_20'] = v['c20']/v['c10']; v['seg20_30'] = v['c30']/v['c20']
        v['seg30_40'] = v['c40']/v['c30']; v['seg5_15'] = v['c15']/v['c5']; v['seg10_30'] = v['c30']/v['c10']
        v['kept_after3'] = v['c30']/v['c3']

def table(title, subset, targets, feats):
    print('\n==', title, 'n=%d' % len(subset))
    print('%-12s' % 'feature' + ''.join('%12s' % t for t in targets))
    for ft in feats:
        row = '%-12s' % ft
        for t in targets:
            c, n = spear([V[i].get(ft) for i in subset], [V[i].get(t) for i in subset])
            row += '%12s' % ('%.2f(%d)' % (c, n) if c is not None else '-')
        print(row)

feats = ['cr0', 'c1', 'c3', 'c5', 'c7', 'c10', 'c15', 'c20', 'c25', 'c30', 'c35', 'c40', 'c45', 'cend', 'cstayed', 'cavgS', 'cavgPct',
         'seg3_10', 'seg5_15', 'seg10_20', 'seg20_30', 'seg30_40', 'seg10_30', 'kept_after3', 'len']
allr = ids
fed = [i for i in ids if V[i]['posted'] >= '10-11']           # fed normally from hour 1
old = [i for i in ids if V[i]['posted'] < '10-11']
short = [i for i in ids if V[i]['len'] <= 55]
longs = [i for i in fed if V[i]['len'] > 55]
table('ALL Shorts with a curve', allr, ['now', 'v168'], feats)
table('Posted Oct 11+ (normal start)', fed, ['v24', 'v72', 'v168', 'now'], feats)
table('Oct 11+ and 60s+ only', longs, ['v24', 'v72', 'v168', 'now'], feats)
table('45-55s only', short, ['v24', 'v72', 'now'], feats)

# growth multiples
print('\n== growth after day 1 (Oct 11+)')
for i in fed:
    v = V[i]
    if v['v24'] and v['v168']: v['mult'] = v['v168']/v['v24']
    if v['v24'] and v['v72']: v['m72'] = v['v72']/v['v24']
table('what predicts the 7d/24h and 72h/24h multiple', fed, ['mult', 'm72'], feats)

# early velocity
print('\n== how early can you tell (Oct 11+): rank corr of hour-N views with later totals')
for a in ['h1', 'h3', 'h6', 'h12', 'v24']:
    print(a, ['%s %.2f(%d)' % ((t,)+spear([V[i][a] for i in fed], [V[i].get(t) for i in fed])) for t in ['v24', 'v72', 'v168', 'now']])

# audience
print('\n== new-viewer share / channel-page share vs views (all with data)')
have = [i for i in meta if V[i].get('new')]
for a in ['new', 'pch', 'psh']:
    print(a, ['%s %.2f(%d)' % ((t,)+spear([V[i][a] for i in have], [V[i].get(t) for i in have])) for t in ['v24', 'v72', 'v168', 'now']])
print('new share vs c30:', spear([V[i]['new'] for i in have if i in ret], [V[i]['c30'] for i in have if i in ret]))

print('\n== per video')
print('%-14s %5s %3s %6s %6s %6s %6s %6s %6s %8s %8s %8s %9s %5s %5s %6s %6s' % ('name', 'date', 'len', 'c3', 'c10', 'c20', 'c30', 'c40', 'end', 'v24', 'v72', 'v168', 'now', 'new%', 'chan%', 'sub/1K', 'last24'))
for i in meta:
    v = V[i]
    g = lambda k, fmt='%6.1f': (fmt % v[k]) if v.get(k) is not None else ' '*int(fmt[1])
    print('%-14s %5s %3d %s %s %s %s %s %s %8s %8s %8s %9d %5s %5s %6.2f %6s' % (v['name'], v['posted'], v['len'], g('c3'), g('c10'), g('c20'), g('c30'), g('c40'), g('cend'),
          int(v['v24']) if v['v24'] else '', int(v['v72']) if v['v72'] else '', int(v['v168']) if v['v168'] else '', v['now'],
          v['new'] if v['new'] else '', v['pch'], 1000*v['subs']/v['now'], int(v['last24']) if v['last24'] else ''))

tot = sum(V[i]['now'] for i in meta); eng = sum(V[i]['eng'] or 0 for i in meta)
print('\nTOTAL Shorts views %d, engaged %d (%.1f%%), subs from Shorts %d' % (tot, eng, 100*eng/tot, sum(V[i]['subs'] for i in meta)))
print('views last 24h all Shorts: %d ; from Shorts posted before Oct 20: %d' % (sum(V[i]['last24'] or 0 for i in meta), sum(V[i]['last24'] or 0 for i in meta if V[i]['posted'] < '10-20')))
top5 = sorted(meta, key=lambda i: -V[i]['now'])[:5]
print('top5 share of all views: %.1f%%' % (100*sum(V[i]['now'] for i in top5)/tot))

# buckets by c30
print('\n== buckets by % at 0:30 (all with curve): median views now / v168 / v24')
def med(x):
    x = sorted(x); n = len(x)
    return x[n//2] if n % 2 else (x[n//2-1]+x[n//2])/2 if n else float('nan')
for lo, hi in [(0, 55), (55, 60), (60, 65), (65, 70), (70, 72), (72, 100)]:
    b = [i for i in ids if lo <= V[i]['c30'] < hi]
    print('%d-%d: n=%d  now med %d  min %d max %d | v24 med %s | %s' % (lo, hi, len(b), med([V[i]['now'] for i in b]) if b else 0,
          min([V[i]['now'] for i in b]) if b else 0, max([V[i]['now'] for i in b]) if b else 0,
          med([V[i]['v24'] for i in b if V[i]['v24'] and V[i]['posted'] >= '10-11']) if [1 for i in b if V[i]['v24'] and V[i]['posted'] >= '10-11'] else '-',
          ', '.join(V[i]['name'] for i in b)))
print('\n== buckets by % at 0:10')
for lo, hi in [(0, 80), (80, 85), (85, 88), (88, 92), (92, 200)]:
    b = [i for i in ids if lo <= V[i]['c10'] < hi]
    print('%d-%d: n=%d  now med %d  min %d max %d | %s' % (lo, hi, len(b), med([V[i]['now'] for i in b]), min([V[i]['now'] for i in b]), max([V[i]['now'] for i in b]), ', '.join(V[i]['name'] for i in b)))
print('\n== buckets by avg seconds watched')
for lo, hi in [(0, 34), (34, 38), (38, 42), (42, 46), (46, 60)]:
    b = [i for i in ids if lo <= V[i]['cavgS'] < hi]
    print('%d-%d: n=%d  now med %d  min %d max %d | %s' % (lo, hi, len(b), med([V[i]['now'] for i in b]), min([V[i]['now'] for i in b]), max([V[i]['now'] for i in b]), ', '.join(V[i]['name'] for i in b)))
# weekly momentum
print('\n== 24h views by week of posting (Oct 11+)')
import collections
wk = collections.OrderedDict()
for i in meta:
    v = V[i]
    if v['posted'] >= '10-11' and v['v24']:
        key = 'Oct 11-17' if v['posted'] <= '10-17' else 'Oct 18-24' if v['posted'] <= '10-24' else 'Oct 25-31' if v['posted'] <= '10-31' else 'Nov 1-8'
        wk.setdefault(key, []).append(v)
for k, vs in wk.items():
    print(k, 'n=%d' % len(vs), 'median 24h %d' % med([x['v24'] for x in vs]), 'median c30 %.1f' % med([x['c30'] for x in vs if x.get('c30')]), 'median c10 %.1f' % med([x['c10'] for x in vs if x.get('c10')]), 'median avgS %.1f' % med([x['cavgS'] for x in vs if x.get('cavgS')]), 'median new%% %.1f' % med([x['new'] for x in vs if x.get('new')]))
