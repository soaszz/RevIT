# Recovery only: exact retained committed-run artifacts; never executes scenarios.
# Never trace/transcribe this command. URI/password stay in the private process environment.
param([string]$ExpectedHost,[string]$ExpectedPortText,[string]$ExpectedUsername,[string]$ExpectedDatabase)
$ErrorActionPreference = 'Stop'
$revitExecutorStarted = $false
$revitEntryReason = 'LOCAL_PREREQUISITE'
try {
$revitEntryReason = 'MISSING_PRIVATE_URI'
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) {
    throw 'NO-GO - private staging variable missing in this process. No connection attempted.'
}
$psqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$revitEntryReason = 'PSQL_17_11_REQUIRED'
if (!(Test-Path -LiteralPath $psqlPath -PathType Leaf) -or
    (Get-Item -LiteralPath $psqlPath).VersionInfo.FileVersion -ne '17.11') {
    throw 'NO-GO - reviewed PostgreSQL 17.11 client required. No connection attempted.'
}
$revitEntryReason = 'NODE_REQUIRED'
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
$modulePath = Join-Path $PSScriptRoot 'recover-committed-setup.mjs'
$expectedModuleHash = '47a3ca73dee54126a17425e465e51e6f3021cf4afb86af88fb0e030a41147bbc'
$sharedPath = Join-Path $PSScriptRoot 'automated-read-only-handshake.mjs'
$expectedSharedHash = 'a1ee786f6bff0024ce4d88455132fbf6c710f155f09d21cc3d9bd1067d881712'
$revitEntryReason = 'EXECUTOR_OR_SHARED_SOURCE_HASH'
if ((Get-FileHash -LiteralPath $modulePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedModuleHash -or
    (Get-FileHash -LiteralPath $sharedPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedSharedHash) {
    throw 'NO-GO - recovery/shared source hash mismatch. No connection attempted.'
}
$revitEntryReason = 'FRESH_STAGING_DASHBOARD_IDENTITY'
if (!$ExpectedHost) { $ExpectedHost = Read-Host 'Fresh STAGING dashboard Session Pooler host; no URI' }
if (!$ExpectedPortText) { $ExpectedPortText = Read-Host 'Fresh STAGING dashboard Session Pooler port' }
if (!$ExpectedUsername) { $ExpectedUsername = Read-Host 'Fresh STAGING dashboard username; no password' }
if (!$ExpectedDatabase) { $ExpectedDatabase = Read-Host 'Fresh STAGING dashboard database' }
$operatorValues = @($ExpectedHost.Trim().ToLowerInvariant(),$ExpectedPortText.Trim(),$ExpectedUsername.Trim(),$ExpectedDatabase.Trim())
if ($operatorValues[0] -notmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$' -or
    $operatorValues[1] -cne '5432' -or $operatorValues[2] -cne 'postgres.qnepjfcbzsycmesrcbjb' -or $operatorValues[3] -cne 'postgres') {
    throw 'NO-GO - approved staging Session Pooler identity required. No connection attempted.'
}
$savedNodeOptions = $env:NODE_OPTIONS
$savedNodePath = $env:NODE_PATH
try {
    $env:NODE_OPTIONS = $null
    $env:NODE_PATH = $null
    $revitEntryReason = 'NODE_22_13_REQUIRED'
    $nodeVersionText = & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(\d+)\.(\d+)\.(\d+)$' -or
        [version]$nodeVersionText.Substring(1) -lt [version]'22.13.0') {
        throw 'NO-GO - Node 22.13 or newer required. No connection attempted.'
    }
    $revitExecutorStarted = $true
    & $nodeCommand.Source $modulePath --recover @operatorValues
    # Node already emits the concise status/path. Preserve its actual exit code without a duplicate exception dump.
    if ($LASTEXITCODE -ne 0) { return }
} finally {
    $env:NODE_OPTIONS = $savedNodeOptions
    $env:NODE_PATH = $savedNodePath
}
} catch {
    # Never expose exception objects, native arguments or credential-bearing environment values.
    if ($revitExecutorStarted) {
        Write-Output 'NO-GO - executor interrupted; restoration not established. Preserve original exports and sanitized evidence.'
    } else {
        Write-Output ('NO-GO - ' + $revitEntryReason + '. Stopped before executor launch.')
        Write-Output 'Sanitized evidence: not created; local prerequisite failed.'
    }
    $global:LASTEXITCODE = 1
}
