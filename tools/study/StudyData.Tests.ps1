$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'StudyData.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('StudyActivityTest_' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$sessionPath = Join-Path $testRoot 'study-session.json'
$activityPath = Join-Path $testRoot 'study-activity.json'
function Set-TestSession([string]$Start, [string]$Stop) {
    [IO.File]::WriteAllText($sessionPath, (@{ startedUtc = $Start; stoppedUtc = $Stop; totalBeforeSeconds = 9999; elapsedBeforeSeconds = 1234 } | ConvertTo-Json))
}
function Assert-Seconds([string]$Day, [double]$Expected) {
    $data = Read-Activity $activityPath
    if ([Math]::Abs([double]$data.days[$Day] - $Expected) -gt 0.01) { throw "Wrong seconds on $Day : expected $Expected, found $($data.days[$Day])" }
}
try {
    # Helsinki midnight in summer; unknown earlier totals must not be assigned dates.
    Set-TestSession '2026-10-13T20:50:00Z' '2026-10-13T21:10:00Z'
    Sync-StudyActivity $sessionPath
    Assert-Seconds '2026-10-13' 600; Assert-Seconds '2026-10-14' 600
    Sync-StudyActivity $sessionPath
    Assert-Seconds '2026-10-14' 600
    # Running checkpoints count only the new interval, then final Stop.
    Set-TestSession '2026-10-14T09:00:00Z' $null
    Sync-StudyActivity $sessionPath ([DateTime]::Parse('2026-10-14T09:05:00Z'))
    Sync-StudyActivity $sessionPath ([DateTime]::Parse('2026-10-14T09:08:00Z'))
    Assert-Seconds '2026-10-14' 1080
    Set-TestSession '2026-10-14T09:00:00Z' '2026-10-14T09:10:00Z'
    Sync-StudyActivity $sessionPath; Sync-StudyActivity $sessionPath
    Assert-Seconds '2026-10-14' 1200
    # New Start accumulates on the same day; a paused zero-duration session adds nothing.
    Set-TestSession '2026-10-14T10:00:00Z' '2026-10-14T10:05:00Z'
    Sync-StudyActivity $sessionPath; Assert-Seconds '2026-10-14' 1500
    Set-TestSession '2026-10-14T11:00:00Z' '2026-10-14T11:00:00Z'
    Sync-StudyActivity $sessionPath; Assert-Seconds '2026-10-14' 1500
    # Helsinki DST fallback day lasts 25 hours.
    Set-TestSession '2026-10-24T21:00:00Z' '2026-10-25T22:00:00Z'
    Sync-StudyActivity $sessionPath; Assert-Seconds '2026-10-25' 90000
    'Activity checks passed: midnight split, idempotence, pause/resume, unknown history, DST.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
