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

$Sounds = @(Get-ChildItem -Path $CategoryDir -File -Recurse -Include *.mp3,*.m4a,*.wav,*.ogg 2>$null)

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

Write-DebugLog "Launching MediaPlayer for: $ChosenPath (volume=$Volume)"

# Launch playback in a hidden background process so it doesn't block Claude Code
$playCommand = @"
Add-Type -AssemblyName presentationCore
`$player = New-Object System.Windows.Media.MediaPlayer
`$player.Volume = $Volume
`$player.Open([Uri]::new('$($ChosenPath -replace "'", "''")'))
`$player.Play()
Start-Sleep -Seconds 15
"@

Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command $playCommand" -WindowStyle Hidden

Write-DebugLog "Script complete"
exit 0
