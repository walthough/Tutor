using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Study Workspace")]
[assembly: AssemblyDescription("Desktop study workspace launcher")]
[assembly: AssemblyVersion("1.0.0.0")]
internal static class StudyApp
{
    [STAThread]
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            string mode = args.Length == 0 ? "" : args[0].ToLowerInvariant();
            if (args.Length > 1 || (mode != "" && mode != "--widget" && mode != "--dashboard" && mode != "--stop-session" && mode != "--check"))
                throw new ArgumentException("Use StudyApp.exe, or add --widget, --dashboard, --stop-session or --check.");
            string app = Path.Combine(root, "study-app");
            string electron = Path.Combine(app, "node_modules", "electron", "dist", "electron.exe");
            string scripts = Path.Combine(root, "tools", "study");
            if (mode == "" || mode == "--check")
            {
                Require(electron);
                Require(Path.Combine(app, "dist", "main.cjs"));
                Require(Path.Combine(app, "dist", "preload.cjs"));
                Require(Path.Combine(app, "dist", "index.html"));
                Require(Path.Combine(app, "dist", "renderer.js"));
                Require(Path.Combine(app, "dist", "style.css"));
                Require(Path.Combine(app, "scripts", "timer-bridge.ps1"));
                Require(Path.Combine(scripts, "StudyTimer.ps1"));
                Require(Path.Combine(scripts, "StudyData.ps1"));
            }
            if (mode == "--check")
            {
                Require(Path.Combine(scripts, "StudyProgressLauncher.ps1"));
                Require(Path.Combine(scripts, "StudyProgress.ps1"));
                Require(Path.Combine(scripts, "StudyDashboardLauncher.ps1"));
                Require(Path.Combine(scripts, "StudyDashboard.ps1"));
                return 0;
            }
            ProcessStartInfo start;
            if (mode == "")
            {
                start = new ProcessStartInfo(electron, Quote(app));
                start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            }
            else
            {
                string file = mode == "--dashboard" ? "StudyDashboardLauncher.ps1" : "StudyProgressLauncher.ps1";
                string script = Path.Combine(scripts, file);
                Require(script);
                string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
                start = new ProcessStartInfo(powershell, "-NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File " + Quote(script) + (mode == "--stop-session" ? " -StopSession" : ""));
            }
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WorkingDirectory = root;
            using (Process child = Process.Start(start))
            {
                if (mode == "--stop-session") { child.WaitForExit(); return child.ExitCode; }
            }
            return 0;
        }
        catch (Exception error)
        {
            string log = Path.Combine(root, ".tutor-cache", "launcher-startup.log");
            try { Directory.CreateDirectory(Path.GetDirectoryName(log)); File.AppendAllText(log, DateTime.Now.ToString("o") + " " + error + Environment.NewLine); } catch { }
            // --check is suitable for scripts: fail through the exit code without a modal window.
            if (Array.IndexOf(args, "--check") < 0)
                MessageBox.Show(error.Message + "\n\nSee " + log + "\nFor repairs, see study-app/README.md.", "Study Workspace could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    private static string Quote(string value) { return "\"" + value + "\""; }
    private static void Require(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("Required app file is missing: " + path + "\nRun npm.cmd ci and npm.cmd run build inside study-app if dependencies or the build are missing.", path);
    }
}
