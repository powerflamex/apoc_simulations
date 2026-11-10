import os, io, contextlib
from PIL import Image, ImageDraw, ImageFont
import sheets as S
D = S.D
name2id = {S.meta[i]['name']: i for i in S.FOLDER}
F = lambda n: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', n)
def montage(out, title, groups, times, tw=196):
    """groups: [(heading, colour, [names])]"""
    th = int(tw*16/9); lab = 30; left = 250; head = 44; top = 60
    nrows = sum(len(g[2]) for g in groups)
    W = left+len(times)*tw; H = top+len(groups)*head+nrows*(th+lab)
    im = Image.new('RGB', (W, H), (18, 18, 20)); dr = ImageDraw.Draw(im)
    dr.text((14, 14), title, fill=(255, 255, 255), font=F(26))
    y = top
    for heading, colr, names in groups:
        dr.rectangle((0, y, W, y+head-6), fill=colr); dr.text((14, y+7), heading, fill=(255, 255, 255), font=F(22)); y += head
        for n in names:
            vid = name2id[n]; v = S.video(vid)
            S.run(only=[vid], times=times, tw=tw, cols=8, tag='_tmp') if not all(os.path.exists(os.path.join(S.FR, '%s_%05.1f_%d.jpg' % (vid, t, tw))) for t in times) else None
            m = S.meta[vid]
            dr.text((12, y+lab+8), n.upper(), fill=(255, 255, 255), font=F(22))
            if vid in S.curves:
                a, b = S.at(vid, times[0]), S.at(vid, times[-1])
                dr.text((12, y+lab+44), '0:%02d  %.0f%%' % (times[0], a), fill=(200, 200, 200), font=F(19))
                dr.text((12, y+lab+70), '0:%02d  %.0f%%' % (times[-1], b), fill=(200, 200, 200), font=F(19))
                dr.text((12, y+lab+104), 'lost %.0f points' % (a-b), fill=(255, 120, 120) if colr[0] > 100 else (130, 255, 130), font=F(21))
            if m['views24']: dr.text((12, y+lab+140), 'day 1: %s views' % format(int(m['views24']), ','), fill=(170, 170, 170), font=F(17))
            dr.text((12, y+lab+166), 'posted %s' % m['posted'], fill=(120, 120, 120), font=F(16))
            for k, t in enumerate(times):
                x = left+k*tw; fp = os.path.join(S.FR, '%s_%05.1f_%d.jpg' % (vid, t, tw))
                if os.path.exists(fp): im.paste(Image.open(fp).resize((tw, th)), (x, y+lab))
                txt = '0:%02d' % t + ('   %.0f%%' % S.at(vid, t) if vid in S.curves else '')
                dr.text((x+6, y+5), txt, fill=(255, 255, 255), font=F(18))
            y += th+lab
    im.save(out, quality=84); print('saved', out, im.size)
if __name__ == '__main__':
    with contextlib.redirect_stdout(io.StringIO()):
        pass
    O = os.path.join(D, 'show'); os.makedirs(O, exist_ok=True)
    montage(os.path.join(O, '1_first_10_seconds.jpg'), 'The first 10 seconds: % still watching above each frame',
            [('HOLD: the picture is clearly different by 0:07, or the danger is hidden behind a racing countdown', (30, 110, 60), ['fall through', 'bh passed', 'electrons']),
             ('LOSE: the danger is all there on frame 0 and only grows slowly', (150, 45, 45), ['tornado', 'rogue planet', 'metal rod', 'moon explodes'])],
            [3, 5, 7, 9, 11])
    montage(os.path.join(O, '2_middle_0-13_to_0-30.jpg'), 'The middle (0:13 to 0:30): % still watching above each frame',
            [('GO FLAT: one person or one street-level place stays in frame while things change', (30, 110, 60), ['grow trillion', 'rain', 'fall through']),
             ('BLEED: the camera leaves for a far, hazy or empty view', (150, 45, 45), ['antimatter', 'oxygen', 'friction'])],
            [13, 15, 18, 21, 25, 30])
    montage(os.path.join(O, '3_newest_two.jpg'), 'The two newest Shorts (no curve yet): long near-white stretches',
            [('Posted Nov 9', (70, 70, 90), ['world freezes', 'sand grain'])], [0, 3, 7, 9, 15, 21, 30])
