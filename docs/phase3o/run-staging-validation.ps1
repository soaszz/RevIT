# PREPARED ONLY. Install and committed-runtime modes each require separate staging approval.
param([switch]$InstallMigration28,[switch]$ValidateRuntime,[string]$RecoverEvidence)
$ErrorActionPreference='Stop'
if (([int]$InstallMigration28.IsPresent + [int]$ValidateRuntime.IsPresent + [int][bool]$RecoverEvidence) -ne 1) { throw 'Choose exactly one explicit scope: -InstallMigration28, -ValidateRuntime or -RecoverEvidence. No connection attempted.' }
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) { throw 'Private staging URI missing in this process. No connection attempted.' }
if ((Get-Item -LiteralPath 'C:\Program Files\PostgreSQL\17\bin\psql.exe').VersionInfo.FileVersion -ne '17.11') { throw 'Reviewed PostgreSQL 17.11 client required.' }
$revitRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$revitManifest=Join-Path $PSScriptRoot 'SOURCE_HASHES.json'
$revitManifestHash='cfbf15673b616aa283f20eba7ab7750724b737b6eb2422317f0e445fcdd1ea97'
if ((Get-FileHash -LiteralPath $revitManifest -Algorithm SHA256).Hash.ToLowerInvariant() -cne $revitManifestHash) { throw 'Reviewed manifest mismatch. No connection attempted.' }
$revitPins=Get-Content -LiteralPath $revitManifest -Raw | ConvertFrom-Json
foreach ($revitPin in $revitPins.PSObject.Properties) {
  if ((Get-FileHash -LiteralPath (Join-Path $revitRoot $revitPin.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $revitPin.Value) { throw 'Reviewed source mismatch. No connection attempted.' }
}
$revitHostText=Read-Host 'Fresh STAGING dashboard Session Pooler host; no URI'
$revitPortText=Read-Host 'Fresh STAGING dashboard port'
$revitUserText=Read-Host 'Fresh STAGING dashboard username; no password'
$revitDatabaseText=Read-Host 'Fresh STAGING dashboard database'
$revitScope=if ($InstallMigration28) { 'Migration 28 installation only' } elseif ($RecoverEvidence) { 'original-artifact cleanup/restoration only' } else { 'rollback suite plus committed synthetic completion/concurrency tests and exact restoration' }
$revitAttestation=Read-Host "Separate approval received for $revitScope; staging ingress/background writers stopped, real-user trusted runtime OFF? Type YES"
if ($revitAttestation -cne 'YES') { throw 'Stopped before connection.' }
$revitOldAttestation=$env:REVIT_PHASE3O_QUIESCENT
$revitOldOperation=$env:REVIT_PHASE3O_OPERATION_APPROVED
$revitOldNodeOptions=$env:NODE_OPTIONS
$revitOldNodePath=$env:NODE_PATH
try {
  $env:REVIT_PHASE3O_QUIESCENT='YES'; $env:NODE_OPTIONS=$null; $env:NODE_PATH=$null
  $revitMode=if ($InstallMigration28) { '--install' } elseif ($RecoverEvidence) { '--recover' } else { '--run' }
  $env:REVIT_PHASE3O_OPERATION_APPROVED=if ($InstallMigration28) { 'install' } elseif ($RecoverEvidence) { 'recover' } else { 'run' }
  & node (Join-Path $revitRoot 'scripts/phase3o/staging-validation.mjs') $revitMode $revitHostText.Trim().ToLowerInvariant() $revitPortText.Trim() $revitUserText.Trim() $revitDatabaseText.Trim() $RecoverEvidence
} finally {
  $env:REVIT_PHASE3O_QUIESCENT=$revitOldAttestation; $env:REVIT_PHASE3O_OPERATION_APPROVED=$revitOldOperation; $env:NODE_OPTIONS=$revitOldNodeOptions; $env:NODE_PATH=$revitOldNodePath
}
