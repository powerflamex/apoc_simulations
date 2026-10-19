# contact sheet of stills/t_*.png sorted by time (no labels): python sheet.py out.png [cols] [w]
import glob, os, subprocess, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stills'))
out = sys.argv[1] if len(sys.argv) > 1 else 'sheet.png'
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 5
w = int(sys.argv[3]) if len(sys.argv) > 3 else 270
h = w * 16 // 9
fs = sorted(glob.glob('t_*.png'), key=lambda f: float(f[2:-4]))
args = []
for f in fs: args += ['-i', f]
fc = ''.join(f'[{i}:v]scale={w}:{h}[v{i}];' for i in range(len(fs)))
fc += ''.join(f'[v{i}]' for i in range(len(fs)))
fc += f'xstack=inputs={len(fs)}:layout=' + '|'.join(f'{(k % cols) * w}_{(k // cols) * h}' for k in range(len(fs))) + ':fill=black'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args, '-filter_complex', fc, out], check=True)
print(out, [f[2:-4] for f in fs])
