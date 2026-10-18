# LOCAL-ONLY preparation. Run only for the approved complete read-only handshake.
# Use the private shell already containing REVIT_STAGING_DB_URL. Never trace/transcribe it.
param(
    [string]$ExpectedHost,
    [string]$ExpectedPortText,
    [string]$ExpectedUsername,
    [string]$ExpectedDatabase
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) {
    throw 'Private staging variable missing in this shell. No connection attempted.'
}
$psqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
if (!(Test-Path -LiteralPath $psqlPath -PathType Leaf) -or
    (Get-Item -LiteralPath $psqlPath).VersionInfo.FileVersion -ne '17.11') {
    throw 'Reviewed PostgreSQL 17.11 client required. No connection attempted.'
}
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
$modulePath = Join-Path $PSScriptRoot 'automated-read-only-handshake.mjs'
$expectedModuleHash = 'a1ee786f6bff0024ce4d88455132fbf6c710f155f09d21cc3d9bd1067d881712'
if ((Get-FileHash -LiteralPath $modulePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedModuleHash) {
    throw 'Automated handshake source hash mismatch. No connection attempted.'
}
if (!$ExpectedHost) { $ExpectedHost = Read-Host 'Fresh STAGING dashboard Session Pooler host; no URI' }
if (!$ExpectedPortText) { $ExpectedPortText = Read-Host 'Fresh STAGING dashboard Session Pooler port' }
if (!$ExpectedUsername) { $ExpectedUsername = Read-Host 'Fresh STAGING dashboard username; no password' }
if (!$ExpectedDatabase) { $ExpectedDatabase = Read-Host 'Fresh STAGING dashboard database' }
$operatorValues = @($ExpectedHost.Trim().ToLowerInvariant(), $ExpectedPortText.Trim(), $ExpectedUsername.Trim(), $ExpectedDatabase.Trim())
if ($operatorValues[0] -notmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$' -or
    $operatorValues[1] -cne '5432' -or $operatorValues[2] -cne 'postgres.qnepjfcbzsycmesrcbjb' -or
    $operatorValues[3] -cne 'postgres') {
    throw 'Fresh approved staging Session Pooler identity required. No connection attempted.'
}
# Do not allow inherited Node preloads to read the private environment before validation.
$savedNodeOptions = $env:NODE_OPTIONS
$savedNodePath = $env:NODE_PATH
try {
    $env:NODE_OPTIONS = $null
    $env:NODE_PATH = $null
    $nodeVersionText = & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(\d+)\.(\d+)\.(\d+)$' -or
        [version]$nodeVersionText.Substring(1) -lt [version]'22.13.0') {
        throw 'Node 22.13 or newer required. No connection attempted.'
    }
    & $nodeCommand.Source $modulePath --run @operatorValues
    if ($LASTEXITCODE -ne 0) {
        throw 'Read-only handshake stopped. Review sanitized evidence; no automatic retry.'
    }
} finally {
    $env:NODE_OPTIONS = $savedNodeOptions
    $env:NODE_PATH = $savedNodePath
}
