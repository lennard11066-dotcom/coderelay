param([ValidateSet('Desktop','Electron','Fabric')][string]$Target='Desktop')
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Get-VerifiedAsset($Repository, $Tag, $Name, $Expected, $Destination) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination).Hash -eq $Expected) { return }
    $headers = @{ Accept = 'application/vnd.github+json' }
    if ($env:GITHUB_TOKEN) { $headers.Authorization = "Bearer $env:GITHUB_TOKEN" }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/tags/$Tag" -Headers $headers
    $asset = $release.assets | Where-Object name -eq $Name | Select-Object -First 1
    if (!$asset) { throw "Release-Datei fehlt: $Repository / $Tag / $Name" }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Destination)) | Out-Null
    $partial = "$Destination.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        $headers.Accept = 'application/octet-stream'
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $asset.url -Headers $headers -OutFile $partial -UseBasicParsing
        if ((Get-FileHash -LiteralPath $partial).Hash -ne $Expected) { throw "SHA-256 stimmt nicht: $Name" }
        Move-Item -LiteralPath $partial -Destination $Destination -Force
        Write-Host "Geprüft: $Name"
    } finally {
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
    }
}

if ($Target -eq 'Fabric') {
    $version = '9.8.2'
    $file = "gradle-$version-bin.zip"
    $url = "https://services.gradle.org/distributions/$file"
    # Gradle Wrapper names its cache directory from the distribution URL.
    $key = node -e "const crypto=require('node:crypto');console.log(BigInt('0x'+crypto.createHash('md5').update(process.argv[1]).digest('hex')).toString(36))" $url
    $gradleHome = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE '.gradle' }
    $destination = Join-Path $gradleHome "wrapper/dists/gradle-$version-bin/$key/$file"
    if (Test-Path -LiteralPath "$destination.ok") { return }
    $property = Get-Content -LiteralPath (Join-Path $project 'fabric/template/gradle/wrapper/gradle-wrapper.properties') | Where-Object { $_ -match '^distributionSha256Sum=' }
    Get-VerifiedAsset 'gradle/gradle-distributions' "v$version" $file ($property -split '=',2)[1] $destination
    return
}

$electron = Join-Path $project 'node_modules/electron'
$version = (Get-Content -Raw -LiteralPath (Join-Path $electron 'package.json') | ConvertFrom-Json).version
$dist = Join-Path $electron 'dist'
if (!(Test-Path -LiteralPath (Join-Path $dist 'electron.exe'))) {
    $file = "electron-v$version-win32-x64.zip"
    $checksum = (Get-Content -Raw -LiteralPath (Join-Path $electron 'checksums.json') | ConvertFrom-Json).$file
    $destination = Join-Path $project ".local/tools/$file"
    Get-VerifiedAsset 'electron/electron' "v$version" $file $checksum $destination
    Expand-Archive -LiteralPath $destination -DestinationPath $dist -Force
    [IO.File]::WriteAllText((Join-Path $electron 'path.txt'),'electron.exe')
}
if ($Target -eq 'Electron') { return }

$builderCache = if ($env:ELECTRON_BUILDER_CACHE) { $env:ELECTRON_BUILDER_CACHE } else { Join-Path $env:LOCALAPPDATA 'electron-builder/Cache' }
# These hashes are pinned in electron-builder 26.18.0. Its extractor checks them again.
$tools = @(
    @('7zip@1.0.0','7zip-win-x64.tar.gz','be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3'),
    @('nsis-3.0.4.1','nsis-3.0.4.1.7z','9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa'),
    @('nsis-resources-3.4.1','nsis-resources-3.4.1.7z','593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103'),
    @('nsis@1.2.1','nsis-bundle-3.12.tar.gz','56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4')
)
foreach ($tool in $tools) {
    Get-VerifiedAsset 'electron-userland/electron-builder-binaries' $tool[0] $tool[1] $tool[2] (Join-Path $builderCache ($tool[0]+'/'+$tool[1]))
}
