# Shared timer transactions for the widget and Electron bridge. No UI or side effects on import.
. (Join-Path $PSScriptRoot 'StudyData.ps1')

function Invoke-StudyTimerLock([string]$CacheRoot, [scriptblock]$Operation) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $id = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($CacheRoot).ToLowerInvariant()))).Replace('-', '') } finally { $hash.Dispose() }
    $mutex = [Threading.Mutex]::new($false, ('Local\StudyTimer_' + $id))
    $owned = $false
    try {
        try { $owned = $mutex.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $owned = $true }
        if (-not $owned) { throw 'Study timer is busy. Please try again.' }
        & $Operation
    } finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}

function Get-SavedStudySeconds($Session, [DateTime]$Now = [DateTime]::UtcNow) {
    $end = $Now.ToUniversalTime()
    if ($Session.stoppedUtc) { $end = [DateTime]::Parse($Session.stoppedUtc).ToUniversalTime() }
    [double]$Session.elapsedBeforeSeconds + [Math]::Max(0, ($end - [DateTime]::Parse($Session.startedUtc).ToUniversalTime()).TotalSeconds)
}

function Write-StudyTimer([string]$Path, $Session) {
    [void][IO.Directory]::CreateDirectory((Split-Path $Path))
    $temporary = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($temporary, ($Session | ConvertTo-Json -Compress))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Stop-SavedStudyTimer([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $session = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if (-not $session.stoppedUtc) {
        $session | Add-Member stoppedUtc ([DateTime]::UtcNow.ToString('o')) -Force
        Write-StudyTimer $Path $session
    }
    Sync-StudyActivity $Path
}

function Invoke-StudyTimer([string]$Root, [string]$Subject, [string]$Action) {
    $cache = Join-Path $Root '.tutor-cache'
    $subjects = @(Get-StudySubjects $Root)
    if ($subjects -notcontains $Subject) { throw 'Unknown study subject.' }
    $path = Join-Path $cache ('subjects\' + $Subject + '\study-session.json')
    Invoke-StudyTimerLock $cache {
        # Preserve legacy originals and never replace an already migrated subject.
        $legacy = Join-Path $cache 'study-session.json'
        $react = Join-Path $cache 'subjects\React\study-session.json'
        if (($subjects -contains 'React') -and (Test-Path -LiteralPath $legacy) -and -not (Test-Path -LiteralPath $react)) {
            [void][IO.Directory]::CreateDirectory((Split-Path $react))
            Copy-Item -LiteralPath $legacy -Destination $react
        }
        $legacyTopic = Join-Path $cache 'current-topic.txt'
        if (Test-Path -LiteralPath $legacyTopic) {
            $text = [IO.File]::ReadAllText($legacyTopic).Trim()
            $name = if ($text -match '^Finnish(?:\s|$)') { 'Finnish' } else { 'React' }
            $topic = Join-Path $cache ('subjects\' + $name + '\current-topic.txt')
            if (($subjects -contains $name) -and -not (Test-Path -LiteralPath $topic)) {
                [void][IO.Directory]::CreateDirectory((Split-Path $topic))
                [IO.File]::WriteAllText($topic, $text)
            }
        }
        switch ($Action) {
            { $_ -in 'pause-all', 'select', 'start' } {
                foreach ($name in $subjects) {
                    if ($Action -ne 'start' -or $name -ne $Subject) {
                        Stop-SavedStudyTimer (Join-Path $cache ('subjects\' + $name + '\study-session.json'))
                    }
                }
            }
        }
        if ($Action -in 'select', 'start') {
            [void][IO.Directory]::CreateDirectory($cache)
            [IO.File]::WriteAllText((Join-Path $cache 'active-subject.txt'), $Subject)
        }
        if ($Action -eq 'stop') { Stop-SavedStudyTimer $path }
        if ($Action -eq 'checkpoint') { Sync-StudyActivity $path }
        if ($Action -in 'start', 'reset') {
            $total = 0.0; $elapsed = 0.0
            if (Test-Path -LiteralPath $path) {
                $old = [IO.File]::ReadAllText($path) | ConvertFrom-Json
                if ($Action -eq 'start' -and -not $old.stoppedUtc) { return }
                Stop-SavedStudyTimer $path
                $old = [IO.File]::ReadAllText($path) | ConvertFrom-Json
                $elapsed = Get-SavedStudySeconds $old
                $total = [double]$old.totalBeforeSeconds
            }
            if ($Action -eq 'reset') { $total += $elapsed; $elapsed = 0.0 }
            $now = [DateTime]::UtcNow.ToString('o')
            $stop = if ($Action -eq 'reset') { $now } else { $null }
            Write-StudyTimer $path ([pscustomobject]@{ startedUtc = $now; stoppedUtc = $stop; totalBeforeSeconds = $total; elapsedBeforeSeconds = $elapsed })
        }
    }
}
