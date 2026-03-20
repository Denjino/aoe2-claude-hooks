# install.ps1 — Install AoE2 sound effects for Claude Code (Windows)
# One-liner: irm https://raw.githubusercontent.com/Denjino/aoe2-claude-hooks/main/install.ps1 | iex
# Or clone:  git clone https://github.com/Denjino/aoe2-claude-hooks.git; cd aoe2-claude-hooks; .\install.ps1

$ErrorActionPreference = "Stop"

# ── AoE2 ASCII Banner ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║  " -ForegroundColor Yellow -NoNewline
Write-Host "⚔️  Age of Empires II — Claude Code Hooks" -NoNewline
Write-Host "  ║" -ForegroundColor Yellow
Write-Host "  ║                                                  ║" -ForegroundColor Yellow
Write-Host "  ║  " -ForegroundColor Yellow -NoNewline
Write-Host """Start the game already!""" -ForegroundColor DarkGray -NoNewline
Write-Host "                       ║" -ForegroundColor Yellow
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# ── Platform check ───────────────────────────────────────────────────────────

if ($env:OS -ne "Windows_NT") {
    Write-Host "  This installer is for Windows. Use install.sh on macOS/Linux." -ForegroundColor Red
    exit 1
}

# Verify PowerShell can load WPF for audio playback
try {
    Add-Type -AssemblyName presentationCore -ErrorAction Stop
    Write-Host "  ✓ Audio playback available (WPF MediaPlayer)" -ForegroundColor Green
} catch {
    Write-Host "  Warning: WPF MediaPlayer not available. Sounds may not play." -ForegroundColor Yellow
}

# ── Paths ────────────────────────────────────────────────────────────────────

$InstallDir = Join-Path $env:USERPROFILE ".claude\sounds\aoe2"
$SettingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"

# Detect if running from repo clone or remote
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$FromRepo = (Test-Path (Join-Path $ScriptDir "hooks-windows.json")) -and (Test-Path (Join-Path $ScriptDir "play-random.ps1"))

$GitHubRepo = "Denjino/aoe2-claude-hooks"
$GitHubBranch = "main"
$GitHubRaw = "https://raw.githubusercontent.com/$GitHubRepo/$GitHubBranch"

# ── Functions ────────────────────────────────────────────────────────────────

function Download-File {
    param([string]$Url, [string]$Dest)
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Count-Sounds {
    param([string]$Dir)
    if (-not (Test-Path $Dir)) { return 0 }
    return @(Get-ChildItem -Path $Dir -File -Recurse -Include *.mp3,*.m4a,*.wav,*.ogg -ErrorAction SilentlyContinue).Count
}

# ── Step 1: Create directory structure ───────────────────────────────────────

Write-Host "[1/5]" -ForegroundColor Blue -NoNewline
Write-Host " Creating directory structure..."

$Dirs = @(
    (Join-Path $InstallDir "scripts"),
    (Join-Path $InstallDir "sounds\session-start"),
    (Join-Path $InstallDir "sounds\task-complete"),
    (Join-Path $InstallDir "sounds\permission"),
    (Join-Path $InstallDir "sounds\error"),
    (Join-Path $InstallDir ".last-played")
)

foreach ($d in $Dirs) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}

Write-Host "  ✓ " -ForegroundColor Green -NoNewline
Write-Host "Directories created at " -NoNewline
Write-Host $InstallDir -ForegroundColor DarkGray

# ── Step 2: Install scripts and config ───────────────────────────────────────

Write-Host "[2/5]" -ForegroundColor Blue -NoNewline
Write-Host " Installing scripts..."

if ($FromRepo) {
    Copy-Item (Join-Path $ScriptDir "play-random.ps1") (Join-Path $InstallDir "scripts\play-random.ps1") -Force
    Copy-Item (Join-Path $ScriptDir "play-error.ps1") (Join-Path $InstallDir "scripts\play-error.ps1") -Force
    Copy-Item (Join-Path $ScriptDir "sounds.json") (Join-Path $InstallDir "sounds.json") -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path (Join-Path $InstallDir "config.json"))) {
        Copy-Item (Join-Path $ScriptDir "config.json") (Join-Path $InstallDir "config.json") -Force
    }
} else {
    $ok = Download-File "$GitHubRaw/play-random.ps1" (Join-Path $InstallDir "scripts\play-random.ps1")
    if (-not $ok) {
        Write-Host "  ✗ Failed to download play-random.ps1" -ForegroundColor Red
        exit 1
    }

    $ok = Download-File "$GitHubRaw/play-error.ps1" (Join-Path $InstallDir "scripts\play-error.ps1")
    if (-not $ok) {
        Write-Host "  ✗ Failed to download play-error.ps1" -ForegroundColor Red
        exit 1
    }

    Download-File "$GitHubRaw/sounds.json" (Join-Path $InstallDir "sounds.json") | Out-Null

    if (-not (Test-Path (Join-Path $InstallDir "config.json"))) {
        $ok = Download-File "$GitHubRaw/config.json" (Join-Path $InstallDir "config.json")
        if (-not $ok) {
            # Write default config
            @{
                volume = 0.5
                cooldown_seconds = 15
                categories = @{
                    "session-start" = $true
                    "task-complete" = $true
                    permission = $true
                    error = $true
                }
            } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $InstallDir "config.json")
        }
    }
}

Write-Host "  ✓ " -ForegroundColor Green -NoNewline
Write-Host "Scripts installed"

# ── Step 3: Install sounds ───────────────────────────────────────────────────

Write-Host "[3/5]" -ForegroundColor Blue -NoNewline
Write-Host " Installing sounds..."

$Categories = @("session-start", "task-complete", "permission", "error")
$TotalSounds = 0
$SoundsInstalled = $false

if ($FromRepo) {
    foreach ($cat in $Categories) {
        $srcDir = Join-Path $ScriptDir "sounds\$cat"
        if (Test-Path $srcDir) {
            $localCount = Count-Sounds $srcDir
            if ($localCount -gt 0) {
                $destDir = Join-Path $InstallDir "sounds\$cat"
                Get-ChildItem -Path $srcDir -File -Include *.mp3,*.m4a,*.wav,*.ogg -Recurse | ForEach-Object {
                    Copy-Item $_.FullName $destDir -Force
                }
                $SoundsInstalled = $true
            }
        }
    }
}

if (-not $SoundsInstalled) {
    $SoundsZip = Join-Path $env:TEMP "aoe2-claude-sounds.zip"
    Write-Host "  Checking for downloadable sound pack..." -ForegroundColor DarkGray

    $ok = Download-File "https://github.com/$GitHubRepo/releases/latest/download/sounds.zip" $SoundsZip
    if ($ok) {
        Write-Host "  Extracting sound pack..." -ForegroundColor DarkGray
        try {
            Expand-Archive -Path $SoundsZip -DestinationPath (Join-Path $InstallDir "sounds") -Force
            $SoundsInstalled = $true
        } catch {}
        Remove-Item $SoundsZip -Force -ErrorAction SilentlyContinue
    }
}

foreach ($cat in $Categories) {
    $catCount = Count-Sounds (Join-Path $InstallDir "sounds\$cat")
    $TotalSounds += $catCount
}

if ($TotalSounds -gt 0) {
    Write-Host "  ✓ " -ForegroundColor Green -NoNewline
    Write-Host "$TotalSounds sound files installed"
    Write-Host ""
    foreach ($cat in $Categories) {
        $catCount = Count-Sounds (Join-Path $InstallDir "sounds\$cat")
        Write-Host "    $($cat): " -ForegroundColor DarkGray -NoNewline
        Write-Host "$catCount sounds"
    }
    Write-Host ""
} else {
    Write-Host "  ⚠  No sound files found. You need to add them!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Drop .mp3 files into these folders:"
    Write-Host ""
    foreach ($cat in $Categories) {
        Write-Host "    $InstallDir\sounds\$cat\" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "  Or place a " -NoNewline
    Write-Host "sounds.zip" -NoNewline
    Write-Host " in GitHub Releases with this structure:"
    Write-Host "    session-start\*.mp3, task-complete\*.mp3, etc." -ForegroundColor DarkGray
    Write-Host ""
}

# ── Step 4: Merge hooks into settings.json ───────────────────────────────────

Write-Host "[4/5]" -ForegroundColor Blue -NoNewline
Write-Host " Configuring Claude Code hooks..."

# Load hooks
if ($FromRepo) {
    $HooksJson = Get-Content (Join-Path $ScriptDir "hooks-windows.json") -Raw | ConvertFrom-Json
} else {
    $hooksTemp = Join-Path $env:TEMP "aoe2-hooks-windows.json"
    $ok = Download-File "$GitHubRaw/hooks-windows.json" $hooksTemp
    if (-not $ok) {
        Write-Host "  ✗ Failed to download hooks-windows.json" -ForegroundColor Red
        exit 1
    }
    $HooksJson = Get-Content $hooksTemp -Raw | ConvertFrom-Json
    Remove-Item $hooksTemp -Force -ErrorAction SilentlyContinue
}

# Resolve %USERPROFILE% in hook commands to actual path
$resolvedProfile = $env:USERPROFILE -replace '\\', '\\'

# Ensure settings directory exists
$settingsDir = Split-Path $SettingsFile -Parent
if (-not (Test-Path $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
}

# Load existing settings
$settings = @{}
if (Test-Path $SettingsFile) {
    try {
        $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json
    } catch {
        $settings = [PSCustomObject]@{}
    }
}

# Backup existing settings
$backupTime = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$SettingsFile.backup.$backupTime"
if (Test-Path $SettingsFile) {
    Copy-Item $SettingsFile $backupPath -Force
}

# Ensure hooks property exists
if (-not ($settings.PSObject.Properties.Name -contains 'hooks')) {
    $settings | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([PSCustomObject]@{})
}

$AOE2_MARKER = "aoe2"
$newHookEvents = $HooksJson.hooks

# Merge each hook event
foreach ($eventName in $newHookEvents.PSObject.Properties.Name) {
    $newMatchers = $newHookEvents.$eventName

    # Ensure event exists in settings
    if (-not ($settings.hooks.PSObject.Properties.Name -contains $eventName)) {
        $settings.hooks | Add-Member -NotePropertyName $eventName -NotePropertyValue @()
    }

    $existing = @($settings.hooks.$eventName)

    foreach ($newMatcher in $newMatchers) {
        # Remove existing aoe2 hooks
        $cleaned = @()
        foreach ($existingMatcher in $existing) {
            if ($null -eq $existingMatcher) { continue }
            $filteredHooks = @()
            foreach ($h in $existingMatcher.hooks) {
                if ($h.command -and $h.command -notlike "*$AOE2_MARKER*") {
                    $filteredHooks += $h
                }
            }
            if ($filteredHooks.Count -gt 0) {
                $existingMatcher.hooks = $filteredHooks
                $cleaned += $existingMatcher
            } elseif ($null -eq $existingMatcher.hooks -or $existingMatcher.hooks.Count -eq 0) {
                $cleaned += $existingMatcher
            }
        }
        $existing = $cleaned

        # Resolve %USERPROFILE% in new matcher commands
        foreach ($h in $newMatcher.hooks) {
            if ($h.command) {
                $h.command = $h.command -replace '%USERPROFILE%', $env:USERPROFILE
            }
        }

        $existing += $newMatcher
    }

    $settings.hooks.$eventName = $existing
}

# Write settings back (CRITICAL: -Depth 10 to avoid truncation)
$settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile -Encoding UTF8

Write-Host "  ✓ " -ForegroundColor Green -NoNewline
Write-Host "Hooks merged into " -NoNewline
Write-Host $SettingsFile -ForegroundColor DarkGray
Write-Host "  Backup saved to $backupPath" -ForegroundColor DarkGray

# ── Step 5: Verify ───────────────────────────────────────────────────────────

Write-Host "[5/5]" -ForegroundColor Blue -NoNewline
Write-Host " Verifying installation..."

$Errors = 0

foreach ($script in @("play-random.ps1", "play-error.ps1")) {
    $scriptPath = Join-Path $InstallDir "scripts\$script"
    if (Test-Path $scriptPath) {
        Write-Host "  ✓ " -ForegroundColor Green -NoNewline
        Write-Host "$script is installed"
    } else {
        Write-Host "  ✗ $script is missing" -ForegroundColor Red
        $Errors++
    }
}

try {
    $verifySettings = Get-Content $SettingsFile -Raw | ConvertFrom-Json
    $hooks = $verifySettings.hooks
    $hasSessionStart = $hooks.PSObject.Properties.Name -contains 'SessionStart'
    $hasStop = $hooks.PSObject.Properties.Name -contains 'Stop'
    $hasNotification = $hooks.PSObject.Properties.Name -contains 'Notification'

    if ($hasSessionStart -and $hasStop -and $hasNotification) {
        Write-Host "  ✓ " -ForegroundColor Green -NoNewline
        Write-Host "Hooks configured in settings.json"
    } else {
        Write-Host "  ✗ Hooks not properly configured" -ForegroundColor Red
        $Errors++
    }
} catch {
    Write-Host "  ✗ Could not verify settings.json" -ForegroundColor Red
    $Errors++
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
if ($Errors -eq 0) {
    Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  Installation complete!" -ForegroundColor Green
    Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Green
} else {
    Write-Host "  Installation finished with $Errors warning(s)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Start a new Claude Code session to hear it."
Write-Host ""
Write-Host "  Config:  " -ForegroundColor DarkGray -NoNewline
Write-Host "$InstallDir\config.json"
Write-Host "  Sounds:  " -ForegroundColor DarkGray -NoNewline
Write-Host "$InstallDir\sounds\"
Write-Host "  Hooks:   " -ForegroundColor DarkGray -NoNewline
Write-Host $SettingsFile
Write-Host ""

if ($TotalSounds -eq 0) {
    Write-Host "  ⚠ Don't forget to add your AoE2 sound files!" -ForegroundColor Yellow
    Write-Host "  See README.md for where to find them." -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "  ""Wololo"" 🔔" -ForegroundColor DarkGray
Write-Host ""
