# play-error.ps1 — Play AoE2 error sound with smart filtering and cooldown (Windows)
# Reads tool failure info from stdin, only fires on interesting failures.
# Skips: grep no-match, which not-found, ls no-such-file, etc.

$ErrorActionPreference = "SilentlyContinue"

$SoundsDir = Join-Path $env:USERPROFILE ".claude\sounds\aoe2"
$ConfigFile = Join-Path $SoundsDir "config.json"
$CooldownFile = Join-Path $SoundsDir ".last-error-time"
$PlayScript = Join-Path $SoundsDir "scripts\play-random.ps1"

# ── Debug logging (toggle via "debug": true in config.json) ──────────────────

$DebugLog = Join-Path $SoundsDir "debug.log"
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
            Add-Content -Path $DebugLog -Value "[$timestamp] [play-error] $Message"
        } catch {}
    }
}

Write-DebugLog "========== INVOKED: play-error.ps1 =========="
Write-DebugLog "USERPROFILE=$env:USERPROFILE"
Write-DebugLog "SOUNDS_DIR=$SoundsDir"

# ── Read config ──────────────────────────────────────────────────────────────

$CategoryEnabled = $true
$Cooldown = 15

if (Test-Path $ConfigFile) {
    try {
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($null -ne $config.categories -and $null -ne $config.categories.error) {
            $CategoryEnabled = [bool]$config.categories.error
        }
        if ($null -ne $config.cooldown_seconds) {
            $Cooldown = [int]$config.cooldown_seconds
        }
    } catch {}
}

Write-DebugLog "Error category enabled: $CategoryEnabled"
if (-not $CategoryEnabled) {
    Write-DebugLog "EXIT: error category disabled"
    exit 0
}

# ── Cooldown check ───────────────────────────────────────────────────────────

$Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

if (Test-Path $CooldownFile) {
    try {
        $LastTime = [long](Get-Content $CooldownFile -Raw).Trim()
        $Elapsed = $Now - $LastTime
        Write-DebugLog "Cooldown check: elapsed=${Elapsed}s, threshold=${Cooldown}s"
        if ($Elapsed -lt $Cooldown) {
            Write-DebugLog "EXIT: cooldown active"
            exit 0
        }
    } catch {}
}

# ── Read stdin (hook input JSON) ─────────────────────────────────────────────

$InputText = ""
try {
    if (-not [Console]::IsInputRedirected) {
        # No piped input
    } else {
        $InputText = [Console]::In.ReadToEnd()
    }
} catch {
    try {
        $InputText = @($input) -join "`n"
    } catch {}
}

Write-DebugLog "Stdin input length: $($InputText.Length)"
Write-DebugLog "Stdin (first 500 chars): $($InputText.Substring(0, [Math]::Min(500, $InputText.Length)))"

# ── Smart filter: skip benign failures ───────────────────────────────────────

if ($InputText.Length -gt 0) {
    $BenignPatterns = @(
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
        'stat '
    )

    $InterestingPatterns = @(
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
        'merge conflict'
    )

    $textLower = $InputText.ToLower()

    $isBenign = $false
    foreach ($p in $BenignPatterns) {
        if ($textLower.Contains($p.ToLower())) {
            $isBenign = $true
            break
        }
    }

    $isInteresting = $false
    foreach ($p in $InterestingPatterns) {
        if ($textLower.Contains($p.ToLower())) {
            $isInteresting = $true
            break
        }
    }

    if ($isBenign -and -not $isInteresting) {
        Write-DebugLog "EXIT: filtered out (benign)"
        exit 0
    }

    Write-DebugLog "Smart filter result: play (benign=$isBenign, interesting=$isInteresting)"
}

# ── Record cooldown timestamp ────────────────────────────────────────────────

try {
    Set-Content -Path $CooldownFile -Value $Now -NoNewline
} catch {}

# ── Play the error sound ─────────────────────────────────────────────────────

Write-DebugLog "Playing error sound via: $PlayScript error"
& $PlayScript error
