$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('StudyLauncherTest_' + [guid]::NewGuid().ToString('N') + ' space ä')
$compiler = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'csc.exe'
function Assert-Launcher([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Invoke-Launcher([string]$Mode) {
    $options = @{ FilePath = (Join-Path $testRoot 'StudyApp.exe'); WorkingDirectory = $env:TEMP; Wait = $true; PassThru = $true; WindowStyle = 'Hidden' }
    if ($Mode) { $options.ArgumentList = $Mode }
    (Start-Process @options).ExitCode
}
function Wait-Marker([string]$Name) {
    $file = Join-Path $testRoot $Name
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $file)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw "Launcher child did not write $Name" }
        Start-Sleep -Milliseconds 100
    }
    [IO.File]::ReadAllText($file)
}
$oldRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
    [void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'study-app\node_modules\electron\dist'))
    [void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'study-app\dist'))
    [void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'study-app\scripts'))
    [void][IO.Directory]::CreateDirectory((Join-Path $testRoot 'tools\study'))
    Copy-Item -LiteralPath (Join-Path $workspaceRoot 'StudyApp.exe') -Destination $testRoot
    foreach ($name in @('main.cjs','preload.cjs','index.html','renderer.js','style.css')) {
        [IO.File]::WriteAllText((Join-Path $testRoot ('study-app\dist\' + $name)), '')
    }
    foreach ($name in @('StudyProgress.ps1','StudyDashboard.ps1','StudyTimer.ps1','StudyData.ps1')) {
        [IO.File]::WriteAllText((Join-Path $testRoot ('tools\study\' + $name)), '')
    }
    [IO.File]::WriteAllText((Join-Path $testRoot 'study-app\scripts\timer-bridge.ps1'), '')
    $stub = @'
using System;
using System.IO;
class Stub {
    static void Main(string[] args) {
        File.WriteAllLines(Path.Combine(Environment.CurrentDirectory, "electron.txt"), new string[] {
            args.Length.ToString(), args[0], Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE") ?? "<unset>"
        });
    }
}
'@
    $stubSource = Join-Path $testRoot 'Stub.cs'
    [IO.File]::WriteAllText($stubSource, $stub)
    & $compiler /nologo /target:winexe (('/out:{0}' -f (Join-Path $testRoot 'study-app\node_modules\electron\dist\electron.exe'))) $stubSource
    if ($LASTEXITCODE -ne 0) { throw 'Stub compilation failed.' }
    $widget = @'
param([switch]$StopSession)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ($StopSession) { [IO.File]::WriteAllText((Join-Path $root 'stop.txt'), 'stopped'); exit 23 }
[IO.File]::WriteAllText((Join-Path $root 'widget.txt'), 'widget')
'@
    [IO.File]::WriteAllText((Join-Path $testRoot 'tools\study\StudyProgressLauncher.ps1'), $widget)
    [IO.File]::WriteAllText((Join-Path $testRoot 'tools\study\StudyDashboardLauncher.ps1'), ($widget.Replace('widget.txt','dashboard.txt')))
    Assert-Launcher ((Invoke-Launcher '--check') -eq 0) 'Complete fixture failed --check.'
    $env:ELECTRON_RUN_AS_NODE = '1'
    Assert-Launcher ((Invoke-Launcher '') -eq 0) 'App launcher failed.'
    $lines = (Wait-Marker 'electron.txt') -split '\r?\n'
    Assert-Launcher ($lines[0] -eq '1' -and $lines[1] -eq (Join-Path $testRoot 'study-app') -and $lines[2] -eq '<unset>') 'App path quoting or Electron environment failed.'
    Assert-Launcher ((Invoke-Launcher '--widget') -eq 0) 'Widget launch failed.'
    Assert-Launcher ((Wait-Marker 'widget.txt') -eq 'widget') 'Widget route failed.'
    Assert-Launcher ((Invoke-Launcher '--dashboard') -eq 0) 'Dashboard launch failed.'
    [void](Wait-Marker 'dashboard.txt')
    Assert-Launcher ((Invoke-Launcher '--stop-session') -eq 23) 'Stop must wait and return the child exit code.'
    Assert-Launcher ((Wait-Marker 'stop.txt') -eq 'stopped') 'Stop switch was not forwarded.'
    Remove-Item -LiteralPath (Join-Path $testRoot 'study-app\dist\main.cjs')
    Assert-Launcher ((Invoke-Launcher '--check') -eq 1) 'Missing required files must fail --check.'
    Assert-Launcher (Test-Path -LiteralPath (Join-Path $testRoot '.tutor-cache\launcher-startup.log')) 'Startup errors must be logged.'
    'Launcher checks passed: paths with spaces/Unicode, arbitrary working directory, app/widget/dashboard routes, Electron environment, synchronous Stop, missing-file detection.'
} finally {
    $env:ELECTRON_RUN_AS_NODE = $oldRunAsNode
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $expectedPrefix = Join-Path ([IO.Path]::GetTempPath()) 'StudyLauncherTest_'
    if (-not $resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe launcher test cleanup path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
