# ⚔️ AoE2 Claude Hooks

Age of Empires II sound effects for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Your terminal becomes a medieval command center — villager sounds on session start, build chimes when tasks complete, "Wololo" when Claude needs permission, and error tones on failures.

> *"Prrroh"* — every time you start a session

## Install

### macOS / Linux

**One-liner** (no clone needed):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/install.sh)
```

**Or from the repo:**

```bash
git clone https://github.com/Denjino/aoe2-claude-hooks.git
cd aoe2-claude-hooks
./install.sh
```

### Windows

**One-liner** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/install.ps1 | iex
```

**Or from the repo:**

```powershell
git clone https://github.com/Denjino/aoe2-claude-hooks.git
cd aoe2-claude-hooks
.\install.ps1
```

---

The installer copies scripts to `~/.claude/sounds/aoe2/` (macOS/Linux) or `%USERPROFILE%\.claude\sounds\aoe2\` (Windows), merges hooks into your `settings.json`, and backs up your existing config.

**Start a new Claude Code session** and you'll hear it.

## What It Does

Uses [Claude Code hooks](https://code.claude.com/docs/en/hooks) to trigger AoE2 sound effects on four events:

| Event | Hook | What Plays |
| --- | --- | --- |
| **Session starts** | `SessionStart` | Villager / building creation sounds |
| **Task completes** | `Stop` | Build completion chimes |
| **Needs permission** | `Notification` | "Wololo", "Ayoyoyo" |
| **Error occurs** | `PostToolUseFailure` | Neutral error tone |

Error sounds are smart-filtered — they only fire on real failures (build errors, test failures, git conflicts, crashes). Routine noise like `grep` no-match or `which` not-found is silenced. A configurable cooldown (default 15s) prevents rapid-fire.

## Sound List

### Session Start (2 sounds)

| Sound | File |
| --- | --- |
| Villager creation — "Prrroh" | `villager-creation.mp3` |
| Building creation — "Ssssho" | `building-creation.mp3` |

### Task Complete (4 sounds)

| Sound | File |
| --- | --- |
| Build sound 1 | `build-1.mp3` |
| Build sound 2 | `build-2.mp3` |
| Build sound — Chinese | `build-chinese.mp3` |
| Build sound — Indian | `build-indian.mp3` |

### Permission Needed (2 sounds)

| Sound | File |
| --- | --- |
| Monk "Wololo" | `wololo.mp3` |
| "Ayoyoyo" | `ayoyoyo.mp3` |

### Error (1 sound)

| Sound | File |
| --- | --- |
| Neutral error | `neutral.mp3` |

## Configuration

Edit `~/.claude/sounds/aoe2/config.json` (macOS/Linux) or `%USERPROFILE%\.claude\sounds\aoe2\config.json` (Windows):

```json
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
```

| Setting | Default | Description |
| --- | --- | --- |
| `volume` | `0.5` | Volume level, 0.0 (silent) to 1.0 (full) |
| `cooldown_seconds` | `15` | Minimum seconds between error sounds |
| `categories.*` | `true` | Toggle individual sound categories on/off |

Changes take effect immediately — no restart needed.

## Features

- 🔊 **Volume control** — 0.0–1.0, quiet enough for the office
- 🔀 **No repeats** — Tracks last played per category, never the same sound twice in a row
- ⏱️ **Error cooldown** — Configurable cooldown prevents rapid-fire error sounds
- 🎛️ **Category toggles** — Enable/disable any category independently
- 🧠 **Smart error filtering** — Only fires on real failures, ignores benign noise
- 📦 **Drop-in sounds** — Add/remove/swap sounds anytime, just drop files in the folder

## Add Custom Sounds

Drop any `.mp3`, `.m4a`, `.wav`, or `.ogg` file into the appropriate folder:

```
~/.claude/sounds/aoe2/sounds/
├── session-start/     ← villager creation, game start
├── task-complete/     ← build chimes, research complete
├── permission/        ← wololo, attack warnings
└── error/             ← resource warnings, error tones
```

The random picker includes any audio file it finds — filenames don't matter. Add as many or as few as you like.

## Hosting Sounds for Auto-Download

To enable the one-liner install with automatic sound download:

1. Zip your sounds preserving the folder structure:
   ```bash
   cd ~/.claude/sounds/aoe2/sounds
   zip -r sounds.zip session-start/ task-complete/ permission/ error/
   ```
2. Create a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) on the repo
3. Upload `sounds.zip` as a release asset
4. The install script automatically downloads from `releases/latest/download/sounds.zip`

## Manual Install

If you prefer not to run the installer:

### macOS / Linux

1. Copy the full directory to `~/.claude/sounds/aoe2/`
2. Make scripts executable:
   ```bash
   chmod +x ~/.claude/sounds/aoe2/scripts/play-random.sh
   chmod +x ~/.claude/sounds/aoe2/scripts/play-error.sh
   ```
3. Copy the hooks from `hooks.json` into your `~/.claude/settings.json` under the `"hooks"` key
4. Add your sound files to the `sounds/` subdirectories

### Windows

1. Copy the full directory to `%USERPROFILE%\.claude\sounds\aoe2\`
2. Copy `play-random.ps1` and `play-error.ps1` into the `scripts\` subdirectory
3. Copy the hooks from `hooks-windows.json` into your `%USERPROFILE%\.claude\settings.json` under the `"hooks"` key (replace `%USERPROFILE%` in the command paths with your actual user profile path)
4. Add your sound files to the `sounds\` subdirectories

## Uninstall

### macOS / Linux

```bash
./uninstall.sh
```

Or if you used the one-liner:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/uninstall.sh)
```

### Windows

```powershell
.\uninstall.ps1
```

Or if you used the one-liner:

```powershell
irm https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/uninstall.ps1 | iex
```

Removes sounds, scripts, and hooks from `settings.json`. Your other Claude Code settings are preserved.

## Requirements

- **Claude Code** — with hooks support
- **macOS** — uses `afplay` for audio playback + `python3` for config parsing (both pre-installed)
- **Windows** — uses .NET `MediaPlayer` via PowerShell (built-in, no extra dependencies)
- **Linux** — swap `afplay -v $AFPLAY_VOL` for `paplay --volume=$PULSE_VOL` or `mpv --volume=$VOL --really-quiet` in `scripts/play-random.sh`; requires `python3`

## How It Works

1. Claude Code fires hook events at lifecycle points (session start, task stop, notifications, errors)
2. Our hooks call `play-random.sh <category>` (macOS/Linux) or `play-random.ps1 <category>` (Windows)
3. The script reads `config.json`, picks a random sound (avoiding repeats), and plays it in the background — via `afplay` on macOS or .NET `MediaPlayer` on Windows
4. Error sounds go through a smart filter that checks the failure JSON for real errors vs. benign noise

All sounds play asynchronously — they never block Claude Code's execution.

## Credits

- Sound effects from Age of Empires II © Microsoft Corporation / Xbox Game Studios
- Included for personal, non-commercial use
- Inspired by [sc2-claude-hooks](https://github.com/samhayek-code/sc2-claude-hooks) and [peon-ping](https://peon-ping.vercel.app/)

## License

MIT — the code, not the sounds. Age of Empires audio is property of Microsoft Corporation.

---

*"Wololo" 🔔*
