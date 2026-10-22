#!/usr/bin/env bash
# The render gate: one render at a time on this PC, shared by every session and worktree (state in ~/.apoc-render).
# A render waits while another one is running, while the owner has paused renders (desktop shortcuts
# "Pause renders" / "Resume renders"), while the laptop is on battery, while the graphics card is still hot from
# the last render, while the owner is playing a game, or while something else is using the graphics card.
#   wrap a render:  bash render-gate.sh <label> <command ...>
#   or source it:   . render-gate.sh; gate_enter <label>; ...; gate_leave     (render-v4.sh does this per video)
# While a render holds the gate, render-gate.ps1 checks the PC every 10 s and writes how many CPU cores the upload
# copy may use (render.mjs reads $RENDER_THREADS_FILE before each piece): 4 while the owner is at the PC, 8 once
# he has been away for 5 min, 2 on battery.
GATE_DIR="$(cygpath -u "${USERPROFILE:-$HOME}" 2>/dev/null || echo "$HOME")/.apoc-render"
GATE_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$GATE_DIR"
GATE_ME=$(cat /proc/$$/winpid 2>/dev/null || echo $$)
GATE_MON=
export RENDER_THREADS_FILE="$GATE_DIR/threads"

_gate_alive() { tasklist //FI "PID eq $1" //NH 2>/dev/null | grep -qw "$1"; }
_gate_say() { [ "$1" = "$_gate_last" ] || { echo "[$(date +%H:%M)] $1"; _gate_last=$1; }; }
_gate_paused="renders are paused (the desktop shortcut \"Resume renders\" starts them again); waiting"

gate_enter() {
  local label=${1:-render} holder idle ac temp util max game tries=0 t0=$SECONDS
  _gate_last=
  # 1. wait for our turn
  while :; do
    if [ -e "$GATE_DIR/paused" ]; then _gate_say "$label: $_gate_paused"
    elif mkdir "$GATE_DIR/lock" 2>/dev/null; then
      echo "$GATE_ME" > "$GATE_DIR/lock/pid"; echo "$label" > "$GATE_DIR/lock/label"; break
    else
      holder=$(cat "$GATE_DIR/lock/pid" 2>/dev/null)
      # a render that crashed or was stopped leaves its lock behind: take it over
      if [ -n "$holder" ] && ! _gate_alive "$holder"; then rm -rf "$GATE_DIR/lock"; continue; fi
      _gate_say "$label: waiting in line ($(cat "$GATE_DIR/lock/label" 2>/dev/null) is rendering)"
    fi
    sleep 10
  done
  # 2. our turn: watch the PC, and start once it's plugged in, cool and free
  rm -f "$GATE_DIR/state"
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$(cygpath -w "$GATE_HERE/render-gate.ps1")" \
    -Dir "$(cygpath -w "$GATE_DIR")" -Owner "$GATE_ME" > /dev/null 2>&1 &
  GATE_MON=$!
  while :; do
    if ! read -r idle ac temp util max game 2>/dev/null < "$GATE_DIR/state"; then
      [ $((tries += 1)) -gt 12 ] && { echo "$label: can't read the PC's state; rendering anyway"; break; }
      sleep 5; continue
    fi
    if [ -e "$GATE_DIR/paused" ]; then _gate_say "$label: $_gate_paused"
    elif [ "$ac" = 0 ]; then _gate_say "$label: the laptop is on battery; waiting for the charger"
    elif [ "$temp" -ge 65 ]; then _gate_say "$label: letting the graphics card cool down first (${temp}°C, starts under 65°C)"
    elif [ "$game" != - ] && [ "$idle" -lt 300 ]; then _gate_say "$label: you're playing $game; waiting until it's closed (or you're away 5 min)"
    elif [ "$util" -ge 40 ]; then _gate_say "$label: something else is using the graphics card heavily ($util%); waiting"
    else break; fi
    sleep 10
  done
  [ $((SECONDS - t0)) -ge 30 ] && echo "[$(date +%H:%M)] $label: starting (waited $(((SECONDS - t0) / 60)) min)"
  return 0
}

gate_leave() {
  [ -n "$GATE_MON" ] || return 0
  local max; read -r _ _ _ _ max _ 2>/dev/null < "$GATE_DIR/state" && [ "${max:-0}" -gt 0 ] && echo "hottest the graphics card got: ${max}°C"
  kill "$GATE_MON" 2>/dev/null; GATE_MON=
  [ "$(cat "$GATE_DIR/lock/pid" 2>/dev/null)" = "$GATE_ME" ] && rm -rf "$GATE_DIR/lock"
  return 0
}
trap gate_leave EXIT
trap 'exit 130' INT TERM HUP   # a stopped render still lets go of the gate

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  label=$1; shift
  gate_enter "$label"; "$@"; rc=$?; gate_leave; exit $rc
fi
