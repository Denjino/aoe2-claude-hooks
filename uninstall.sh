#!/bin/bash
# uninstall.sh — Remove AoE2 Claude Code hooks

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="$HOME/.claude/sounds/aoe2"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo ""
echo -e "${YELLOW}  ⚔️  Uninstalling AoE2 Claude Code Hooks${NC}"
echo ""

read -p "  Remove all AoE2 sounds and hooks? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "  ${DIM}Cancelled.${NC}"
  exit 0
fi

echo -e "${BLUE}[1/2]${NC} Removing hooks from settings..."

if [[ -f "$SETTINGS_FILE" ]] && command -v python3 &>/dev/null; then
  python3 << 'REMOVE_SCRIPT'
import json, os

settings_path = os.path.expanduser("~/.claude/settings.json")

try:
    with open(settings_path, 'r') as f:
        settings = json.load(f)
except:
    exit(0)

if 'hooks' not in settings:
    exit(0)

AOE2_MARKER = "aoe2"

for event in list(settings['hooks'].keys()):
    matchers = settings['hooks'][event]
    cleaned_matchers = []

    for matcher_entry in matchers:
        filtered_hooks = [
            h for h in matcher_entry.get('hooks', [])
            if AOE2_MARKER not in h.get('command', '')
        ]
        if filtered_hooks:
            matcher_entry['hooks'] = filtered_hooks
            cleaned_matchers.append(matcher_entry)

    if cleaned_matchers:
        settings['hooks'][event] = cleaned_matchers
    else:
        del settings['hooks'][event]

if not settings.get('hooks'):
    del settings['hooks']

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
REMOVE_SCRIPT

  echo -e "  ${GREEN}✓${NC} Hooks removed from settings.json"
else
  echo -e "  ${YELLOW}⚠${NC}  Could not update settings.json"
fi

echo -e "${BLUE}[2/2]${NC} Removing files..."

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo -e "  ${GREEN}✓${NC} Removed $INSTALL_DIR"
else
  echo -e "  ${DIM}Nothing to remove at $INSTALL_DIR${NC}"
fi

echo ""
echo -e "${GREEN}  Uninstalled.${NC} Your other Claude Code settings are preserved."
echo -e "  ${DIM}\"The wonder... the wonder... the wonder has been destroyed.\"${NC}"
echo ""
