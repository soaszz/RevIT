# Pure string transformation. No environment access, files, subprocesses or network.
function Protect-N6Evidence {
    param([AllowEmptyString()][string]$Text, [string[]]$Needles = @())
    foreach ($needle in ($Needles | Where-Object { ![string]::IsNullOrEmpty($_) } | Sort-Object Length -Descending)) {
        $Text = $Text.Replace($needle, '[REDACTED]')
    }
    $Text = [regex]::Replace($Text, '(?i)\b[a-z][a-z0-9+.-]*://[^\s''"<>]+', '[REDACTED_URI]')
    $Text = [regex]::Replace($Text, '(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-])', '[REDACTED_JWT]')
    $Text = [regex]::Replace($Text, '(?i)(\b(?:password|passwd|pwd|authorization|apikey|api_key|access_token|refresh_token|service_role_key|jwt_secret)\b\s*[:=]\s*)(?:Bearer\s+)?(?:''[^'']*''|"[^"]*"|[^\s,;]+)', '$1[REDACTED_SECRET]')
    return $Text
}
