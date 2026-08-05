# Auto-detect com.mojang folder for Minecraft Bedrock (GDK Roaming or legacy UWP)
$roamingMojang = Join-Path $env:APPDATA "Minecraft Bedrock\Users\Shared\games\com.mojang"
$localMojang = Join-Path $env:LOCALAPPDATA "Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

$comMojangPaths = @()
if (Test-Path $roamingMojang) { $comMojangPaths += $roamingMojang }
if (Test-Path $localMojang) { $comMojangPaths += $localMojang }

if ($comMojangPaths.Count -eq 0) {
    Write-Error "No com.mojang folder found in Roaming or LocalAppData!"
    exit 1
}

$repo = $PSScriptRoot

foreach ($comMojang in $comMojangPaths) {
    Write-Host "Creating links in: $comMojang" -ForegroundColor Cyan

    # Behavior Pack Link
    $bpTarget = Join-Path $comMojang "development_behavior_packs\Enderite Mod BP"
    $bpSource = Join-Path $repo "Enderite Mod BP"

    if (Test-Path $bpTarget) {
        Write-Host "  Behavior Pack link already exists at: $bpTarget" -ForegroundColor Yellow
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $bpTarget -Value $bpSource -ErrorAction Stop | Out-Null
            Write-Host "  Created BP SymbolicLink: $bpTarget -> $bpSource" -ForegroundColor Green
        } catch {
            New-Item -ItemType Junction -Path $bpTarget -Value $bpSource | Out-Null
            Write-Host "  Created BP Junction: $bpTarget -> $bpSource" -ForegroundColor Green
        }
    }

    # Resource Pack Link
    $rpTarget = Join-Path $comMojang "development_resource_packs\Enderite Mod RP"
    $rpSource = Join-Path $repo "Enderite Mod RP"

    if (Test-Path $rpTarget) {
        Write-Host "  Resource Pack link already exists at: $rpTarget" -ForegroundColor Yellow
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $rpTarget -Value $rpSource -ErrorAction Stop | Out-Null
            Write-Host "  Created RP SymbolicLink: $rpTarget -> $rpSource" -ForegroundColor Green
        } catch {
            New-Item -ItemType Junction -Path $rpTarget -Value $rpSource | Out-Null
            Write-Host "  Created RP Junction: $rpTarget -> $rpSource" -ForegroundColor Green
        }
    }
}
