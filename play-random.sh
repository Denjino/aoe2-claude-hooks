#!/bin/bash
# play-random.sh — Play a random AoE2 sound from a category
# Usage: play-random.sh <category>
# Categories: session-start, task-complete, permission, idle, error

set -euo pipefail

SOUNDS_DIR="$HOME/.claude/sounds/aoe2"
CONFIG_FILE="$SOUNDS_DIR/config.json"
LAST_PLAYED_DIR="$SOUNDS_DIR/.last-played"
CATEGORY="${1:-}"

# ── Debug logging (toggle via "debug": true in config.json) ──────────────────

DEBUG_LOG="$SOUNDS_DIR/debug.log"
DEBUG="False"
if [[ -f "$CONFIG_FILE" ]] && command -v python3 &>/dev/null; then
  DEBUG=$(python3 -c "
import json
try:
    print(str(json.load(open('$CONFIG_FILE')).get('debug', False)))
except:
    print('False')
" 2>/dev/null || echo "False")
fi

log_debug() {
  if [[ "$DEBUG" == "True" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [play-random] $*" >> "$DEBUG_LOG" 2>/dev/null || true
  fi
}

log_debug "========== INVOKED: play-random.sh $CATEGORY =========="
log_debug "HOME=$HOME"
log_debug "PATH=$PATH"
log_debug "PWD=$(pwd)"
log_debug "SHELL=${SHELL:-unset}"
log_debug "uname=$(uname 2>/dev/null || echo unknown)"
log_debug "TERM_PROGRAM=${TERM_PROGRAM:-unset}"
log_debug "Parent PID=$$, PPID=$PPID"
log_debug "Parent process: $(ps -p $PPID -o comm= 2>/dev/null || echo unknown)"
log_debug "SOUNDS_DIR=$SOUNDS_DIR (exists: $([ -d "$SOUNDS_DIR" ] && echo yes || echo no))"

if [[ -z "$CATEGORY" ]]; then
  log_debug "EXIT: empty category"
  exit 0
fi

CATEGORY_DIR="$SOUNDS_DIR/sounds/$CATEGORY"

# Check category directory exists and has sounds
if [[ ! -d "$CATEGORY_DIR" ]]; then
  log_debug "EXIT: category dir missing: $CATEGORY_DIR"
  exit 0
fi

# ── Read config ──────────────────────────────────────────────────────────────

read_config() {
  local key="$1"
  local default="$2"
  if [[ -f "$CONFIG_FILE" ]] && command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
try:
    c = json.load(open('$CONFIG_FILE'))
    keys = '$key'.split('.')
    v = c
    for k in keys:
        v = v[k]
    print(v)
except:
    print('$default')
" 2>/dev/null || echo "$default"
  else
    echo "$default"
  fi
}

# Check if category is enabled
ENABLED=$(read_config "categories.$CATEGORY" "True")
log_debug "Category '$CATEGORY' enabled: $ENABLED"
if [[ "$ENABLED" == "False" ]]; then
  log_debug "EXIT: category disabled"
  exit 0
fi

VOLUME=$(read_config "volume" "0.5")
log_debug "Volume: $VOLUME"

# ── Gather sound files ───────────────────────────────────────────────────────

SOUNDS=()
while IFS= read -r -d '' file; do
  SOUNDS+=("$file")
done < <(find "$CATEGORY_DIR" -type f \( -name "*.mp3" -o -name "*.m4a" -o -name "*.wav" -o -name "*.ogg" \) -print0 2>/dev/null)

log_debug "Sound files found: ${#SOUNDS[@]}"
log_debug "Files: ${SOUNDS[*]:-none}"

if [[ ${#SOUNDS[@]} -eq 0 ]]; then
  log_debug "EXIT: no sound files found in $CATEGORY_DIR"
  exit 0
fi

# ── No-repeat logic ─────────────────────────────────────────────────────────

mkdir -p "$LAST_PLAYED_DIR"
LAST_FILE="$LAST_PLAYED_DIR/$CATEGORY"
LAST_PLAYED=""

if [[ -f "$LAST_FILE" ]]; then
  LAST_PLAYED=$(cat "$LAST_FILE" 2>/dev/null || true)
fi

# Filter out last played (if we have more than 1 sound)
if [[ ${#SOUNDS[@]} -gt 1 && -n "$LAST_PLAYED" ]]; then
  FILTERED=()
  for s in "${SOUNDS[@]}"; do
    if [[ "$s" != "$LAST_PLAYED" ]]; then
      FILTERED+=("$s")
    fi
  done
  if [[ ${#FILTERED[@]} -gt 0 ]]; then
    SOUNDS=("${FILTERED[@]}")
  fi
fi

# ── Pick random sound ────────────────────────────────────────────────────────

RANDOM_INDEX=$((RANDOM % ${#SOUNDS[@]}))
CHOSEN="${SOUNDS[$RANDOM_INDEX]}"
log_debug "Chosen: $CHOSEN"

# Record for no-repeat
echo "$CHOSEN" > "$LAST_FILE"

# ── Play sound (background, non-blocking) ────────────────────────────────────

log_debug "Launching: afplay -v $VOLUME $CHOSEN"
afplay -v "$VOLUME" "$CHOSEN" &>/dev/null &
PLAY_PID=$!
disown

# Verify process survived
sleep 0.1
if kill -0 "$PLAY_PID" 2>/dev/null; then
  log_debug "afplay PID=$PLAY_PID is running (good)"
else
  log_debug "afplay PID=$PLAY_PID exited immediately (bad — may have been killed or errored)"
fi

log_debug "Script complete"
exit 0
