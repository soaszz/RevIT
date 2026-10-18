# Offline AST/hash-guard checks only. Never invoke either complete launcher.
param([string]$RepoRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$wrapperPath = Join-Path $RepoRoot 'docs/phase3n/phase3n-n/run-automated-read-only-handshake.ps1'
$modulePath = Join-Path $RepoRoot 'docs/phase3n/phase3n-n/automated-read-only-handshake.mjs'
$existingPath = Join-Path $RepoRoot 'docs/phase3n/phase3n-n6/run-read-only-recheck.ps1'
$checked = 0
foreach ($path in @($wrapperPath, $existingPath)) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw 'PowerShell parse failed' }
    $checked++
}
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($wrapperPath, [ref]$tokens, [ref]$parseErrors)
$assignment = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$expectedModuleHash'
}, $true)
$expectedModuleHash = $assignment.Right.Expression.Value
if ($expectedModuleHash -cnotmatch '^[a-f0-9]{64}$') { throw 'Missing module hash pin' }
$guard = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.Contains('Get-FileHash')
}, $true)
if (!$guard) { throw 'Missing source guard' }
# Extract only the hash if-statement; no prompting, credential read, Node or psql invocation.
$guardScript = [scriptblock]::Create($guard.Extent.Text)
& $guardScript
$checked++
$fixtureDir = Join-Path $RepoRoot ('scratch/phase3n-n2-evidence/offline-hash-fixture-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $fixtureDir)
$modulePath = Join-Path $fixtureDir 'mutated.mjs'
[IO.File]::WriteAllText($modulePath, 'mutated offline fixture', (New-Object Text.UTF8Encoding($false)))
$rejected = $false
try { & $guardScript } catch { $rejected = $true }
if (!$rejected) { throw 'Changed source was accepted' }
$checked++
$modulePath = Join-Path $fixtureDir 'missing.mjs'
$rejected = $false
try { & $guardScript } catch { $rejected = $true }
if (!$rejected) { throw 'Missing source was accepted' }
$checked++
$operatorCommand = '& ''C:\Users\mypc\Desktop\Projects\RevIT\docs\phase3n\phase3n-n\run-automated-read-only-handshake.ps1'''
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($operatorCommand, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Operator command parse failed' }
$checked++
Write-Output ('' + $checked + ' offline PowerShell syntax/hash-guard checks PASS; no launcher executed.')
