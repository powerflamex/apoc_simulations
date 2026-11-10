# contact sheet of stills/: python sheet.py [names...] -> stills/sheet.png
import sys, glob, os
from PIL import Image, ImageDraw
files = sys.argv[1:] or sorted(glob.glob('stills/t_*.png'))
files = [f if os.path.exists(f) else os.path.join('stills', f) for f in files]
w, h = 360, 640
cols = min(len(files), 4)
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 24)), 'black')
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    sheet.paste(im, (x, y + 24))
    d.text((x + 6, y + 5), os.path.basename(f), fill='white')
sheet.save('stills/sheet.png')
