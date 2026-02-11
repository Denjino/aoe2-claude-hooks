#!/bin/bash
# install.sh — Install AoE2 sound effects for Claude Code
# One-liner: bash <(curl -fsSL https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/install.sh)
# Or clone:  git clone https://github.com/Denjino/aoe2-claude-hooks.git && cd aoe2-claude-hooks && ./install.sh

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── AoE2 ASCII Banner ───────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}  ╔══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}  ║${NC}  ${BOLD}⚔️  Age of Empires II — Claude Code Hooks${NC}  ${YELLOW}║${NC}"
echo -e "${YELLOW}  ║${NC}                                                  ${YELLOW}║${NC}"
echo -e "${YELLOW}  ║${NC}  ${DIM}\"Start the game already!\"${NC}                       ${YELLOW}║${NC}"
echo -e "${YELLOW}  ╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Platform check ───────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}Error:${NC} This installer is built for macOS (uses afplay)."
  echo -e "${DIM}Linux support: swap afplay for paplay/mpv in play-random.sh${NC}"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo -e "${RED}Error:${NC} python3 is required (pre-installed on macOS)."
  exit 1
fi

# ── Paths ────────────────────────────────────────────────────────────────────

INSTALL_DIR="$HOME/.claude/sounds/aoe2"
SETTINGS_FILE="$HOME/.claude/settings.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect if running from repo clone or curl pipe
FROM_REPO=false
if [[ -f "$SCRIPT_DIR/hooks.json" && -d "$SCRIPT_DIR/scripts" ]]; then
  FROM_REPO=true
fi

GITHUB_REPO="Denjino/aoe2-claude-hooks"
GITHUB_BRANCH="main"
GITHUB_RAW="https://raw.githubusercontent.com/$GITHUB_REPO/$GITHUB_BRANCH"

# ── Functions ────────────────────────────────────────────────────────────────

download_file() {
  local url="$1"
  local dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL "$url" -o "$dest" 2>/dev/null
  elif command -v wget &>/dev/null; then
    wget -q "$url" -O "$dest" 2>/dev/null
  else
    return 1
  fi
}

count_sounds() {
  local dir="$1"
  find "$dir" -type f \( -name "*.mp3" -o -name "*.m4a" -o -name "*.wav" -o -name "*.ogg" \) 2>/dev/null | wc -l | tr -d ' '
}

# ── Step 1: Create directory structure ───────────────────────────────────────

echo -e "${BLUE}[1/5]${NC} Creating directory structure..."

mkdir -p "$INSTALL_DIR/scripts"
mkdir -p "$INSTALL_DIR/sounds/session-start"
mkdir -p "$INSTALL_DIR/sounds/task-complete"
mkdir -p "$INSTALL_DIR/sounds/permission"
mkdir -p "$INSTALL_DIR/sounds/error"
mkdir -p "$INSTALL_DIR/.last-played"

echo -e "  ${GREEN}✓${NC} Directories created at ${DIM}$INSTALL_DIR${NC}"

# ── Step 2: Install scripts and config ───────────────────────────────────────

echo -e "${BLUE}[2/5]${NC} Installing scripts..."

if [[ "$FROM_REPO" == "true" ]]; then
  cp "$SCRIPT_DIR/scripts/play-random.sh" "$INSTALL_DIR/scripts/"
  cp "$SCRIPT_DIR/scripts/play-error.sh" "$INSTALL_DIR/scripts/"
  cp "$SCRIPT_DIR/sounds.json" "$INSTALL_DIR/"

  if [[ ! -f "$INSTALL_DIR/config.json" ]]; then
    cp "$SCRIPT_DIR/config.json" "$INSTALL_DIR/"
  fi
else
  download_file "$GITHUB_RAW/scripts/play-random.sh" "$INSTALL_DIR/scripts/play-random.sh" || {
    echo -e "  ${RED}✗${NC} Failed to download play-random.sh"; exit 1
  }
  download_file "$GITHUB_RAW/scripts/play-error.sh" "$INSTALL_DIR/scripts/play-error.sh" || {
    echo -e "  ${RED}✗${NC} Failed to download play-error.sh"; exit 1
  }
  download_file "$GITHUB_RAW/sounds.json" "$INSTALL_DIR/sounds.json" || true

  if [[ ! -f "$INSTALL_DIR/config.json" ]]; then
    download_file "$GITHUB_RAW/config.json" "$INSTALL_DIR/config.json" || {
      cat > "$INSTALL_DIR/config.json" << 'DEFAULTCONFIG'
{
  "volume": 0.5,
  "cooldown_seconds": 15,
  "categories": {
    "session-start": true,
    "task-complete": true,
    "permission": true,
    "error": true
  }
}
DEFAULTCONFIG
    }
  fi
fi

chmod +x "$INSTALL_DIR/scripts/play-random.sh"
chmod +x "$INSTALL_DIR/scripts/play-error.sh"

echo -e "  ${GREEN}✓${NC} Scripts installed"

# ── Step 3: Install sounds ───────────────────────────────────────────────────

echo -e "${BLUE}[3/5]${NC} Installing sounds..."

CATEGORIES=("session-start" "task-complete" "permission" "error")
TOTAL_SOUNDS=0
SOUNDS_INSTALLED=false

if [[ "$FROM_REPO" == "true" ]]; then
  for cat in "${CATEGORIES[@]}"; do
    if [[ -d "$SCRIPT_DIR/sounds/$cat" ]]; then
      local_count=$(count_sounds "$SCRIPT_DIR/sounds/$cat")
      if [[ "$local_count" -gt 0 ]]; then
        cp "$SCRIPT_DIR/sounds/$cat"/*.{mp3,m4a,wav,ogg} "$INSTALL_DIR/sounds/$cat/" 2>/dev/null || true
        SOUNDS_INSTALLED=true
      fi
    fi
  done
fi

if [[ "$SOUNDS_INSTALLED" == "false" ]]; then
  SOUNDS_ZIP="/tmp/aoe2-claude-sounds.zip"
  echo -e "  ${DIM}Checking for downloadable sound pack...${NC}"

  if download_file "https://github.com/$GITHUB_REPO/releases/latest/download/sounds.zip" "$SOUNDS_ZIP" 2>/dev/null; then
    echo -e "  ${DIM}Extracting sound pack...${NC}"
    unzip -qo "$SOUNDS_ZIP" -d "$INSTALL_DIR/sounds/" 2>/dev/null && SOUNDS_INSTALLED=true
    rm -f "$SOUNDS_ZIP"
  fi
fi

for cat in "${CATEGORIES[@]}"; do
  cat_count=$(count_sounds "$INSTALL_DIR/sounds/$cat")
  TOTAL_SOUNDS=$((TOTAL_SOUNDS + cat_count))
done

if [[ $TOTAL_SOUNDS -gt 0 ]]; then
  echo -e "  ${GREEN}✓${NC} $TOTAL_SOUNDS sound files installed"
  echo ""
  for cat in "${CATEGORIES[@]}"; do
    cat_count=$(count_sounds "$INSTALL_DIR/sounds/$cat")
    echo -e "    ${DIM}$cat:${NC} $cat_count sounds"
  done
  echo ""
else
  echo -e "  ${YELLOW}⚠${NC}  No sound files found. You need to add them!"
  echo ""
  echo -e "  Drop .mp3 files into these folders:"
  echo ""
  for cat in "${CATEGORIES[@]}"; do
    echo -e "    ${DIM}$INSTALL_DIR/sounds/$cat/${NC}"
  done
  echo ""
  echo -e "  Or place a ${BOLD}sounds.zip${NC} in GitHub Releases with this structure:"
  echo -e "    ${DIM}session-start/*.mp3, task-complete/*.mp3, etc.${NC}"
  echo ""
fi

# ── Step 4: Merge hooks into settings.json ───────────────────────────────────

echo -e "${BLUE}[4/5]${NC} Configuring Claude Code hooks..."

if [[ "$FROM_REPO" == "true" ]]; then
  HOOKS_JSON=$(cat "$SCRIPT_DIR/hooks.json")
else
  HOOKS_JSON=$(download_file "$GITHUB_RAW/hooks.json" /dev/stdout 2>/dev/null) || {
    echo -e "  ${RED}✗${NC} Failed to download hooks.json"; exit 1
  }
fi

mkdir -p "$(dirname "$SETTINGS_FILE")"
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 << MERGE_SCRIPT
import json
import sys
from datetime import datetime

settings_path = "$SETTINGS_FILE"
hooks_json = '''$HOOKS_JSON'''

try:
    with open(settings_path, 'r') as f:
        settings = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    settings = {}

try:
    new_hooks = json.loads(hooks_json)
except json.JSONDecodeError as e:
    print(f"Error parsing hooks.json: {e}", file=sys.stderr)
    sys.exit(1)

backup_path = settings_path + f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
with open(backup_path, 'w') as f:
    json.dump(settings, f, indent=2)

if 'hooks' not in settings:
    settings['hooks'] = {}

new_hook_events = new_hooks.get('hooks', {})
AOE2_MARKER = "aoe2"

for event, matchers in new_hook_events.items():
    if event not in settings['hooks']:
        settings['hooks'][event] = []

    existing = settings['hooks'][event]

    for new_matcher in matchers:
        cleaned = []
        for existing_matcher in existing:
            filtered_hooks = [
                h for h in existing_matcher.get('hooks', [])
                if AOE2_MARKER not in h.get('command', '')
            ]
            if filtered_hooks:
                existing_matcher['hooks'] = filtered_hooks
                cleaned.append(existing_matcher)
            elif not existing_matcher.get('hooks', []):
                cleaned.append(existing_matcher)
        settings['hooks'][event] = cleaned
        settings['hooks'][event].append(new_matcher)

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)

print(f"Backup saved to {backup_path}")
MERGE_SCRIPT

if [[ $? -eq 0 ]]; then
  echo -e "  ${GREEN}✓${NC} Hooks merged into ${DIM}$SETTINGS_FILE${NC}"
else
  echo -e "  ${RED}✗${NC} Failed to merge hooks"
  exit 1
fi

# ── Step 5: Verify ───────────────────────────────────────────────────────────

echo -e "${BLUE}[5/5]${NC} Verifying installation..."

ERRORS=0

for script in play-random.sh play-error.sh; do
  if [[ -x "$INSTALL_DIR/scripts/$script" ]]; then
    echo -e "  ${GREEN}✓${NC} $script is executable"
  else
    echo -e "  ${RED}✗${NC} $script is not executable"
    ERRORS=$((ERRORS + 1))
  fi
done

if python3 -c "
import json
with open('$SETTINGS_FILE') as f:
    s = json.load(f)
hooks = s.get('hooks', {})
assert 'SessionStart' in hooks, 'Missing SessionStart'
assert 'Stop' in hooks, 'Missing Stop'
assert 'Notification' in hooks, 'Missing Notification'
" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Hooks configured in settings.json"
else
  echo -e "  ${RED}✗${NC} Hooks not properly configured"
  ERRORS=$((ERRORS + 1))
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}  ══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Installation complete!${NC}"
  echo -e "${GREEN}  ══════════════════════════════════════════════════${NC}"
else
  echo -e "${YELLOW}  Installation finished with $ERRORS warning(s).${NC}"
fi

echo ""
echo -e "  ${BOLD}Start a new Claude Code session to hear it.${NC}"
echo ""
echo -e "  ${DIM}Config:${NC}  $INSTALL_DIR/config.json"
echo -e "  ${DIM}Sounds:${NC}  $INSTALL_DIR/sounds/"
echo -e "  ${DIM}Hooks:${NC}   $SETTINGS_FILE"
echo ""

if [[ $TOTAL_SOUNDS -eq 0 ]]; then
  echo -e "  ${YELLOW}⚠ Don't forget to add your AoE2 sound files!${NC}"
  echo -e "  ${DIM}See README.md for where to find them.${NC}"
  echo ""
fi

echo -e "  ${DIM}\"Wololo\"${NC} 🔔"
echo ""
