param([switch]$Check, [switch]$StartSession, [switch]$StopSession, [string]$Subject, [string]$PreviewPath)
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $PSScriptRoot 'StudyTimer.ps1')
# Set DPI awareness before creating any UI to avoid Windows bitmap stretching.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StudyWidgetDpi {
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("shcore.dll")] private static extern int SetProcessDpiAwareness(int awareness);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll")] private static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetUserObjectInformation(IntPtr handle, int index, System.Text.StringBuilder text, int length, out int needed);
    private static string ObjectName(IntPtr handle) {
        var text = new System.Text.StringBuilder(256); int needed;
        return GetUserObjectInformation(handle, 2, text, text.Capacity * 2, out needed) ? text.ToString() : "unknown";
    }
    public static string DesktopIdentity() {
        return ObjectName(GetProcessWindowStation()) + "/" + ObjectName(GetThreadDesktop(GetCurrentThreadId()));
    }
    public static void Enable() {
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (EntryPointNotFoundException) {}
        try { if (SetProcessDpiAwareness(2) == 0) return; } catch (DllNotFoundException) {} catch (EntryPointNotFoundException) {}
        SetProcessDPIAware();
    }
}
'@
[StudyWidgetDpi]::Enable()
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$cacheRoot = Join-Path $workspaceRoot '.tutor-cache'
$subjectCacheRoot = Join-Path $cacheRoot 'subjects'
$activeSubjectPath = Join-Path $cacheRoot 'active-subject.txt'
$subjects = @(Get-ChildItem -LiteralPath (Join-Path $workspaceRoot 'StudyVault') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '00-Dashboard\Curriculum Coverage.md') } | Sort-Object Name | ForEach-Object Name)
if ($subjects.Count -eq 0) { throw 'No subjects with Curriculum Coverage.md found' }
if (-not $Subject -and (Test-Path -LiteralPath $activeSubjectPath)) { $Subject = [IO.File]::ReadAllText($activeSubjectPath).Trim() }
if (-not $Subject) { $Subject = if ($subjects -contains 'React') { 'React' } else { $subjects[0] } }
if ($subjects -notcontains $Subject) { throw ('Unknown study subject: ' + $Subject) }
function Set-SubjectPaths([string]$name) {
    if ($subjects -notcontains $name) { throw ('Unknown study subject: ' + $name) }
    $script:currentSubject = $name
    $script:vaultPath = Join-Path (Join-Path $workspaceRoot 'StudyVault') $name
    $script:coveragePath = Join-Path $script:vaultPath '00-Dashboard\Curriculum Coverage.md'
    $script:subjectStatePath = Join-Path $script:subjectCacheRoot $name
    $script:sessionPath = Join-Path $script:subjectStatePath 'study-session.json'
    $script:topicPath = Join-Path $script:subjectStatePath 'current-topic.txt'
}
function Import-LegacyStudyState {
    # Legacy accumulated hours belong to React. Keep the original file as a backup.
    $legacySession = Join-Path $cacheRoot 'study-session.json'
    if (($subjects -contains 'React') -and (Test-Path -LiteralPath $legacySession)) {
        $reactState = Join-Path $subjectCacheRoot 'React'
        $reactSession = Join-Path $reactState 'study-session.json'
        if (-not (Test-Path -LiteralPath $reactSession)) {
            [void][IO.Directory]::CreateDirectory($reactState)
            Copy-Item -LiteralPath $legacySession -Destination $reactSession
        }
    }
    $legacyTopic = Join-Path $cacheRoot 'current-topic.txt'
    if (Test-Path -LiteralPath $legacyTopic) {
        $text = [IO.File]::ReadAllText($legacyTopic).Trim()
        $topicSubject = if ($text -match '^Finnish(?:\s|$)') { 'Finnish' } else { 'React' }
        if ($subjects -contains $topicSubject) {
            $state = Join-Path $subjectCacheRoot $topicSubject
            $destination = Join-Path $state 'current-topic.txt'
            if (-not (Test-Path -LiteralPath $destination)) {
                [void][IO.Directory]::CreateDirectory($state)
                [IO.File]::WriteAllText($destination, $text)
            }
        }
    }
}
Set-SubjectPaths $Subject
function Save-StudySession($session) {
    [void][System.IO.Directory]::CreateDirectory((Split-Path $sessionPath))
    $tempPath = $sessionPath + '.tmp'
    [System.IO.File]::WriteAllText($tempPath, ($session | ConvertTo-Json -Compress))
    Move-Item -LiteralPath $tempPath -Destination $sessionPath -Force
}
function Get-SessionSeconds($session, [DateTime]$now) {
    $started = [DateTime]::Parse($session.startedUtc).ToUniversalTime()
    $end = $now.ToUniversalTime()
    if ($session.stoppedUtc) { $end = [DateTime]::Parse($session.stoppedUtc).ToUniversalTime() }
    [double]$session.elapsedBeforeSeconds + [Math]::Max(0, ($end - $started).TotalSeconds)
}
function Get-TotalStudySeconds($session, [DateTime]$now) {
    [double]$session.totalBeforeSeconds + (Get-SessionSeconds $session $now)
}
function Invoke-WidgetTimer([string]$Action) {
    if ($Check) {
        # Preserve the existing isolated check layout without invoking the real workspace.
        if ($Action -eq 'checkpoint') { Sync-StudyActivity $sessionPath; return }
        if ($Action -eq 'stop') { Stop-SavedStudyTimer $sessionPath; return }
        $elapsed = 0.0; $total = 0.0
        if (Test-Path -LiteralPath $sessionPath) {
            $old = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
            if ($Action -eq 'start' -and -not $old.stoppedUtc) { return }
            Stop-SavedStudyTimer $sessionPath
            $old = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
            $elapsed = Get-SavedStudySeconds $old; $total = [double]$old.totalBeforeSeconds
        }
        if ($Action -eq 'reset') { $total += $elapsed; $elapsed = 0.0 }
        $now = [DateTime]::UtcNow.ToString('o')
        $stop = if ($Action -eq 'reset') { $now } else { $null }
        Write-StudyTimer $sessionPath ([pscustomobject]@{ startedUtc=$now; stoppedUtc=$stop; totalBeforeSeconds=$total; elapsedBeforeSeconds=$elapsed })
    } else { Invoke-StudyTimer $workspaceRoot $currentSubject $Action }
}
function Stop-StudySession { Invoke-WidgetTimer 'stop' }
function Initialize-StudySession { Invoke-WidgetTimer 'reset' }
function Start-StudySession { Invoke-WidgetTimer 'start' }
function Format-StudyElapsed([DateTime]$started, [DateTime]$now) {
    $elapsed = $now.ToUniversalTime() - $started.ToUniversalTime()
    $seconds = [Math]::Max(0, [Math]::Floor($elapsed.TotalSeconds))
    '{0:00}:{1:00}:{2:00}' -f [int][Math]::Floor($seconds / 3600), [int][Math]::Floor(($seconds % 3600) / 60), [int]($seconds % 60)
}
if ($StopSession) {
    Import-LegacyStudyState
    # Freeze every subject to prevent unattended study time.
    foreach ($name in $subjects) { Set-SubjectPaths $name; Stop-StudySession }
    exit
}
if (-not $Check) {
    # Acquire the workspace mutex before changing saved state.
    $hash = [System.Security.Cryptography.SHA256]::Create()
    $identity = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($workspaceRoot.ToLowerInvariant() + '|' + [StudyWidgetDpi]::DesktopIdentity())))).Replace('-', '')
    $hash.Dispose()
    $script:widgetMutex = New-Object System.Threading.Mutex($false, ('Local\StudyProgress_' + $identity))
    $eventName = 'Local\StudyProgressShow_' + $identity
    $script:showEvent = [Threading.EventWaitHandle]::new($false, [Threading.EventResetMode]::AutoReset, $eventName)
    try { $ownsWidget = $script:widgetMutex.WaitOne(0, $false) } catch [Threading.AbandonedMutexException] { $ownsWidget = $true }
    if (-not $ownsWidget) {
        [IO.File]::AppendAllText((Join-Path $cacheRoot 'widget-startup.log'), ([DateTime]::Now.ToString('o') + ' Existing widget on ' + [StudyWidgetDpi]::DesktopIdentity() + '; requested foreground.' + [Environment]::NewLine))
        # Reopening the launcher brings the existing widget forward without changing time.
        [void]$script:showEvent.Set()
        $script:showEvent.Dispose()
        $script:widgetMutex.Dispose()
        exit
    }
    [IO.File]::AppendAllText((Join-Path $cacheRoot 'widget-startup.log'), ([DateTime]::Now.ToString('o') + ' New widget on ' + [StudyWidgetDpi]::DesktopIdentity() + [Environment]::NewLine))
    Import-LegacyStudyState
    foreach ($name in $subjects) { Set-SubjectPaths $name; Stop-StudySession }
    Set-SubjectPaths $Subject
    # Opening and changing subjects never start or reset existing time.
    if (-not (Test-Path -LiteralPath $sessionPath)) { Initialize-StudySession }
    [IO.File]::WriteAllText($activeSubjectPath, $currentSubject)
}

function Get-StudyProgress {
    $content = [System.IO.File]::ReadAllText($coveragePath)
    $match = [regex]::Match($content, '(?m)^\|\s*Total\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|')
    if (-not $match.Success) { throw 'Coverage totals missing' }
    $total = [int]$match.Groups[1].Value
    $reached = [int]$match.Groups[2].Value
    if ($total -le 0 -or $reached -lt 0 -or $reached -gt $total) { throw 'Invalid coverage totals' }
    [pscustomobject]@{ Total = $total; Reached = $reached; Percent = 100.0 * $reached / $total }
}

function Get-StudyTopics {
    $content = [IO.File]::ReadAllText($coveragePath)
    $checklist = [regex]::Match($content, '(?ms)^## Topic Checklist\r?\n(.*?)(?=^## |\z)')
    if ($checklist.Success) {
        $section = ''
        foreach ($line in ($checklist.Groups[1].Value -split '\r?\n')) {
            if ($line -match '^### (.+)$') { $section = $Matches[1].Trim() }
            elseif ($line -match '^- \[([ xX])\] (.+)$') {
                $reached = $Matches[1] -match '[xX]'
                $name = ($Matches[2] -replace '\s*->\s*\[\[.*$', '').Trim()
                [pscustomobject]@{ Section = $section; Name = $name; Reached = $reached }
            }
        }
        return
    }
    $reachedSection = [regex]::Match($content, '(?ms)^## Reached topics\r?\n(.*?)(?=^## |\z)').Groups[1].Value
    $reachedNames = @([regex]::Matches($reachedSection, '(?m)^- (.+?)\r?$') | ForEach-Object { $_.Groups[1].Value.Trim() })
    foreach ($section in (Get-ChildItem -LiteralPath $vaultPath -Directory | Where-Object { $_.Name -match '^\d+-' -and $_.Name -notmatch '^(00|90)-' } | Sort-Object Name)) {
        foreach ($note in (Get-ChildItem -LiteralPath $section.FullName -Filter '*.md' -File | Where-Object { $_.BaseName -notmatch 'Practice$' } | Sort-Object Name)) {
            [pscustomobject]@{ Section = $section.Name; Name = $note.BaseName; Reached = $reachedNames -contains $note.BaseName }
        }
    }
}

[xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Study Progress" Width="520" MinWidth="340" MinHeight="170" SizeToContent="Height"
        WindowStyle="None" ResizeMode="CanResizeWithGrip" Topmost="True"
        Background="#1C1F26" Foreground="#F5F7FA" FontFamily="Segoe UI"
        UseLayoutRounding="True" SnapsToDevicePixels="True"
        TextOptions.TextFormattingMode="Display" TextOptions.TextRenderingMode="ClearType">
    <Border Background="#1C1F26" BorderBrush="#3B414D" BorderThickness="1" Padding="16,12">
        <Grid>
            <Grid.RowDefinitions>
                <RowDefinition Height="28"/>
                <RowDefinition Height="34"/>
                <RowDefinition Height="10"/>
                <RowDefinition Height="28"/>
                <RowDefinition Height="*"/>
            </Grid.RowDefinitions>
            <StackPanel Orientation="Horizontal" Margin="0,0,30,0">
                <ComboBox x:Name="SubjectSelector" Width="135" Height="24" FontSize="12" VerticalAlignment="Top"
                          Background="#F5F7FA" Foreground="#1C1F26" ToolTip="Choose your study subject; switching pauses study time">
                    <ComboBox.ItemContainerStyle>
                        <Style TargetType="ComboBoxItem">
                            <Setter Property="Background" Value="#F5F7FA"/>
                            <Setter Property="Foreground" Value="#1C1F26"/>
                        </Style>
                    </ComboBox.ItemContainerStyle>
                </ComboBox>
                <TextBlock x:Name="TotalHours" Margin="12,0,0,0" FontSize="11" Foreground="#5ED3A8" Text="0.00 h total"/>
                <Button x:Name="DashboardButton" Content="Dashboard" Width="86" Height="24" Margin="12,0,0,0" FontSize="11" Cursor="Hand" Background="#373C46" Foreground="#F5F7FA" BorderBrush="#5ED3A8" ToolTip="Open your topics and daily study heatmap"/>
            </StackPanel>
            <Button x:Name="CloseButton" Content="&#x00D7;" HorizontalAlignment="Right"
                    Width="24" Height="22" FontSize="17" Foreground="#A9B3C2" Cursor="Hand">
                <Button.Template>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="ButtonBackground" Background="Transparent" CornerRadius="3">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="ButtonBackground" Property="Background" Value="#39414D"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Button.Template>
            </Button>
            <StackPanel Grid.Row="1" Orientation="Horizontal" VerticalAlignment="Center">
                <TextBlock x:Name="PercentText" FontSize="22" FontWeight="SemiBold"/>
                <TextBlock x:Name="DetailText" FontSize="12" Foreground="#A9B3C2" Margin="12,0,0,0" VerticalAlignment="Center"/>
            </StackPanel>
            <Border x:Name="Track" Grid.Row="2" Background="#373C46" CornerRadius="5" ClipToBounds="True">
                <Border x:Name="Fill" Background="#5ED3A8" CornerRadius="5" HorizontalAlignment="Left" Width="0"/>
            </Border>
            <Grid Grid.Row="3" VerticalAlignment="Bottom">
                <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
                <TextBlock x:Name="SessionTime" Text="Study time  00:00:00" FontSize="12" Foreground="#A9B3C2"/>
                <Button x:Name="TimerButton" Grid.Column="1" Content="Start" Width="54" Height="24" Margin="10,0,0,0" Cursor="Hand" Background="#373C46" Foreground="#F5F7FA" BorderBrush="#5ED3A8" ToolTip="Start or stop study time"/>
                <Button x:Name="ResetButton" Grid.Column="2" Content="Reset" Width="54" Height="24" Margin="6,0,0,0" Cursor="Hand" Background="#373C46" Foreground="#F5F7FA" BorderBrush="#5ED3A8" ToolTip="Reset session time and pause; keep total study hours"/>
                <TextBlock x:Name="CurrentTopic" Grid.Column="3" Margin="16,0,0,0" FontSize="12" Foreground="#5ED3A8" TextTrimming="CharacterEllipsis"/>
            </Grid>
            <Expander x:Name="TopicDropdown" Grid.Row="4" Header="All topics" Margin="0,12,0,0"
                      Foreground="#A9B3C2" FontSize="12" HorizontalContentAlignment="Stretch">
                <ScrollViewer MaxHeight="330" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled"
                              Margin="0,10,0,12" CanContentScroll="False">
                    <StackPanel x:Name="TopicList"/>
                </ScrollViewer>
            </Expander>
        </Grid>
    </Border>
</Window>
'@
$reader = New-Object System.Xml.XmlNodeReader $markup
$window = [Windows.Markup.XamlReader]::Load($reader)
$reader.Close()
$percentText = $window.FindName('PercentText')
$detailText = $window.FindName('DetailText')
$track = $window.FindName('Track')
$fill = $window.FindName('Fill')
$script:lastKey = ''
$script:percentage = 0.0
$script:lastTopicKey = ''
function Update-TopicList {
    $topics = @(Get-StudyTopics)
    $key = ($topics | ForEach-Object { "$($_.Section)/$($_.Name)/$($_.Reached)" }) -join '|'
    if ($key -eq $script:lastTopicKey) { return }
    $panel = $window.FindName('TopicList')
    $panel.Children.Clear()
    $lastSection = ''
    foreach ($topic in $topics) {
        if ($topic.Section -ne $lastSection) {
            $heading = New-Object System.Windows.Controls.TextBlock
            $heading.Text = ($topic.Section -replace '^\d+-', '' -replace '-', ' ')
            $heading.FontSize = 11
            $heading.FontWeight = [System.Windows.FontWeights]::SemiBold
            $heading.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString('#A9B3C2')
            $heading.Margin = New-Object System.Windows.Thickness(0, 10, 0, 6)
            [void]$panel.Children.Add($heading)
            $lastSection = $topic.Section
        }
        $row = New-Object System.Windows.Controls.Grid
        $markColumn = New-Object System.Windows.Controls.ColumnDefinition
        $markColumn.Width = New-Object System.Windows.GridLength(22)
        [void]$row.ColumnDefinitions.Add($markColumn)
        [void]$row.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
        $row.Margin = New-Object System.Windows.Thickness(0, 4, 8, 4)
        $mark = New-Object System.Windows.Controls.TextBlock
        if ($topic.Reached) { $mark.Text = [string][char]0x2713 }
        $mark.FontSize = 13
        $mark.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString('#5ED3A8')
        [void]$row.Children.Add($mark)
        $label = New-Object System.Windows.Controls.TextBlock
        $label.Text = $topic.Name
        $label.FontSize = 12
        $label.TextWrapping = 'Wrap'
        $label.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString('#F5F7FA')
        [System.Windows.Controls.Grid]::SetColumn($label, 1)
        [void]$row.Children.Add($label)
        [void]$panel.Children.Add($row)
    }
    $script:lastTopicKey = $key
}

function Update-CurrentTopic {
    try {
        $topic = [System.IO.File]::ReadAllText($topicPath).Trim()
        $window.FindName('CurrentTopic').Text = $topic
        $window.FindName('CurrentTopic').ToolTip = $topic
    } catch {
        $window.FindName('CurrentTopic').Text = $currentSubject + ' study'
        $window.FindName('CurrentTopic').ToolTip = $currentSubject + ' study'
    }
}

function Update-SessionTime {
    try {
        if (-not $script:lastActivitySync -or ([DateTime]::UtcNow - $script:lastActivitySync).TotalSeconds -ge 30) {
            Invoke-WidgetTimer 'checkpoint'
            $script:lastActivitySync = [DateTime]::UtcNow
        }
        $session = [System.IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
        $started = [DateTime]::Parse($session.startedUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        $now = [DateTime]::UtcNow
        $end = $now
        if ($session.stoppedUtc) { $end = [DateTime]::Parse($session.stoppedUtc) }
        $elapsed = Get-SessionSeconds $session $now
        $window.FindName('SessionTime').Text = 'Study time  ' + (Format-StudyElapsed $now.AddSeconds(-$elapsed) $now)
        $window.FindName('TimerButton').Content = if ($session.stoppedUtc) { 'Start' } else { 'Stop' }
        $window.FindName('TotalHours').Text = ('{0:0.00} h subject total' -f ((Get-TotalStudySeconds $session $now) / 3600))
    } catch {
        $window.FindName('SessionTime').Text = 'Study timer unavailable'
    }
}

function Update-Widget {
    Update-CurrentTopic
    try {
        $progress = Get-StudyProgress
        Update-TopicList
        $key = "$currentSubject/$($progress.Reached)/$($progress.Total)"
        if ($key -ne $script:lastKey) {
            $percentText.Text = ('{0:0.0}%' -f $progress.Percent)
            $detailText.Text = ('{0} / {1} topics reached' -f $progress.Reached, $progress.Total)
            $script:percentage = $progress.Percent
            $fill.Width = [Math]::Max(0, $track.ActualWidth * $script:percentage / 100)
            $script:lastKey = $key
        }
    } catch {
        if ($script:lastKey -ne 'error') {
            $percentText.Text = '--'
            $detailText.Text = 'Coverage unavailable'
            $script:lastKey = 'error'
        }
    }
}
function Resize-ToTopics {
    # Fit content vertically while preserving the user's chosen width.
    $window.SizeToContent = 'Manual'
    $content = $window.Content
    $content.InvalidateMeasure()
    $content.Measure([System.Windows.Size]::new($window.Width, [double]::PositiveInfinity))
    $window.Height = [Math]::Max($window.MinHeight, $content.DesiredSize.Height)
    $window.UpdateLayout()
}
$topicDropdown = $window.FindName('TopicDropdown')
$topicDropdown.Add_Expanded({ [void]$window.Dispatcher.BeginInvoke([Action]{ Resize-ToTopics }, [System.Windows.Threading.DispatcherPriority]::Loaded) })
$topicDropdown.Add_Collapsed({ [void]$window.Dispatcher.BeginInvoke([Action]{ Resize-ToTopics }, [System.Windows.Threading.DispatcherPriority]::Loaded) })

function Select-StudySubject([string]$name) {
    if ($name -eq $currentSubject) { return }
    Stop-StudySession
    Set-SubjectPaths $name
    $script:lastActivitySync = $null
    if (-not (Test-Path -LiteralPath $sessionPath)) { Initialize-StudySession }
    Stop-StudySession
    if (-not $Check) { Invoke-WidgetTimer 'select' }
    $script:lastKey = ''
    $script:lastTopicKey = ''
    $window.Title = $currentSubject + ' Study Progress'
    Update-Widget
    Update-SessionTime
    Resize-ToTopics
}
$subjectSelector = $window.FindName('SubjectSelector')
foreach ($name in $subjects) { [void]$subjectSelector.Items.Add($name) }
$subjectSelector.SelectedItem = $currentSubject
$window.Title = $currentSubject + ' Study Progress'
$subjectSelector.Add_SelectionChanged({
    if ($null -ne $subjectSelector.SelectedItem) { Select-StudySubject ([string]$subjectSelector.SelectedItem) }
})

if ($Check) {
    # Isolate timer/migration checks from the learner's saved state.
    $testRoot = Join-Path ([IO.Path]::GetTempPath()) ('StudyWidgetCheck_' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($testRoot)
    $script:cacheRoot = $testRoot
    $script:subjectCacheRoot = Join-Path $testRoot 'subjects'
    $testStart = [DateTime]::SpecifyKind([DateTime]'2026-10-13T10:00:00', [DateTimeKind]::Utc)
    if ((Format-StudyElapsed $testStart $testStart.AddSeconds(3661)) -ne '01:01:01') { throw 'Timer formatting failed' }
    if ((Format-StudyElapsed $testStart $testStart.AddHours(25)) -ne '25:00:00') { throw 'Long session timer failed' }
    if ($null -eq $window.FindName('SessionTime')) { throw 'Timer label missing' }
    $testSession = [pscustomobject]@{ startedUtc = $testStart.ToString('o'); totalBeforeSeconds = 7200; stoppedUtc = $testStart.AddHours(1).ToString('o') }
    if ((Get-TotalStudySeconds $testSession $testStart.AddHours(5)) -ne 10800) { throw 'Paused cumulative hours failed' }
    $legacy = [pscustomobject]@{ startedUtc = $testStart.ToString('o'); stoppedUtc = $testStart.ToString('o'); totalBeforeSeconds = 3600; elapsedBeforeSeconds = 60 }
    [IO.File]::WriteAllText((Join-Path $testRoot 'study-session.json'), ($legacy | ConvertTo-Json -Compress))
    [IO.File]::WriteAllText((Join-Path $testRoot 'current-topic.txt'), 'Finnish - diagnostic')
    Import-LegacyStudyState
    Set-SubjectPaths 'React'
    $migrated = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if ((Get-TotalStudySeconds $migrated ([DateTime]::UtcNow)) -ne 3660) { throw 'React time migration failed' }
    $migrated.totalBeforeSeconds = 7200
    Save-StudySession $migrated
    Import-LegacyStudyState
    $again = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if ($again.totalBeforeSeconds -ne 7200) { throw 'Migration overwrote existing subject hours' }
    Update-SessionTime
    if ($null -eq $window.FindName('TotalHours')) { throw 'Total hours label missing' }
    $subjectResults = @()
    foreach ($name in $subjects) {
        Set-SubjectPaths $name
        $script:lastTopicKey = ''
        $progress = Get-StudyProgress
        $topics = @(Get-StudyTopics)
        Update-TopicList
        if ($topics.Count -ne $progress.Total) { throw ('Topic count mismatch: ' + $name) }
        $checked = @($topics | Where-Object Reached).Count
        if ($checked -ne $progress.Reached) { throw ('Checkmark mismatch: ' + $name) }
        $subjectResults += [pscustomobject]@{ Subject = $name; Total = $topics.Count; Reached = $checked }
    }
    Set-SubjectPaths 'React'
    $subjectSelector.SelectedItem = 'React'
    Start-StudySession
    $subjectSelector.SelectedItem = 'Finnish'
    if ($currentSubject -ne 'Finnish') { throw 'Selector did not switch subject' }
    $finnishSession = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if (-not $finnishSession.stoppedUtc) { throw 'Switch started incoming timer' }
    $reactSession = [IO.File]::ReadAllText((Join-Path $subjectCacheRoot 'React\study-session.json')) | ConvertFrom-Json
    if (-not $reactSession.stoppedUtc) { throw 'Switch did not stop outgoing timer' }
    if ((Get-TotalStudySeconds $reactSession ([DateTime]::UtcNow)) -lt 7260) { throw 'Switch lost React hours' }
    Update-CurrentTopic
    if ($window.FindName('CurrentTopic').Text -ne 'Finnish - diagnostic') { throw 'Wrong subject lesson label' }
    $finnishSession.elapsedBeforeSeconds = 120
    Save-StudySession $finnishSession
    Initialize-StudySession
    $reset = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if ((Get-SessionSeconds $reset ([DateTime]::UtcNow)) -ne 0 -or (Get-TotalStudySeconds $reset ([DateTime]::UtcNow)) -ne 120 -or -not $reset.stoppedUtc) { throw 'Reset lost total or started timer' }
    $subjectSelector.SelectedItem = 'React'
    $returned = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if (-not $returned.stoppedUtc -or (Get-SessionSeconds $returned ([DateTime]::UtcNow)) -lt 60) { throw 'Return switch reset or resumed timer' }
    $subjectSelector.SelectedItem = $Subject
    Update-Widget
    Update-SessionTime

    $window.Opacity = 0
    $window.Show()
    Resize-ToTopics
    $collapsedHeight = $window.ActualHeight
    $originalWidth = $window.ActualWidth
    $topicDropdown.IsExpanded = $true
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
    $window.UpdateLayout()
    $expandedHeight = $window.ActualHeight
    if ($expandedHeight -le $collapsedHeight) { throw 'Opening topics did not grow the widget' }
    $topicDropdown.IsExpanded = $false
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
    $window.UpdateLayout()
    if ([Math]::Abs($window.ActualHeight - $collapsedHeight) -gt 1) { throw 'Closing topics did not restore compact height' }
    if ([Math]::Abs($window.ActualWidth - $originalWidth) -gt 1) { throw 'Dropdown changed widget width' }
    if ($PreviewPath) {
        $visual = $window.Content
        $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new([int][Math]::Ceiling($visual.ActualWidth), [int][Math]::Ceiling($visual.ActualHeight), 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($visual)
        $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
        $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $stream = [IO.File]::Create($PreviewPath)
        try { $encoder.Save($stream) } finally { $stream.Dispose() }
    }
    [pscustomobject]@{ CollapsedHeight = $collapsedHeight; ExpandedHeight = $expandedHeight; Subjects = $subjectResults; TimerMigration = 'passed'; Switching = 'passed'; ResetPreservesTotal = 'passed' } | ConvertTo-Json -Compress
    $window.Close()
    # The explicitly created test directory is within the system temp directory.
    $resolvedTest = [IO.Path]::GetFullPath($testRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolvedTest.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolvedTest -Recurse -Force
    exit
}
$track.Add_SizeChanged({ $fill.Width = [Math]::Max(0, $track.ActualWidth * $script:percentage / 100) })
$window.FindName('CloseButton').Add_Click({ $window.Close() })
$window.FindName('DashboardButton').Add_Click({
    Start-Process -FilePath (Join-Path $workspaceRoot 'StudyApp.exe') -ArgumentList '--dashboard' -WindowStyle Hidden
})
$window.FindName('TimerButton').Add_Click({
    $session = [System.IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
    if ($session.stoppedUtc) { Start-StudySession } else { Stop-StudySession }
    Update-SessionTime
})
$window.FindName('ResetButton').Add_Click({
    Initialize-StudySession
    Update-SessionTime
})
$window.Add_MouseLeftButtonDown({
    $source = $_.OriginalSource
    while ($null -ne $source) {
        if ($source -is [System.Windows.Controls.ComboBox] -or $source -is [System.Windows.Controls.Primitives.ButtonBase] -or $source -is [System.Windows.Controls.Expander] -or $source -is [System.Windows.Controls.ScrollViewer]) { return }
        if ($source -is [System.Windows.Media.Visual]) { $source = [System.Windows.Media.VisualTreeHelper]::GetParent($source) } else { break }
    }
    $window.DragMove()
})
$workArea = [System.Windows.SystemParameters]::WorkArea
$window.Left = $workArea.Right - $window.Width - 20
$window.Top = $workArea.Top + 30
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(2)
$timer.Add_Tick({
    if ($script:showEvent.WaitOne(0)) {
        $window.Show()
        $window.WindowState = 'Normal'
        $window.Topmost = $true
        [void]$window.Activate()
    }
    if (Test-Path -LiteralPath $activeSubjectPath) {
        $selected = [IO.File]::ReadAllText($activeSubjectPath).Trim()
        if ($subjects -contains $selected -and $selected -ne $currentSubject) {
            Set-SubjectPaths $selected
            $subjectSelector.SelectedItem = $selected
            $script:lastKey = ''; $script:lastTopicKey = ''
            $window.Title = $selected + ' Study Progress'
        }
    }
    Update-Widget
})
$sessionTimer = New-Object System.Windows.Threading.DispatcherTimer
$sessionTimer.Interval = [TimeSpan]::FromSeconds(1)
$sessionTimer.Add_Tick({ Update-SessionTime })
$window.Add_ContentRendered({ $window.Height = $window.ActualHeight; $window.SizeToContent = 'Manual'; Update-Widget; Update-SessionTime; $timer.Start(); $sessionTimer.Start(); [IO.File]::AppendAllText((Join-Path $cacheRoot 'widget-startup.log'), ([DateTime]::Now.ToString('o') + ' Widget rendered: ' + $window.Title + [Environment]::NewLine)) })
$window.Add_Closed({ $timer.Stop(); $sessionTimer.Stop(); Stop-StudySession })
try { [void]$window.ShowDialog() } finally {
    $script:showEvent.Dispose()
    $script:widgetMutex.ReleaseMutex()
    $script:widgetMutex.Dispose()
}
