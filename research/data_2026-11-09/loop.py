import io, contextlib, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
with contextlib.redirect_stdout(io.StringIO()):
    import vis
    from vis import V, spear, ret, ids as vids
    from an import pear
import sheets as S
ids = [i for i in V if i in ret]
for i in ids:
    v = V[i]
    v['loop'] = v['cr0']-100
    v['loss0_3'] = v['cr0']-v['c3']; v['loss3_10'] = v['c3']-v['c10']; v['loss3_15'] = v['c3']-v['c15']; v['loss10_15'] = v['c10']-v['c15']
    v['loss15_30'] = v['c15']-v['c30']; v['hold15_30'] = v['c30']/v['c15']; v['hold3_10'] = v['c10']/v['c3']
    v['swiped'] = 100-v['cstayed']
    v['c3_minus_stayed'] = v['c3']-v['cstayed']
def c(a, b, sub=ids):
    r, n = spear([V[i].get(a) for i in sub], [V[i].get(b) for i in sub]); return '%s~%s %.2f(%d)' % (a, b, r, n)
print('LOOP ARTIFACT')
for a, b in [('loop', 'cend'), ('loop', 'c45'), ('loop', 'len'), ('c3', 'cend'), ('c3', 'loop'), ('loss3_10', 'loop'), ('loss3_10', 'cend'), ('loss3_15', 'loop'), ('loss3_15', 'cend'), ('loss0_3', 'loop'), ('loss0_3', 'swiped'),
             ('hold3_10', 'loop'), ('hold3_10', 'cend'), ('c15', 'loop'), ('c15', 'cend'), ('c15', 'cstayed'), ('c3', 'cstayed'), ('c10', 'cstayed'), ('c30', 'cstayed'), ('loss15_30', 'loop'), ('c3_minus_stayed', 'loop')]:
    print(' ', c(a, b))
# linear fit loss3_15 on loop (all), residual = early loss not explained by loopers
def fit(xs, ys):
    n = len(xs); mx = sum(xs)/n; my = sum(ys)/n
    b = sum((x-mx)*(y-my) for x, y in zip(xs, ys))/sum((x-mx)**2 for x in xs); return b, my-b*mx
for tgt in ['loss3_10', 'loss3_15']:
    b, a = fit([V[i]['loop'] for i in ids], [V[i][tgt] for i in ids])
    print('fit %s = %.2f*loop + %.1f ; pearson %.2f' % (tgt, b, a, pear([V[i]['loop'] for i in ids], [V[i][tgt] for i in ids])))
    for i in ids: V[i]['res_'+tgt] = V[i][tgt]-(b*V[i]['loop']+a)
# estimate first-timer curve: F(t) = c(t) - loop*g(t); unknown g. Show c15 - k*loop for a few k and its link with views
print('\nvs views: raw and loop-adjusted')
fed = [i for i in ids if V[i]['posted'] >= '10-11']
for k in ['c10', 'c15', 'c30', 'hold3_10', 'res_loss3_10', 'res_loss3_15', 'loop', 'cend', 'hold15_30', 'loss15_30', 'cstayed']:
    print('  %-13s' % k, ' '.join(c(k, t, sub).split(' ')[1] + '/' + t for sub, ts in [(ids, ['now']), (fed, ['v24', 'v168', 'now'])] for t in ts))
for kk in (0.3, 0.5, 0.7):
    for t0 in ('c10', 'c15', 'c30'):
        for i in ids: V[i]['adj'] = V[i][t0]-kk*V[i]['loop']*(1 if t0 == 'c10' else 0.7 if t0 == 'c15' else 0.35)
        print('  %s - %.1f*loop*decay:' % (t0, kk), c('adj', 'now'), c('adj', 'v24', fed), c('adj', 'v168', fed))
TYPE = {}
for n in 'bh passed,sun vanished'.split(','): TYPE[n] = 'A hidden'
for n in 'tornado,rogue planet,metal rod,moon explodes,nuke,tsunami,yellowstone,earthquake,earth stops,jupiter,friction,fall into bh'.split(','): TYPE[n] = 'C grows'
print('\n%-14s %-9s %3s %5s %5s %5s %5s %5s %5s %5s | %6s %6s %6s %6s | %9s' % ('name', 'type', 'len', 'r0', 'end', 'stay', 'c3', 'c10', 'c15', 'c30', 'l3_10', 'res10', 'res15', 'h1530', 'now'))
for i in sorted(ids, key=lambda i: V[i]['res_loss3_15']):
    v = V[i]; t = TYPE.get(v['name'], 'B event' if i in vids else '-')
    v['type'] = t
    print('%-14s %-9s %3d %5.0f %5.1f %5.1f %5.0f %5.1f %5.1f %5.1f | %6.1f %+6.1f %+6.1f %6.3f | %9d' % (v['name'], t, v['len'], v['cr0'], v['cend'], v['cstayed'], v['c3'], v['c10'], v['c15'], v['c30'], v['loss3_10'], v['res_loss3_10'], v['res_loss3_15'], v['hold15_30'], v['now']))
import statistics as st
for t in ['A hidden', 'B event', 'C grows']:
    g = [V[i] for i in ids if V[i].get('type') == t]
    print(t, 'n=%d' % len(g), 'median res10 %+.1f res15 %+.1f loss3_10 %.1f loop %.0f hold15_30 %.3f c15 %.1f c30 %.1f views %d' % tuple(st.median([x[k] for x in g]) for k in ['res_loss3_10', 'res_loss3_15', 'loss3_10', 'loop', 'hold15_30', 'c15', 'c30', 'now']))
