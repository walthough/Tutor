$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ErrorActionPreference = 'Stop'
$logPath = Join-Path $workspaceRoot '.tutor-cache\widget-startup.log'
[void][IO.Directory]::CreateDirectory((Split-Path $logPath))
if ($args -notcontains '-Check') {
    [IO.File]::AppendAllText($logPath, ([DateTime]::Now.ToString('o') + ' Launcher entered; PID=' + $PID + '; Session=' + [Diagnostics.Process]::GetCurrentProcess().SessionId + [Environment]::NewLine))
}
try {
    & (Join-Path $PSScriptRoot 'StudyProgress.ps1') @args
} catch {
    [IO.File]::AppendAllText($logPath, ([DateTime]::Now.ToString('o') + ' ERROR' + [Environment]::NewLine + ($_ | Out-String)))
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show(('The study widget could not open. Details: ' + $logPath + [Environment]::NewLine + $_.Exception.Message), 'Study Progress')
    exit 1
}
