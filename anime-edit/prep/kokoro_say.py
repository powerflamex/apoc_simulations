"""Speak short lines offline with Kokoro (assets/kokoro: kokoro-v1.0.onnx + voices-v1.0.bin) into .wav files.

    python -P prep/kokoro_say.py <voice> <speed> <out folder> <name>=<text> [<name>=<text> ...]
e.g. python -P prep/kokoro_say.py am_onyx 0.9 work e=Ee. word=Em-bee.
"""
import sys, os, soundfile as sf
from kokoro_onnx import Kokoro
here = os.path.dirname(os.path.abspath(__file__))
K = os.path.join(here, '..', 'assets', 'kokoro')
k = Kokoro(os.path.join(K, 'kokoro-v1.0.onnx'), os.path.join(K, 'voices-v1.0.bin'))
voice, speed, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
os.makedirs(out, exist_ok=True)
for arg in sys.argv[4:]:
    name, text = arg.split('=', 1)
    a, sr = k.create(text, voice=voice, speed=speed, lang='en-us')
    sf.write(os.path.join(out, f'{voice}_{name}.wav'), a, sr)
    print(voice, name, round(len(a) / sr, 2), 's', sr)
