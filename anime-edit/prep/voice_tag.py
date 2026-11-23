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
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'bm_lewis'    # the owner picked voice 2 (Lewis) from samples
SPEED = 0.9
OUT = sys.argv[2] if len(sys.argv) > 2 else None             # a sample: the first 4.5 s of the mix, to this file
BEAT, B0 = 0.6914, 0.058
DROP1 = B0 + 4 * BEAT
# (text, time its first sound lands, gain, echo)
PARTS = [('Ee.', B0 + 0.0 * BEAT, 1.0, 'short'), ('Em.', B0 + 1 * BEAT, 1.0, 'short'),
         ('Bee.', B0 + 2 * BEAT, 1.0, 'short'), ('Eye.', B0 + 3 * BEAT, 1.0, 'carry'),
         ('Embee.', DROP1 + 0.025, 1.15, 'long')]
LEAD = 0.0            # each letter's attack lands right on the beat
VOICE_GAIN = 0.62     # voice level in the mix (peak, after processing)
DUCK = 0.5            # the music dips to half (-6 dB) under the voice
SR = 44100

ECHO = {'short': 'aecho=0.8:0.5:70|150:0.30|0.16',
        'carry': 'aecho=0.8:0.55:90|200|330|480:0.34|0.22|0.14|0.08',   # the "I" echoes on into "embi"
        'long': 'aecho=0.85:0.55:60|120|200|300:0.38|0.28|0.18|0.10'}
LETTERS_FX = (f"asplit=2[a][b];"
              f"[a]asetrate={SR}*0.86,aresample={SR},atempo=1.10[m];"                         # ~2.6 semitones deeper
              f"[b]asetrate={SR}*0.5,aresample={SR},atempo=1.9,lowpass=f=800,volume=0.35[s];"   # octave-down shadow
              f"[m][s]amix=inputs=2:normalize=0,highpass=f=55,equalizer=f=120:t=q:w=1:g=4,"
              f"equalizer=f=3000:t=q:w=1.4:g=5,lowpass=f=10000,"
              f"acompressor=threshold=-22dB:ratio=5:attack=1:release=80:makeup=6,asoftclip=type=tanh,apad=pad_dur=0.8,")
# The final "embi" sounds like a different, bigger voice than the letters (owner, Nov 22): same Lewis voice, slower,
# with its own character. Pick with WORD=<name>.
WORD_FX = {
    # a demon: 6 semitones deeper (and deeper body), slower, a loud octave-down growl, driven hard, long echo
    'demon': (f"asplit=2[a][b];[a]asetrate={SR}*0.71,aresample={SR},atempo=1.08[m];"
              f"[b]asetrate={SR}*0.355,aresample={SR},atempo=2.16,lowpass=f=700,volume=0.6[s];"
              f"[m][s]amix=inputs=2:normalize=0,highpass=f=40,equalizer=f=100:t=q:w=1:g=5,equalizer=f=2500:t=q:w=1.4:g=4,"
              f"volume=2.5,asoftclip=type=atan,acompressor=threshold=-20dB:ratio=4:attack=2:release=120:makeup=3,"
              f"apad=pad_dur=1.2,aecho=0.85:0.6:80|170|280|420:0.40|0.30|0.20|0.12"),
    # a giant: 8 semitones deeper and slowed down (no tempo fix), a wide chorus, a huge echo
    'giant': (f"asplit=2[a][b];[a]asetrate={SR}*0.64,aresample={SR}[m];"
              f"[b]asetrate={SR}*0.32,aresample={SR},atempo=2.0,lowpass=f=600,volume=0.5[s];"
              f"[m][s]amix=inputs=2:normalize=0,chorus=0.6:0.9:50|60:0.4|0.32:0.25|0.4:2|2.3,highpass=f=40,"
              f"equalizer=f=110:t=q:w=1:g=4,equalizer=f=2200:t=q:w=1.4:g=5,"
              f"acompressor=threshold=-22dB:ratio=5:attack=2:release=120:makeup=6,asoftclip=type=tanh,"
              f"apad=pad_dur=1.6,aecho=0.8:0.7:120|260|420|640:0.45|0.35|0.25|0.15"),
    # a broadcast: crushed, narrow "radio" voice over a deep sub, with a slapback echo
    'radio': (f"asplit=2[a][b];[a]asetrate={SR}*0.8,aresample={SR},atempo=1.1,highpass=f=400,lowpass=f=3200,"
              f"acrusher=bits=8:samples=2:mix=0.6,volume=3,asoftclip=type=tanh[m];"
              f"[b]asetrate={SR}*0.4,aresample={SR},atempo=2.2,lowpass=f=400,volume=0.7[s];"
              f"[m][s]amix=inputs=2:normalize=0,acompressor=threshold=-20dB:ratio=4:attack=2:release=100:makeup=4,"
              f"apad=pad_dur=1.0,aecho=0.8:0.6:90|180:0.40|0.25"),
}
WORD = os.environ.get('WORD', 'radio')                     # the owner's pick
WORD_DUCK = 0.35      # the music dips much less under "embi", so the drop keeps its punch
SWELL = 0.55          # a reversed-echo swell of "embi" rising out of the "I" into the word (smooth handoff)

def ff(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def load(p):
    a, sr = sf.read(p, always_2d=True); assert sr == SR; return a.mean(1)

import librosa
from kokoro_onnx import Kokoro
K = os.path.join(A, 'kokoro')
kok = Kokoro(os.path.join(K, 'kokoro-v1.0.onnx'), os.path.join(K, 'voices-v1.0.bin'))
tmp = tempfile.mkdtemp()
song, sr = sf.read(os.path.join(A, 'song.wav'), always_2d=True); assert sr == SR
clips = []
for i, (text, at, gain, echo) in enumerate(PARTS):
    word = echo == 'long'
    a, ksr = kok.create(text, voice=VOICE, speed=0.8 if word else SPEED, lang='en-us')
    raw = os.path.join(tmp, f'{i}_raw.wav'); out = os.path.join(tmp, f'{i}.wav')
    sf.write(raw, a, ksr)
    fx = WORD_FX[WORD] if word else LETTERS_FX + ECHO[echo]
    ff(['-i', raw, '-filter_complex',
        f"[0:a]aresample={SR},silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
        f"silenceremove=start_periods=1:start_threshold=-50dB,areverse,{fx}", '-ar', str(SR), out])
    v = load(out)
    v /= np.max(np.abs(v)) + 1e-9
    clips.append((text, at, gain, v, int(np.argmax(np.abs(v) > 0.05))))   # + its first real sound

# Each letter's ATTACK (its sharpest rise, e.g. the "b" pop) goes on the beat, not its first sound: Lewis's "B" hums
# for ~0.12 s before the pop, which put the heard B a tenth of a second late. Place by first sound, measure each
# attack in the voice track, shift by the error, place again.
HOP = 220
def place(shift, word_scale=1.0):
    out = np.zeros(len(song))
    for k, ((text, at, gain, v, on), sh) in enumerate(zip(clips, shift)):
        s0 = int((at - LEAD + sh) * SR) - on
        w = v[max(0, -s0):]; s0 = max(0, s0); n = min(len(w), len(out) - s0)
        out[s0:s0 + n] += (word_scale if k == len(clips) - 1 else 1) * gain * VOICE_GAIN * w[:n]
    return out
def attacks(track, shift):
    o = librosa.onset.onset_strength(y=track.astype(np.float32), sr=SR, hop_length=HOP)
    t = librosa.times_like(o, sr=SR, hop_length=HOP); res = []
    for (text, at, gain, v, on), sh in zip(clips, shift):
        start = at - LEAD + sh                                  # where its first sound is
        m = np.where((t > start - 0.01) & (t < start + 0.15))[0]
        res.append(t[m[np.argmax(o[m])]])
    return np.array(res)
shift = np.zeros(len(clips))
for _ in range(3):
    err = attacks(place(shift), shift) - np.array([c[1] for c in clips])
    shift -= err
voice = place(shift)
for c, a in zip(clips, attacks(voice, shift)):
    print(f'{c[0]:8s} attack {a:6.3f} s  (beat {c[1]:6.3f})')
# reversed-echo swell into the word: reverse its first 0.3 s, give it a 0.45 s echo, reverse back; the echo now
# rises toward the word and ends exactly where the word starts
from scipy.signal import fftconvolve
text, at, gain, v, on = clips[-1]
w0 = int((at - LEAD + shift[-1]) * SR)                  # where the word's first sound lands
seg = v[on:on + int(0.3 * SR)]; L = int(0.45 * SR)
ir = np.random.default_rng(1).standard_normal(L) * np.exp(-np.arange(L) / (0.12 * SR))
swell = fftconvolve(seg[::-1], ir)[::-1][:L - 1]
swell *= SWELL * gain * VOICE_GAIN / (np.max(np.abs(swell)) + 1e-9)
voice[w0 - len(swell):w0] += swell
# the music dips under the voice (much less under the word): smooth envelope, fast down, slow back up
env = np.abs(place(shift, WORD_DUCK)); a_up, a_dn = np.exp(-1 / (0.004 * SR)), np.exp(-1 / (0.16 * SR))
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
    sf.write(OUT, mix[:int(5.0 * SR)], SR, subtype='PCM_16'); print('sample', OUT); sys.exit()
sf.write(os.path.join(A, 'song_tagged.wav'), mix, SR, subtype='PCM_16')
sf.write(os.path.join(A, 'tag_embi.wav'), voice[:int((DROP1 + 1.2) * SR)], SR, subtype='PCM_16')
print('wrote assets/song_tagged.wav, assets/tag_embi.wav')
