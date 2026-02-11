#!/bin/bash
# play-error.sh — Play AoE2 error sound with smart filtering and cooldown
# Reads tool failure info from stdin, only fires on interesting failures.
# Skips: grep no-match, which not-found, ls no-such-file, etc.

set -euo pipefail

SOUNDS_DIR="$HOME/.claude/sounds/aoe2"
CONFIG_FILE="$SOUNDS_DIR/config.json"
COOLDOWN_FILE="$SOUNDS_DIR/.last-error-time"
PLAY_SCRIPT="$SOUNDS_DIR/scripts/play-random.sh"

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

# Check if error category is enabled
ENABLED=$(read_config "categories.error" "True")
if [[ "$ENABLED" == "False" ]]; then
  exit 0
fi

COOLDOWN=$(read_config "cooldown_seconds" "15")

# ── Cooldown check ───────────────────────────────────────────────────────────

NOW=$(date +%s)
if [[ -f "$COOLDOWN_FILE" ]]; then
  LAST_TIME=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo "0")
  ELAPSED=$((NOW - LAST_TIME))
  if [[ $ELAPSED -lt $COOLDOWN ]]; then
    exit 0
  fi
fi

# ── Read stdin (hook input JSON) ─────────────────────────────────────────────

INPUT=""
if [[ ! -t 0 ]]; then
  INPUT=$(cat)
fi

# ── Smart filter: skip benign failures ───────────────────────────────────────

if [[ -n "$INPUT" ]] && command -v python3 &>/dev/null; then
  SHOULD_PLAY=$(python3 -c "
import json, sys

BENIGN_PATTERNS = [
    'grep',
    'which',
    'command not found',
    'No such file or directory',
    'no matches found',
    'not found in PATH',
    'find: ',
    'ls: cannot access',
    'cat: no such file',
    'test -',
    'diff --',
    '[ -f',
    '[ -d',
    '[ -e',
    'head -',
    'tail -',
    'wc -',
    'stat ',
]

INTERESTING_PATTERNS = [
    'error',
    'Error',
    'ERROR',
    'FAILED',
    'failed',
    'FAIL',
    'fail',
    'exception',
    'Exception',
    'panic',
    'Panic',
    'fatal',
    'Fatal',
    'FATAL',
    'segfault',
    'Segmentation',
    'permission denied',
    'Permission denied',
    'conflict',
    'CONFLICT',
    'syntax error',
    'SyntaxError',
    'TypeError',
    'ReferenceError',
    'ImportError',
    'ModuleNotFoundError',
    'npm ERR',
    'build failed',
    'compilation error',
    'compile error',
    'test failed',
    'assertion',
    'AssertionError',
    'SIGKILL',
    'SIGTERM',
    'SIGSEGV',
    'exit code',
    'exit status',
    'non-zero',
    'git merge',
    'merge conflict',
]

try:
    data = json.loads('''$INPUT'''.replace(\"'''\", ''))
except:
    try:
        data = json.loads(sys.stdin.read()) if sys.stdin.readable() else {}
    except:
        data = {}

# Extract relevant text from the hook input
text = json.dumps(data).lower() if data else ''

# Check if it matches any benign pattern
for p in BENIGN_PATTERNS:
    if p.lower() in text:
        # Could still be interesting if it also has interesting patterns
        has_interesting = any(ip.lower() in text for ip in INTERESTING_PATTERNS)
        if not has_interesting:
            print('skip')
            sys.exit(0)

# Check for interesting patterns
for p in INTERESTING_PATTERNS:
    if p.lower() in text:
        print('play')
        sys.exit(0)

# Default: play (better to notify than miss a real error)
print('play')
" 2>/dev/null || echo "play")

  if [[ "$SHOULD_PLAY" == "skip" ]]; then
    exit 0
  fi
fi

# ── Record cooldown timestamp ────────────────────────────────────────────────

echo "$NOW" > "$COOLDOWN_FILE"

# ── Play the error sound ─────────────────────────────────────────────────────

exec "$PLAY_SCRIPT" error
