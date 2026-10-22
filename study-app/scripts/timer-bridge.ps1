param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
. (Join-Path $Root 'tools\study\StudyTimer.ps1')
try { while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        if ($request.action -notin @('start', 'stop', 'reset', 'select', 'pause-all', 'checkpoint')) { throw 'Invalid timer action.' }
        Invoke-StudyTimer $Root $request.subject $request.action
        [Console]::WriteLine((@{ id = $request.id; ok = $true } | ConvertTo-Json -Compress))
    } catch {
        [Console]::WriteLine((@{ id = $request.id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
} } finally {
    # EOF also freezes time if the parent app exits unexpectedly.
    $subjects = @(Get-StudySubjects $Root)
    if ($subjects.Count) { Invoke-StudyTimer $Root $subjects[0] 'pause-all' }
}
