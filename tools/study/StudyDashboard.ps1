param([switch]$Check, [string]$PreviewPath)
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $PSScriptRoot 'StudyTimer.ps1')
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$subjects = @(Get-StudySubjects $workspaceRoot)
if (-not $subjects.Count) { throw 'No StudyVault subjects found.' }
$cache = Join-Path $workspaceRoot '.tutor-cache\subjects'
$zone = Get-StudyTimeZone
$today = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone).Date

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 Title="Study Dashboard" Width="1080" Height="840" MinWidth="850" MinHeight="600" WindowStartupLocation="CenterScreen"
 Background="#141A20" Foreground="#EAF0F4" FontFamily="Segoe UI" UseLayoutRounding="True">
 <Window.Resources>
  <Style TargetType="ComboBox"><Setter Property="FontSize" Value="14"/><Setter Property="Padding" Value="8,5"/></Style>
  <Style TargetType="Button"><Setter Property="Padding" Value="12,6"/><Setter Property="Cursor" Value="Hand"/></Style>
 </Window.Resources>
 <ScrollViewer VerticalScrollBarVisibility="Auto" Background="#141A20">
 <StackPanel Margin="32,28">
  <Grid><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
   <StackPanel><TextBlock Text="Your study space" FontSize="28" FontWeight="SemiBold"/><TextBlock Text="Small steps, visible over time." Foreground="#94A5B2" Margin="0,6,0,0" FontSize="14"/></StackPanel>
   <ComboBox x:Name="Subject" Grid.Column="1" Width="170" VerticalAlignment="Center" Foreground="#17212B"/>
  </Grid>
  <TextBlock x:Name="CurrentTopic" Foreground="#72D6AF" Margin="0,22,0,18" FontSize="14" TextWrapping="Wrap"/>
  <UniformGrid Columns="4" Margin="-5,0,-5,22">
   <Border Background="#202B34" CornerRadius="10" Padding="18" Margin="5"><StackPanel><TextBlock Text="TOPICS REACHED" Foreground="#94A5B2" FontSize="11"/><TextBlock x:Name="Coverage" FontSize="27" Margin="0,7,0,0"/><TextBlock Text="Exposure, not mastery" Foreground="#94A5B2" FontSize="11"/></StackPanel></Border>
   <Border Background="#202B34" CornerRadius="10" Padding="18" Margin="5"><StackPanel><TextBlock Text="TOTAL STUDY TIME" Foreground="#94A5B2" FontSize="11"/><TextBlock x:Name="Total" FontSize="27" Margin="0,7,0,0"/><TextBlock Text="Saved timer total" Foreground="#94A5B2" FontSize="11"/></StackPanel></Border>
   <Border Background="#202B34" CornerRadius="10" Padding="18" Margin="5"><StackPanel><TextBlock Text="DAYS STUDIED" Foreground="#94A5B2" FontSize="11"/><TextBlock x:Name="Days" FontSize="27" Margin="0,7,0,0"/><TextBlock Text="In the selected year" Foreground="#94A5B2" FontSize="11"/></StackPanel></Border>
   <Border Background="#202B34" CornerRadius="10" Padding="18" Margin="5"><StackPanel><TextBlock Text="THIS WEEK" Foreground="#94A5B2" FontSize="11"/><TextBlock x:Name="Week" FontSize="27" Margin="0,7,0,0"/><TextBlock Text="Recorded daily activity" Foreground="#94A5B2" FontSize="11"/></StackPanel></Border>
  </UniformGrid>
  <Border Background="#1B252E" CornerRadius="12" Padding="22" Margin="0,0,0,24"><StackPanel>
   <Grid><TextBlock Text="Study activity" FontSize="19" FontWeight="SemiBold"/><ComboBox x:Name="Year" Width="100" HorizontalAlignment="Right" Foreground="#17212B"/></Grid>
   <TextBlock Text="Hover over a day to see its date and study time. Days use Helsinki time." Foreground="#94A5B2" Margin="0,8,0,18" FontSize="12"/>
   <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="35"/><ColumnDefinition/></Grid.ColumnDefinitions><Grid.RowDefinitions><RowDefinition Height="20"/><RowDefinition Height="112"/></Grid.RowDefinitions>
    <Grid x:Name="Months" Grid.Column="1"/>
    <StackPanel Grid.Row="1"><TextBlock Text="Mon" FontSize="10" Foreground="#94A5B2" Margin="0,0,0,33"/><TextBlock Text="Thu" FontSize="10" Foreground="#94A5B2" Margin="0,0,0,33"/><TextBlock Text="Sun" FontSize="10" Foreground="#94A5B2"/></StackPanel>
    <Grid x:Name="Heatmap" Grid.Column="1" Grid.Row="1"/>
   </Grid>
   <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,14,0,0"><TextBlock Text="Less" Foreground="#94A5B2" FontSize="11" Margin="0,0,7,0"/><Border Width="12" Height="12" Background="#303D49" Margin="2"/><Border Width="12" Height="12" Background="#265A49" Margin="2"/><Border Width="12" Height="12" Background="#348566" Margin="2"/><Border Width="12" Height="12" Background="#4BB88A" Margin="2"/><Border Width="12" Height="12" Background="#72D6AF" Margin="2"/><TextBlock Text="More" Foreground="#94A5B2" FontSize="11" Margin="7,0,0,0"/></StackPanel>
   <TextBlock x:Name="HistoryNote" Foreground="#94A5B2" FontSize="11" TextWrapping="Wrap" Margin="0,14,0,0"/>
  </StackPanel></Border>
  <Grid Margin="0,0,0,14"><TextBlock Text="Your topics" FontSize="21" FontWeight="SemiBold"/><ComboBox x:Name="Filter" Width="175" HorizontalAlignment="Right" Foreground="#17212B"/></Grid>
  <TextBlock Text="A check means the topic has been taught or applied. Unchecked topics are still ahead." Foreground="#94A5B2" FontSize="12" Margin="0,0,0,16"/>
  <StackPanel x:Name="Topics"/>
  <Grid Margin="0,20,0,0"><TextBlock x:Name="Status" Text="Updates automatically every 15 seconds. Study time is controlled by the floating widget." Foreground="#94A5B2" TextWrapping="Wrap" FontSize="11" MaxWidth="700" HorizontalAlignment="Left"/><Button x:Name="Refresh" Content="Refresh" HorizontalAlignment="Right"/></Grid>
 </StackPanel>
 </ScrollViewer>
</Window>
'@
$reader = [Xml.XmlNodeReader]::new($xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
$reader.Close()
function Brush([string]$Color) { [Windows.Media.BrushConverter]::new().ConvertFromString($Color) }
function Label([string]$Text, [int]$Size = 12, [string]$Color = '#EAF0F4') {
    $label = [Windows.Controls.TextBlock]::new()
    $label.Text = $Text; $label.FontSize = $Size; $label.Foreground = Brush $Color
    $label.TextWrapping = 'Wrap'
    return $label
}
$subjectBox = $window.FindName('Subject'); $yearBox = $window.FindName('Year'); $filterBox = $window.FindName('Filter')
foreach ($subject in $subjects) { [void]$subjectBox.Items.Add($subject) }
$active = 'Finnish'
$activeFile = Join-Path $workspaceRoot '.tutor-cache\active-subject.txt'
if (Test-Path -LiteralPath $activeFile) { $active = [IO.File]::ReadAllText($activeFile).Trim() }
$subjectBox.SelectedItem = if ($subjects -contains $active) { $active } else { $subjects[0] }
foreach ($year in (($today.Year)..($today.Year - 5))) { [void]$yearBox.Items.Add($year) }
$yearBox.SelectedItem = $today.Year
foreach ($filter in @('All topics', 'Reached', 'Not reached')) { [void]$filterBox.Items.Add($filter) }
$filterBox.SelectedIndex = 0

function Update-Dashboard {
    $subject = [string]$subjectBox.SelectedItem
    $year = [int]$yearBox.SelectedItem
    $vault = Join-Path (Join-Path $workspaceRoot 'StudyVault') $subject
    $state = Join-Path $cache $subject
    $sessionPath = Join-Path $state 'study-session.json'
    if (-not $Check) { Invoke-StudyTimer $workspaceRoot $subject 'checkpoint' }
    $activity = Read-Activity (Join-Path $state 'study-activity.json')
    $topics = @(Get-DashboardTopics $vault)
    $window.FindName('Coverage').Text = ('{0} / {1}' -f @($topics | Where-Object Reached).Count, $topics.Count)
    $total = 0.0
    if (Test-Path -LiteralPath $sessionPath) {
        $session = [IO.File]::ReadAllText($sessionPath) | ConvertFrom-Json
        $end = [DateTime]::UtcNow
        if ($session.stoppedUtc) { $end = [DateTime]::Parse($session.stoppedUtc).ToUniversalTime() }
        $total = [double]$session.totalBeforeSeconds + [double]$session.elapsedBeforeSeconds + [Math]::Max(0, ($end - [DateTime]::Parse($session.startedUtc).ToUniversalTime()).TotalSeconds)
    }
    $window.FindName('Total').Text = ('{0:0.00} h' -f ($total / 3600))
    $window.FindName('Days').Text = [string]@($activity.days.Keys | Where-Object { $_.StartsWith("$year-") -and [double]$activity.days[$_] -gt 0 }).Count
    $monday = $today.AddDays(-(([int]$today.DayOfWeek + 6) % 7))
    $weekSeconds = 0.0
    for ($i = 0; $i -lt 7; $i++) { $weekSeconds += [double]$activity.days[$monday.AddDays($i).ToString('yyyy-MM-dd')] }
    $window.FindName('Week').Text = ('{0:0.0} h' -f ($weekSeconds / 3600))
    $topicFile = Join-Path $state 'current-topic.txt'
    $window.FindName('CurrentTopic').Text = if (Test-Path -LiteralPath $topicFile) { [IO.File]::ReadAllText($topicFile).Trim() } else { "$subject curriculum" }
    $mapped = 0.0; foreach ($seconds in $activity.days.Values) { $mapped += [double]$seconds }
    $unmapped = [Math]::Max(0, $total - $mapped)
    $window.FindName('HistoryNote').Text = if ($unmapped -gt 60) { ('Daily logging starts with recoverable sessions. {0:0.00} h of older saved time has no date breakdown; it stays in your total.' -f ($unmapped / 3600)) } else { 'Daily activity is recorded from the widget timer. Opening this dashboard does not start study time.' }

    $heatmap = $window.FindName('Heatmap'); $months = $window.FindName('Months')
    $heatmap.Children.Clear(); $heatmap.ColumnDefinitions.Clear(); $heatmap.RowDefinitions.Clear()
    $months.Children.Clear(); $months.ColumnDefinitions.Clear()
    $first = [DateTime]::new($year, 1, 1)
    $last = [DateTime]::new($year, 12, 31)
    $begin = $first.AddDays(-(([int]$first.DayOfWeek + 6) % 7))
    $columns = [int][Math]::Ceiling((($last - $begin).Days + 1) / 7.0)
    for ($i = 0; $i -lt $columns; $i++) { [void]$heatmap.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]::new()); [void]$months.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]::new()) }
    for ($i = 0; $i -lt 7; $i++) { [void]$heatmap.RowDefinitions.Add([Windows.Controls.RowDefinition]::new()) }
    for ($day = $begin; $day -le $last; $day = $day.AddDays(1)) {
        $offset = ($day - $begin).Days; $column = [int][Math]::Floor($offset / 7); $row = $offset % 7
        if ($day -lt $first) { continue }
        $key = $day.ToString('yyyy-MM-dd'); $seconds = [double]$activity.days[$key]
        $color = '#303D49'
        if ($seconds -gt 0) { $color = '#265A49' }; if ($seconds -ge 900) { $color = '#348566' }; if ($seconds -ge 1800) { $color = '#4BB88A' }; if ($seconds -ge 3600) { $color = '#72D6AF' }
        $cell = [Windows.Controls.Border]::new(); $cell.Background = Brush $color
        $cell.CornerRadius = [Windows.CornerRadius]::new(3); $cell.Margin = [Windows.Thickness]::new(2)
        $description = if ($day -gt $today) { 'Future day' } elseif ($seconds -gt 0) { '{0:0.#} min studied' -f ($seconds / 60) } else { 'No recorded study time' }
        $cell.ToolTip = "$key — $description"; $cell.SetValue([Windows.Automation.AutomationProperties]::NameProperty, "$key — $description")
        if ($day -gt $today) { $cell.Opacity = 0.3 }
        if ($day -eq $today) { $cell.BorderBrush = Brush '#EAF0F4'; $cell.BorderThickness = [Windows.Thickness]::new(1) }
        [Windows.Controls.Grid]::SetColumn($cell, $column); [Windows.Controls.Grid]::SetRow($cell, $row); [void]$heatmap.Children.Add($cell)
        if ($day.Day -eq 1) {
            $monthLabel = Label ($day.ToString('MMM', [Globalization.CultureInfo]::GetCultureInfo('en-US'))) 10 '#94A5B2'
            [Windows.Controls.Grid]::SetColumn($monthLabel, $column); [Windows.Controls.Grid]::SetColumnSpan($monthLabel, [Math]::Min(3, $columns - $column)); [void]$months.Children.Add($monthLabel)
        }
    }
    $panel = $window.FindName('Topics'); $panel.Children.Clear()
    $visible = @($topics | Where-Object { $filterBox.SelectedIndex -eq 0 -or ($filterBox.SelectedIndex -eq 1 -and $_.Reached) -or ($filterBox.SelectedIndex -eq 2 -and -not $_.Reached) })
    foreach ($group in ($visible | Group-Object Section)) {
        $heading = Label ($group.Name -replace '^\d+-', '' -replace '-', ' ') 14 '#94A5B2'
        $heading.Margin = [Windows.Thickness]::new(0,12,0,8); [void]$panel.Children.Add($heading)
        foreach ($topic in $group.Group) {
            $card = [Windows.Controls.Border]::new(); $card.Background = Brush '#202B34'; $card.CornerRadius = [Windows.CornerRadius]::new(7); $card.Padding = [Windows.Thickness]::new(14,10,14,10); $card.Margin = [Windows.Thickness]::new(0,0,0,5)
            $grid = [Windows.Controls.Grid]::new()
            $col = [Windows.Controls.ColumnDefinition]::new(); $col.Width = [Windows.GridLength]::new(24); [void]$grid.ColumnDefinitions.Add($col); [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]::new())
            $mark = if ($topic.Reached) { [string][char]0x2713 } else { [string][char]0x25CB }
            [void]$grid.Children.Add((Label $mark 14 '#72D6AF'))
            $text = Label $topic.Name 13; [Windows.Controls.Grid]::SetColumn($text,1); [void]$grid.Children.Add($text)
            $card.Child = $grid; [void]$panel.Children.Add($card)
        }
    }
    if (-not $visible.Count) { [void]$panel.Children.Add((Label 'No topics in this filter.' 13 '#94A5B2')) }
}
function Refresh-Dashboard {
    try { Update-Dashboard; $window.FindName('Status').Text = 'Updates every 15 seconds. Start/Stop study time in the floating widget.' }
    catch { $window.FindName('Status').Text = 'Could not refresh: ' + $_.Exception.Message }
}
foreach ($box in @($subjectBox, $yearBox, $filterBox)) { $box.Add_SelectionChanged({ Refresh-Dashboard }) }
$window.FindName('Refresh').Add_Click({ Refresh-Dashboard })
Update-Dashboard
if ($Check) {
    foreach ($subject in $subjects) {
        $subjectBox.SelectedItem = $subject; Update-Dashboard
        $vault = Join-Path (Join-Path $workspaceRoot 'StudyVault') $subject
        $content = [IO.File]::ReadAllText((Join-Path $vault '00-Dashboard\Curriculum Coverage.md'))
        $totals = [regex]::Match($content, '(?m)^\|\s*Total\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|')
        $topics = @(Get-DashboardTopics $vault)
        if ($topics.Count -ne [int]$totals.Groups[1].Value -or @($topics | Where-Object Reached).Count -ne [int]$totals.Groups[2].Value) { throw "Topic totals mismatch: $subject" }
    }
    $subjectBox.SelectedItem = 'Finnish'; $yearBox.SelectedItem = $today.Year; Update-Dashboard
    $expected = ([DateTime]::new($today.Year + 1,1,1) - [DateTime]::new($today.Year,1,1)).Days
    if ($window.FindName('Heatmap').Children.Count -ne $expected) { throw 'Heatmap day count mismatch.' }
    if ($PreviewPath) {
        $window.Opacity = 0; $window.Show(); $window.UpdateLayout()
        $visual = $window.Content
        $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new([int]$visual.ActualWidth, [int]$visual.ActualHeight,96,96,[Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($visual); $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new(); $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $stream = [IO.File]::Create($PreviewPath); try { $encoder.Save($stream) } finally { $stream.Dispose() }
        $window.Close()
    }
    'Dashboard checks passed.'; exit
}
$timer = [Windows.Threading.DispatcherTimer]::new(); $timer.Interval = [TimeSpan]::FromSeconds(15); $timer.Add_Tick({ Refresh-Dashboard })
$window.Add_ContentRendered({ $timer.Start() }); $window.Add_Closed({ $timer.Stop() })
[void]$window.ShowDialog()
