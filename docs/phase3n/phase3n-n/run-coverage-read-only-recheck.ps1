# PREPARATION ONLY. Do not invoke until separate read-only authorization.
# Fixed read-only source allowlist; never launches the concurrency pack or a suite.
param([string]$ExpectedHost,[string]$ExpectedPortText,[string]$ExpectedUsername)
$Mode = 'Catalog'
# Do not enable tracing, debugging, environment dumps or a transcript for this invocation.
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) {
    throw 'REVIT_STAGING_DB_URL missing in this PowerShell process. Stopped before connection.'
}

$psqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidenceDir = Join-Path $repoRoot 'scratch/phase3n-n2-evidence'
if (!(Test-Path -LiteralPath $evidenceDir -PathType Container)) { throw 'Reviewed evidence directory missing.' }
$sqlPath = Join-Path $PSScriptRoot 'COVERAGE_READ_ONLY_RECHECK.psql'
$sourcePaths = @('COVERAGE_READ_ONLY_RECHECK.psql','../phase3n-n6/Redact-Evidence.ps1','run-coverage-read-only-recheck.ps1')
# Exact reviewed source hashes; no SQL substitution under the old launcher.
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'COVERAGE_SOURCE_HASHES.json') -Raw | ConvertFrom-Json
foreach ($relativePath in $sourcePaths) {
    $itemPath = Join-Path $PSScriptRoot $relativePath
    $expectedHash = $manifest.PSObject.Properties[$relativePath].Value
    if (!$expectedHash -or (Get-FileHash -LiteralPath $itemPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash) {
        throw 'Reviewed source mismatch or missing file. No connection attempted.'
    }
}
. (Join-Path $PSScriptRoot '../phase3n-n6/Redact-Evidence.ps1')
if (!(Test-Path -LiteralPath $psqlPath -PathType Leaf) -or !(Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
    throw 'Required installed psql or preflight SQL file missing. No connection attempted.'
}
if ((Get-Item -LiteralPath $psqlPath).VersionInfo.FileVersion -ne '17.11') {
    throw 'Installed psql file version differs from reviewed 17.11. No connection attempted.'
}

# Ask only for non-secret values independently read from the STAGING dashboard.
if (!$ExpectedHost) { $ExpectedHost = Read-Host 'Staging dashboard Session Pooler host (no URI)' }
if (!$ExpectedPortText) { $ExpectedPortText = Read-Host 'Staging dashboard Session Pooler port' }
if (!$ExpectedUsername) { $ExpectedUsername = Read-Host 'Staging dashboard Session Pooler username (no password)' }
$expectedHost = $ExpectedHost.Trim().ToLowerInvariant()
$expectedPortText = $ExpectedPortText.Trim()
$expectedUsername = $ExpectedUsername.Trim()
if ($expectedHost -notmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$' -or
    $expectedPortText -ne '5432' -or
    $expectedUsername -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*\.qnepjfcbzsycmesrcbjb$') {
    throw 'Dashboard values do not identify the supported staging Session Pooler on 5432. No connection attempted.'
}

# Parse only the explicitly supplied process variable, never a file/MCP/credential store.
# Reject unreviewed URI shapes/options instead of silently changing connection semantics.
$privateUri = $env:REVIT_STAGING_DB_URL
$parsedUri = $null
if (![Uri]::TryCreate($privateUri,[UriKind]::Absolute,[ref]$parsedUri) -or
    $parsedUri.Scheme -notin @('postgres','postgresql') -or
    $parsedUri.Host.ToLowerInvariant() -ne $expectedHost -or $parsedUri.Port -ne 5432 -or
    $parsedUri.AbsolutePath -ne '/postgres' -or $parsedUri.Fragment -ne '' -or
    $parsedUri.Query -notin @('','?sslmode=require','?sslmode=verify-full')) {
    throw 'Private URI fails endpoint/database/option validation. No connection attempted.'
}
$separator = $parsedUri.UserInfo.IndexOf(':')
if ($separator -lt 1) { throw 'Private URI must contain its own username and password. No fallback permitted.' }
$userInfo = @($parsedUri.UserInfo.Substring(0,$separator),$parsedUri.UserInfo.Substring($separator+1))
try {
    $privateUsername = [Uri]::UnescapeDataString($userInfo[0])
    $privatePassword = [Uri]::UnescapeDataString($userInfo[1])
} catch { throw 'Private URI credential encoding is unsupported. No connection attempted.' }
if ($privateUsername -cne $expectedUsername -or [string]::IsNullOrEmpty($privatePassword) -or
    $privatePassword -match '[\x00-\x1f\x7f]' -or $privateUri.Contains('lznsdxfvxeckflxsohig')) {
    throw 'Private URI staging identity/credential check failed. No connection attempted.'
}

$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $psqlPath
# Fixed local filename only; no connection URI, username or password in process arguments.
$start.Arguments = '-X --no-password --set=ON_ERROR_STOP=on --pset=pager=off --file="' + $sqlPath + '"'
$start.WorkingDirectory = $PSScriptRoot
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.StandardOutputEncoding = [Text.Encoding]::UTF8
$start.StandardErrorEncoding = [Text.Encoding]::UTF8
foreach ($variableName in @($start.EnvironmentVariables.Keys)) {
    if ($variableName -like 'PG*') { $start.EnvironmentVariables.Remove($variableName) }
}
$start.EnvironmentVariables.Remove('REVIT_STAGING_DB_URL')
# Child-process memory only. Parent environment and disk configuration remain unchanged.
$start.EnvironmentVariables['PGHOST'] = $expectedHost
$start.EnvironmentVariables['PGPORT'] = '5432'
$start.EnvironmentVariables['PGDATABASE'] = 'postgres'
$start.EnvironmentVariables['PGUSER'] = $privateUsername
$start.EnvironmentVariables['PGPASSWORD'] = $privatePassword
$start.EnvironmentVariables['PGPASSFILE'] = 'NUL'
$start.EnvironmentVariables['PGSSLMODE'] = $(if ($parsedUri.Query -eq '?sslmode=verify-full') { 'verify-full' } else { 'require' })
$start.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '10'
$start.EnvironmentVariables['PGCLIENTENCODING'] = 'UTF8'
$start.EnvironmentVariables['PGAPPNAME'] = 'revit-coverage-readonly'
$start.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=30000'

$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$evidencePath = Join-Path $evidenceDir ('coverage-readonly-' + $Mode + '-' + $stamp + '.log')
$sqlHash = (Get-FileHash -LiteralPath $sqlPath -Algorithm SHA256).Hash.ToLowerInvariant()
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $start
$started = $false
$timedOut = $false
$wrapperFailed = $false
$psqlExitCode = 'NOT_STARTED'
$capturedOut = ''
$capturedErr = ''
$errTask = $null
$lineTask = $null
$line = $null
# Sanitize before any console or disk output. No raw capture is persisted.
$needles = @($privateUri,$privatePassword,$userInfo[1],
    [Uri]::EscapeDataString($privatePassword),[Uri]::UnescapeDataString($privateUri))
$buffer = New-Object Text.StringBuilder
$deadlineSeconds = if ($Mode -eq 'Catalog') { 120 } else { 360 }
try {
    $started = $process.Start()
    if (!$started) { throw 'Launch failed' }
    # stdin stays attached to this private interactive console for psql \prompt.
    # Catalog source bodies are never echoed live; session output contains readiness metadata only.
    $errTask = $process.StandardError.ReadToEndAsync()
    $lineTask = $process.StandardOutput.ReadLineAsync()
    $timer = [Diagnostics.Stopwatch]::StartNew()
    if ($Mode -ne 'Catalog') {
        Write-Host 'Read-only handshake. Watch displayed rows. Press Enter ONLY at the checklist barriers.'
    }
    while ($null -ne $lineTask) {
        if (!$timedOut -and $timer.Elapsed.TotalSeconds -gt $deadlineSeconds) {
            $timedOut = $true
            if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        }
        if ($lineTask.IsCompleted) {
            $line = $lineTask.GetAwaiter().GetResult()
            if ($null -eq $line) { $lineTask = $null; break }
            [void]$buffer.AppendLine($line)
            if ($Mode -ne 'Catalog') { Write-Host (Protect-N6Evidence -Text $line -Needles $needles) }
            $lineTask = $process.StandardOutput.ReadLineAsync()
        } else { Start-Sleep -Milliseconds 25 }
    }
    if (!$process.HasExited -and !$process.WaitForExit(1000)) {
        $wrapperFailed = $true
        $process.Kill()
    }
    $process.WaitForExit()
    $capturedOut = $buffer.ToString()
    $capturedErr = $errTask.GetAwaiter().GetResult()
} catch {
    # Never expose exception objects, process arguments/environment or raw streams.
    $wrapperFailed = $true
} finally {
    if ($started) {
        if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $psqlExitCode = $process.ExitCode
    }
    $capturedOut = $buffer.ToString()
    if ($null -ne $errTask -and $errTask.IsCompleted) {
        try { $capturedErr = $errTask.GetAwaiter().GetResult() } catch { $wrapperFailed = $true }
    }
    $process.Dispose()
}
$safeOut = Protect-N6Evidence -Text $capturedOut -Needles $needles
$safeErr = Protect-N6Evidence -Text $capturedErr -Needles $needles
$header = @(
    ('Phase 3N-N coverage augmentation user-run read-only diagnostic; mode=' + $Mode + '; not independent Codex database evidence.')
    ('expected_project=qnepjfcbzsycmesrcbjb; dashboard_host=' + $expectedHost + '; dashboard_port=5432; dashboard_username=' + $expectedUsername)
    'Endpoint values are operator dashboard attestations, compared privately before connection.'
    'PGOPTIONS requests read-only defaults. This header does not prove server enforcement; inspect SQL settings.'
    ('psql_file_version=17.11; main_sql_sha256=' + $sqlHash)
    ('psql_exit_code=' + $psqlExitCode + '; wrapper_failed=' + $wrapperFailed + '; timeout=' + $timedOut)
    'Exit 0 is not acceptance. Redacted source cannot establish exact definition equivalence.'
) -join [Environment]::NewLine
$safeHeader = Protect-N6Evidence -Text $header -Needles $needles
$evidence = $safeHeader + "`r`nSTDOUT`r`n" + $safeOut + "`r`nSTDERR`r`n" + $safeErr
# Unique file, refuse overwrite. Evidence directory already covered by /scratch/ ignore rule.
$encoded = (New-Object Text.UTF8Encoding($false)).GetBytes($evidence)
$file = [IO.File]::Open($evidencePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $file.Write($encoded,0,$encoded.Length) } finally { $file.Dispose() }
# Clear launcher references, not the user's existing process variable. No secure-erasure claim.
$start.EnvironmentVariables.Clear()
$privateUri = $privatePassword = $privateUsername = $parsedUri = $userInfo = $needles = $null
$capturedOut = $capturedErr = $evidence = $buffer = $line = $encoded = $null
Write-Output ('Evidence: ' + $evidencePath)
Write-Output ('psql_exit_code=' + $psqlExitCode + '; timeout=' + $timedOut + '; wrapper_failed=' + $wrapperFailed)
if ($wrapperFailed -or $timedOut -or $psqlExitCode -ne 0) {
    throw 'Read-only diagnostic did not complete successfully. Review sanitized evidence; no automatic retry.'
}
