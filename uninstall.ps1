# uninstall.ps1 — Remove AoE2 Claude Code hooks (Windows)

$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:USERPROFILE ".claude\sounds\aoe2"
$SettingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"

Write-Host ""
Write-Host "  ⚔️  Uninstalling AoE2 Claude Code Hooks" -ForegroundColor Yellow
Write-Host ""

$reply = Read-Host "  Remove all AoE2 sounds and hooks? [y/N]"
if ($reply -ne "y" -and $reply -ne "Y") {
    Write-Host "  Cancelled." -ForegroundColor DarkGray
    exit 0
}

Write-Host "[1/2]" -ForegroundColor Blue -NoNewline
Write-Host " Removing hooks from settings..."

if (Test-Path $SettingsFile) {
    try {
        $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json

        if ($settings.PSObject.Properties.Name -contains 'hooks') {
            $AOE2_MARKER = "aoe2"
            $hookEvents = @($settings.hooks.PSObject.Properties.Name)

            foreach ($eventName in $hookEvents) {
                $matchers = @($settings.hooks.$eventName)
                $cleanedMatchers = @()

                foreach ($matcherEntry in $matchers) {
                    if ($null -eq $matcherEntry) { continue }
                    $filteredHooks = @()
                    foreach ($h in $matcherEntry.hooks) {
                        if ($h.command -and $h.command -notlike "*$AOE2_MARKER*") {
                            $filteredHooks += $h
                        }
                    }
                    if ($filteredHooks.Count -gt 0) {
                        $matcherEntry.hooks = $filteredHooks
                        $cleanedMatchers += $matcherEntry
                    }
                }

                if ($cleanedMatchers.Count -gt 0) {
                    $settings.hooks.$eventName = $cleanedMatchers
                } else {
                    $settings.hooks.PSObject.Properties.Remove($eventName)
                }
            }

            # Remove hooks key entirely if empty
            $remainingEvents = @($settings.hooks.PSObject.Properties.Name)
            if ($remainingEvents.Count -eq 0) {
                $settings.PSObject.Properties.Remove('hooks')
            }

            $settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile -Encoding UTF8
        }

        Write-Host "  ✓ " -ForegroundColor Green -NoNewline
        Write-Host "Hooks removed from settings.json"
    } catch {
        Write-Host "  ⚠  Could not update settings.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No settings.json found" -ForegroundColor DarkGray
}

Write-Host "[2/2]" -ForegroundColor Blue -NoNewline
Write-Host " Removing files..."

if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "  ✓ " -ForegroundColor Green -NoNewline
    Write-Host "Removed $InstallDir"
} else {
    Write-Host "  Nothing to remove at $InstallDir" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  Uninstalled." -ForegroundColor Green -NoNewline
Write-Host " Your other Claude Code settings are preserved."
Write-Host "  ""The wonder... the wonder... the wonder has been destroyed.""" -ForegroundColor DarkGray
Write-Host ""
