"""The spoken tag: "E. M. B. I." one letter per beat on the first four beats (with the letters on screen), then
"embi" on the first drop, in the style of kodoae2's spoken "kodo" tag (a deep voice with an echo on the drop).

Made offline with Kokoro (voice am_onyx, naturally deep), pitched down a little, thickened with a quiet octave-down
copy, warmed, driven, given an echo, then mixed over the song with the music dipping under the voice so it's clear.
Writes assets/song_tagged.wav (the song the video uses; assets/song.wav stays clean) and assets/tag_embi.wav.

    python -P prep/voice_tag.py
"""
import os, subprocess, tempfile, numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__)); A = os.path.join(HERE, '..', 'assets')
import sys
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'am_onyx'     # the owner picks from samples
SPEED = 0.9
OUT = sys.argv[2] if len(sys.argv) > 2 else None             # a sample: the first 4.5 s of the mix, to this file
BEAT, B0 = 0.6914, 0.058
DROP1 = B0 + 4 * BEAT
# (text, time its first sound lands, gain, echo)
PARTS = [('Ee.', B0 + 0.0 * BEAT, 1.0, 'short'), ('Em.', B0 + 1 * BEAT, 1.0, 'short'),
         ('Bee.', B0 + 2 * BEAT, 1.0, 'short'), ('Eye.', B0 + 3 * BEAT, 1.0, 'short'),
         ('Embee.', DROP1 + 0.025, 1.15, 'long')]
LEAD = 0.012          # the voice starts a hair before the beat so its consonant lands on it
VOICE_GAIN = 0.62     # voice level in the mix (peak, after processing)
DUCK = 0.5            # the music dips to half (-6 dB) under the voice
SR = 44100

ECHO = {'short': 'aecho=0.8:0.5:70|150:0.30|0.16',
        'long': 'aecho=0.85:0.55:60|120|200|300:0.38|0.28|0.18|0.10'}

def ff(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def load(p):
    a, sr = sf.read(p, always_2d=True); assert sr == SR; return a.mean(1)

from kokoro_onnx import Kokoro
K = os.path.join(A, 'kokoro')
kok = Kokoro(os.path.join(K, 'kokoro-v1.0.onnx'), os.path.join(K, 'voices-v1.0.bin'))
tmp = tempfile.mkdtemp()
song, sr = sf.read(os.path.join(A, 'song.wav'), always_2d=True); assert sr == SR
voice = np.zeros(len(song))
for i, (text, at, gain, echo) in enumerate(PARTS):
    a, ksr = kok.create(text, voice=VOICE, speed=SPEED, lang='en-us')
    raw = os.path.join(tmp, f'{i}_raw.wav'); out = os.path.join(tmp, f'{i}.wav')
    sf.write(raw, a, ksr)
    ff(['-i', raw, '-filter_complex',
        f"[0:a]aresample={SR},silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
        f"silenceremove=start_periods=1:start_threshold=-50dB,areverse,asplit=2[a][b];"
        f"[a]asetrate={SR}*0.86,aresample={SR},atempo=1.10[m];"                         # ~2.6 semitones deeper
        f"[b]asetrate={SR}*0.5,aresample={SR},atempo=1.9,lowpass=f=800,volume=0.35[s];"   # octave-down shadow
        f"[m][s]amix=inputs=2:normalize=0,highpass=f=55,equalizer=f=120:t=q:w=1:g=4,"
        f"equalizer=f=3000:t=q:w=1.4:g=5,lowpass=f=10000,"
        f"acompressor=threshold=-22dB:ratio=5:attack=1:release=80:makeup=6,asoftclip=type=tanh,"
        f"apad=pad_dur=0.8,{ECHO[echo]}", '-ar', str(SR), out])
    v = load(out)
    v /= np.max(np.abs(v)) + 1e-9
    on = int(np.argmax(np.abs(v) > 0.05))                     # first real sound
    s0 = int((at - LEAD) * SR) - on
    v = v[max(0, -s0):]; s0 = max(0, s0)
    n = min(len(v), len(voice) - s0)
    voice[s0:s0 + n] += gain * VOICE_GAIN * v[:n]
    print(f'{text:8s} lands {(s0 + on) / SR:6.3f} s  (beat {at:6.3f})')
# the music dips under the voice: smooth envelope, fast down, slow back up
env = np.abs(voice); a_up, a_dn = np.exp(-1 / (0.004 * SR)), np.exp(-1 / (0.16 * SR))
e = np.zeros_like(env); x = 0.0
for i, v in enumerate(env):
    x = a_up * x + (1 - a_up) * v if v > x else a_dn * x + (1 - a_dn) * v
    e[i] = x
e = np.clip(e / (VOICE_GAIN * 0.35), 0, 1)
mix = song * (1 - (1 - DUCK) * e)[:, None] + voice[:, None]
peak = np.max(np.abs(mix))
if peak > 0.94: mix *= 0.94 / peak
print('peak before trim', round(float(peak), 3))
if OUT:
    sf.write(OUT, mix[:int(4.5 * SR)], SR, subtype='PCM_16'); print('sample', OUT); sys.exit()
sf.write(os.path.join(A, 'song_tagged.wav'), mix, SR, subtype='PCM_16')
sf.write(os.path.join(A, 'tag_embi.wav'), voice[:int((DROP1 + 1.2) * SR)], SR, subtype='PCM_16')
print('wrote assets/song_tagged.wav, assets/tag_embi.wav')
