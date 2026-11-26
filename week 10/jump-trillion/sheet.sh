# usage: bash sheet.sh out.png f1 f2 ... (up to 9 stills, 3x3)
out=$1; shift; n=$#; args=""; fc=""; lay=""
i=0; for f in "$@"; do args="$args -i $f"; fc="$fc[$i]scale=360:640[s$i];"; i=$((i+1)); done
L=(0_0 w0_0 w0+w1_0 0_h0 w0_h0 w0+w1_h0 0_h0+h1 w0_h0+h1 w0+w1_h0+h1)
ins=""; for j in $(seq 0 $((n-1))); do ins="$ins[s$j]"; lay="$lay${L[$j]}|"; done
ffmpeg -y -loglevel error $args -filter_complex "$fc${ins}xstack=inputs=$n:layout=${lay%|}" "$out"
