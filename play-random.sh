#!/bin/bash
# play-random.sh — Play a random AoE2 sound from a category
# Usage: play-random.sh <category>
# Categories: session-start, task-complete, permission, idle, error

set -euo pipefail

SOUNDS_DIR="$HOME/.claude/sounds/aoe2"
CONFIG_FILE="$SOUNDS_DIR/config.json"
LAST_PLAYED_DIR="$SOUNDS_DIR/.last-played"
CATEGORY="${1:-}"

if [[ -z "$CATEGORY" ]]; then
  exit 0
fi

CATEGORY_DIR="$SOUNDS_DIR/sounds/$CATEGORY"

# Check category directory exists and has sounds
if [[ ! -d "$CATEGORY_DIR" ]]; then
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
if [[ "$ENABLED" == "False" ]]; then
  exit 0
fi

VOLUME=$(read_config "volume" "0.5")

# ── Gather sound files ───────────────────────────────────────────────────────

SOUNDS=()
while IFS= read -r -d '' file; do
  SOUNDS+=("$file")
done < <(find "$CATEGORY_DIR" -type f \( -name "*.mp3" -o -name "*.m4a" -o -name "*.wav" -o -name "*.ogg" \) -print0 2>/dev/null)

if [[ ${#SOUNDS[@]} -eq 0 ]]; then
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

# Record for no-repeat
echo "$CHOSEN" > "$LAST_FILE"

# ── Convert volume (0.0–1.0) to afplay scale (0–256) ────────────────────────

AFPLAY_VOL=$(python3 -c "print(int(float('$VOLUME') * 256))" 2>/dev/null || echo "128")

# ── Play sound (background, non-blocking) ────────────────────────────────────

afplay -v "$AFPLAY_VOL" "$CHOSEN" &>/dev/null &
disown

exit 0
