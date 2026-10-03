# play-random.ps1 — Play a random AoE2 sound from a category (Windows)
# Usage: play-random.ps1 <category>
# Categories: session-start, task-complete, permission, error

param(
    [Parameter(Position=0)]
    [string]$Category
)

$ErrorActionPreference = "SilentlyContinue"

$SoundsDir = Join-Path $env:USERPROFILE ".claude\sounds\aoe2"
$ConfigFile = Join-Path $SoundsDir "config.json"
$LastPlayedDir = Join-Path $SoundsDir ".last-played"
$DebugLog = Join-Path $SoundsDir "debug.log"

# ── Debug logging (toggle via "debug": true in config.json) ──────────────────

$DebugEnabled = $false
if (Test-Path $ConfigFile) {
    try {
        $configObj = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        $DebugEnabled = [bool]$configObj.debug
    } catch {}
}

function Write-DebugLog {
    param([string]$Message)
    if ($DebugEnabled) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        try {
            Add-Content -Path $DebugLog -Value "[$timestamp] [play-random] $Message"
        } catch {}
    }
}

Write-DebugLog "========== INVOKED: play-random.ps1 $Category =========="
Write-DebugLog "USERPROFILE=$env:USERPROFILE"
Write-DebugLog "PWD=$(Get-Location)"
Write-DebugLog "SOUNDS_DIR=$SoundsDir (exists: $(Test-Path $SoundsDir))"

if ([string]::IsNullOrEmpty($Category)) {
    Write-DebugLog "EXIT: empty category"
    exit 0
}

$CategoryDir = Join-Path $SoundsDir "sounds\$Category"

if (-not (Test-Path $CategoryDir)) {
    Write-DebugLog "EXIT: category dir missing: $CategoryDir"
    exit 0
}

# ── Read config ──────────────────────────────────────────────────────────────

$Volume = 0.5
$CategoryEnabled = $true

if (Test-Path $ConfigFile) {
    try {
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($null -ne $config.volume) {
            $Volume = [double]$config.volume
        }
        if ($null -ne $config.categories -and $null -ne $config.categories.$Category) {
            $CategoryEnabled = [bool]$config.categories.$Category
        }
    } catch {
        Write-DebugLog "Config parse error: $_"
    }
}

Write-DebugLog "Category '$Category' enabled: $CategoryEnabled"
if (-not $CategoryEnabled) {
    Write-DebugLog "EXIT: category disabled"
    exit 0
}

Write-DebugLog "Volume: $Volume"

# ── Gather sound files ───────────────────────────────────────────────────────

# Note: -Include requires -Recurse or a wildcard in -Path to work reliably
$Sounds = @(Get-ChildItem -Path (Join-Path $CategoryDir "*") -File -Include *.mp3,*.m4a,*.wav,*.ogg -ErrorAction SilentlyContinue)

Write-DebugLog "Sound files found: $($Sounds.Count)"
Write-DebugLog "Files: $(($Sounds | ForEach-Object { $_.FullName }) -join ', ')"

if ($Sounds.Count -eq 0) {
    Write-DebugLog "EXIT: no sound files found in $CategoryDir"
    exit 0
}

# ── No-repeat logic ─────────────────────────────────────────────────────────

if (-not (Test-Path $LastPlayedDir)) {
    New-Item -ItemType Directory -Path $LastPlayedDir -Force | Out-Null
}

$LastFile = Join-Path $LastPlayedDir $Category
$LastPlayed = ""

if (Test-Path $LastFile) {
    try {
        $LastPlayed = (Get-Content $LastFile -Raw).Trim()
    } catch {}
}

# Filter out last played (if we have more than 1 sound)
if ($Sounds.Count -gt 1 -and $LastPlayed -ne "") {
    $Filtered = @($Sounds | Where-Object { $_.FullName -ne $LastPlayed })
    if ($Filtered.Count -gt 0) {
        $Sounds = $Filtered
    }
}

# ── Pick random sound ────────────────────────────────────────────────────────

$Chosen = $Sounds[(Get-Random -Maximum $Sounds.Count)]
$ChosenPath = $Chosen.FullName
Write-DebugLog "Chosen: $ChosenPath"

# Record for no-repeat
try {
    Set-Content -Path $LastFile -Value $ChosenPath -NoNewline
} catch {}

# ── Play sound (background, non-blocking) ────────────────────────────────────

Write-DebugLog "Launching playback for: $ChosenPath (volume=$Volume)"

# Write a temporary playback script to avoid argument-quoting issues with paths
# that contain spaces (e.g. C:\Users\John Doe\...).
# Strategy: the WinRT MediaPlayer first (Media Foundation, present on every
# Windows 10/11), then WMPlayer.OCX, then WPF MediaPlayer with -STA; the last
# two need the optional Windows Media Player feature.
$tempScript = Join-Path $env:TEMP "aoe2-play-$(Get-Random).ps1"

try {
    @"
try {
    # Attempt 1: the WinRT MediaPlayer, on Media Foundation. It needs no
    # Windows Media Player, which some Windows installs leave out.
    [void][Windows.Media.Playback.MediaPlayer, Windows.Media, ContentType = WindowsRuntime]
    [void][Windows.Media.Core.MediaSource, Windows.Media, ContentType = WindowsRuntime]
    `$player = New-Object Windows.Media.Playback.MediaPlayer
    `$player.Volume = $Volume
    `$player.Source = [Windows.Media.Core.MediaSource]::CreateFromUri([Uri]'$($ChosenPath -replace "'", "''")')
    `$player.Play()
    `$deadline = (Get-Date).AddSeconds(15)
    # Wait for it to start (3 Playing), then for it to finish
    `$startBy = (Get-Date).AddSeconds(3)
    while ([int]`$player.PlaybackSession.PlaybackState -ne 3 -and (Get-Date) -lt `$startBy) {
        Start-Sleep -Milliseconds 50
    }
    if ([int]`$player.PlaybackSession.PlaybackState -ne 3) { throw 'WinRT playback did not start' }
    while (@(1, 2, 3) -contains [int]`$player.PlaybackSession.PlaybackState -and (Get-Date) -lt `$deadline) {
        Start-Sleep -Milliseconds 100
    }
    `$player.Dispose()
} catch {
try {
    # Attempt 2: Windows Media Player COM object (synchronous, simple)
    `$wmp = New-Object -ComObject WMPlayer.OCX -ErrorAction Stop
    `$wmp.settings.mute = `$false
    `$wmp.settings.volume = [Math]::Max(1, [int]($Volume * 100))
    `$wmp.URL = '$($ChosenPath -replace "'", "''")'
    `$wmp.controls.play()
    `$deadline = (Get-Date).AddSeconds(15)
    # Wait for playback to start: 0 Undefined, 6 Buffering, 7 Waiting, 9 Transitioning, 10 Ready
    while (@(0, 6, 7, 9, 10) -contains `$wmp.playState -and (Get-Date) -lt `$deadline) {
        Start-Sleep -Milliseconds 100
    }
    # Then for it to finish: 3 Playing (6 and 9 can recur mid-clip)
    while (@(3, 6, 9) -contains `$wmp.playState -and (Get-Date) -lt `$deadline) {
        Start-Sleep -Milliseconds 100
    }
    `$wmp.close()
} catch {
    # Attempt 3: WPF MediaPlayer (always available on Windows 10/11)
    try {
        Add-Type -AssemblyName PresentationCore
        `$player = New-Object System.Windows.Media.MediaPlayer
        `$player.Open([Uri]'$($ChosenPath -replace "'", "''")')
        Start-Sleep -Milliseconds 500
        `$player.Volume = $Volume
        `$player.Play()
        Start-Sleep -Seconds 5
        `$player.Close()
    } catch {}
}
} finally {
    Remove-Item -Path '$($tempScript -replace "'", "''")' -Force -ErrorAction SilentlyContinue
}
"@ | Set-Content -Path $tempScript -Encoding UTF8

    # -STA flag ensures single-threaded apartment mode required by WPF MediaPlayer
    Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -NoProfile -STA -ExecutionPolicy Bypass -File `"$tempScript`"" -WindowStyle Hidden
    Write-DebugLog "Spawned background playback process"
} catch {
    Write-DebugLog "Failed to launch playback: $_"
    Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
}

Write-DebugLog "Script complete"
exit 0
