$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ErrorActionPreference = 'Stop'
try { & (Join-Path $PSScriptRoot 'StudyDashboard.ps1') @args }
catch {
    $logPath = Join-Path $workspaceRoot '.tutor-cache\dashboard-startup.log'
    [void][IO.Directory]::CreateDirectory((Split-Path $logPath))
    [IO.File]::AppendAllText($logPath, ([DateTime]::Now.ToString('o') + [Environment]::NewLine + ($_ | Out-String)))
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show(('The dashboard could not open. Details: ' + $logPath + [Environment]::NewLine + $_.Exception.Message), 'Study Dashboard')
    exit 1
}
