#!/usr/bin/env bash
# The spoken "embi" tag on the first drop, in the style of kodoae2's "kodo" tag (measured from his sound: a deep man's
# voice falling from ~80 to ~60 Hz, ~0.4 s, right on the drop, an echo tail, about as loud as the song).
# Built offline from Windows' own voice (David), pitched down, thickened with a quiet octave-down copy, warmed,
# lightly driven and given an echo. Writes assets/tag_embi.wav and assets/song_tagged.wav (the song the video uses).
#   bash prep/voice_tag.sh
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
powershell -ExecutionPolicy Bypass -File prep/say.ps1 -voice David -rate -2 -out "$(cygpath -w "$T")\\raw.wav" -text "Em bee."
TRIM="silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
ffmpeg -v error -y -i "$T/raw.wav" -filter_complex "
  [0:a]$TRIM,asplit=2[a][b];
  [a]asetrate=44100*0.75,aresample=44100,atempo=1.3[main];
  [b]asetrate=44100*0.5,aresample=44100,atempo=1.95,lowpass=f=900,volume=0.45[sub];
  [main][sub]amix=inputs=2:normalize=0,
  highpass=f=60,equalizer=f=140:t=q:w=1:g=5,equalizer=f=2800:t=q:w=1.5:g=3,lowpass=f=9500,
  acompressor=threshold=-20dB:ratio=4:attack=2:release=90:makeup=5,
  asoftclip=type=tanh,
  apad=pad_dur=0.6,
  aecho=0.85:0.55:55|110|190|290:0.35|0.26|0.17|0.10,
  alimiter=limit=0.7,
  pan=stereo|c0=c0|c1=c0" -ar 44100 assets/tag_embi.wav
# on the first drop (2.824 s): the voice starts a hair after the kick, like the reference's
ffmpeg -v error -y -i assets/song.wav -i assets/tag_embi.wav -filter_complex "
  [1:a]adelay=2850|2850,volume=${TAG_GAIN:-1.12}[t];
  [0:a][t]amix=inputs=2:normalize=0:duration=first,volume=0.89" -c:a pcm_s16le assets/song_tagged.wav   # no limiter: it delays the song
rm -rf "$T"
echo "wrote assets/tag_embi.wav, assets/song_tagged.wav"
