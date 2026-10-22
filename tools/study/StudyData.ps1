# Shared local data helpers. Dot-sourcing this file never starts a timer.
function Get-StudySubjects([string]$Root) {
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'StudyVault') -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName '00-Dashboard\Curriculum Coverage.md')
    } | Sort-Object Name | ForEach-Object Name)
}

function Get-DashboardTopics([string]$Vault) {
    $content = [IO.File]::ReadAllText((Join-Path $Vault '00-Dashboard\Curriculum Coverage.md'))
    $checklist = [regex]::Match($content, '(?ms)^## Topic Checklist\r?\n(.*?)(?=^## |\z)')
    if ($checklist.Success) {
        $section = ''
        foreach ($line in ($checklist.Groups[1].Value -split '\r?\n')) {
            if ($line -match '^### (.+)$') { $section = $Matches[1].Trim() }
            elseif ($line -match '^- \[([ xX])\] (.+)$') {
                [pscustomobject]@{ Section = $section; Name = ($Matches[2] -replace '\s*->\s*\[\[.*$', '').Trim(); Reached = $Matches[1] -match '[xX]' }
            }
        }
        return
    }
    $reachedSection = [regex]::Match($content, '(?ms)^## Reached topics\r?\n(.*?)(?=^## |\z)').Groups[1].Value
    $names = @([regex]::Matches($reachedSection, '(?m)^- (.+?)\r?$') | ForEach-Object { $_.Groups[1].Value.Trim() })
    foreach ($section in (Get-ChildItem -LiteralPath $Vault -Directory | Where-Object { $_.Name -match '^\d+-' -and $_.Name -notmatch '^(00|90)-' } | Sort-Object Name)) {
        foreach ($note in (Get-ChildItem -LiteralPath $section.FullName -Filter '*.md' -File | Where-Object { $_.BaseName -notmatch 'Practice$' } | Sort-Object Name)) {
            [pscustomobject]@{ Section = $section.Name; Name = $note.BaseName; Reached = $names -contains $note.BaseName }
        }
    }
}

function Get-StudyTimeZone { [TimeZoneInfo]::FindSystemTimeZoneById('FLE Standard Time') }
function Read-Activity([string]$Path) {
    $data = @{ version = 1; timeZone = 'Europe/Helsinki'; days = @{}; checkpoints = @{} }
    if (Test-Path -LiteralPath $Path) {
        $saved = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
        foreach ($field in @('days', 'checkpoints')) {
            foreach ($property in $saved.$field.PSObject.Properties) { $data[$field][$property.Name] = $property.Value }
        }
    }
    return $data
}

function Sync-StudyActivity([string]$SessionPath, [DateTime]$Now = [DateTime]::UtcNow) {
    if (-not (Test-Path -LiteralPath $SessionPath)) { return }
    $activityPath = Join-Path (Split-Path $SessionPath) 'study-activity.json'
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $identity = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($activityPath.ToLowerInvariant()))).Replace('-', '') } finally { $hash.Dispose() }
    $mutex = [Threading.Mutex]::new($false, ('Local\StudyActivity_' + $identity))
    $owned = $false
    try {
        try { $owned = $mutex.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $owned = $true }
        if (-not $owned) { throw 'Study activity is busy; try again.' }
        $session = [IO.File]::ReadAllText($SessionPath) | ConvertFrom-Json
        $start = [DateTime]::Parse($session.startedUtc).ToUniversalTime()
        $end = $Now.ToUniversalTime()
        if ($session.stoppedUtc) { $end = [DateTime]::Parse($session.stoppedUtc).ToUniversalTime() }
        if ($end -le $start) { return }
        $data = Read-Activity $activityPath
        # Each Start produces a new UTC key. Repeated reads/Stop cannot count it twice.
        $key = $start.ToString('o')
        $cursor = $start
        if ($data.checkpoints.ContainsKey($key)) { $cursor = [DateTime]::Parse($data.checkpoints[$key]).ToUniversalTime() }
        if ($end -le $cursor) { return }
        $zone = Get-StudyTimeZone
        while ($cursor -lt $end) {
            $local = [TimeZoneInfo]::ConvertTimeFromUtc($cursor, $zone)
            $nextMidnight = [DateTime]::SpecifyKind($local.Date.AddDays(1), [DateTimeKind]::Unspecified)
            $boundary = [TimeZoneInfo]::ConvertTimeToUtc($nextMidnight, $zone)
            $until = if ($end -lt $boundary) { $end } else { $boundary }
            $day = $local.ToString('yyyy-MM-dd')
            $data.days[$day] = [double]$data.days[$day] + ($until - $cursor).TotalSeconds
            $cursor = $until
        }
        $data.checkpoints[$key] = $end.ToString('o')
        [void][IO.Directory]::CreateDirectory((Split-Path $activityPath))
        $temp = $activityPath + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
        [IO.File]::WriteAllText($temp, ($data | ConvertTo-Json -Depth 5))
        Move-Item -LiteralPath $temp -Destination $activityPath -Force
    } finally {
        if ($owned) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
