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
# Strategy: try WMPlayer.OCX first (simpler, synchronous), fall back to WPF
# MediaPlayer with -STA (always available, needs single-threaded apartment).
$tempScript = Join-Path $env:TEMP "aoe2-play-$(Get-Random).ps1"

try {
    @"
try {
    # Attempt 1: Windows Media Player COM object (synchronous, simple)
    `$wmp = New-Object -ComObject WMPlayer.OCX -ErrorAction Stop
    `$wmp.settings.volume = [int]($Volume * 100)
    `$wmp.URL = '$($ChosenPath -replace "'", "''")'
    `$wmp.controls.play()
    Start-Sleep -Milliseconds 500
    while (`$wmp.playState -eq 3 -or `$wmp.playState -eq 6 -or `$wmp.playState -eq 0) {
        Start-Sleep -Milliseconds 200
    }
    `$wmp.close()
} catch {
    # Attempt 2: WPF MediaPlayer (always available on Windows 10/11)
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
