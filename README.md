# Tutor Skills

Double-click **StudyApp.exe** to open the study workspace. It includes the
tutoring terminal, live notes, timer and dashboard.

| Folder | Contents |
| --- | --- |
| `Sources/` | Your original learning materials |
| `StudyVault/` | Notes and learning history, organized by subject |
| `study-app/` | Electron app, dependencies and compiled files |
| `tools/study/` | Shared timer, standalone widget, dashboard and checks |
| `tools/launcher/` | Native launcher source and rebuild script |
| `docs/` | Workspace guide |
| `.agents/` | Local tutoring skills |
| `.tutor-cache/` | Saved time, activity ledgers and source extraction caches |

Keep the executable beside these folders. It launches the locally installed app;
the app dependencies remain in `study-app/`.

Optional commands from PowerShell in this folder:

```powershell
.\StudyApp.exe --widget       # Standalone floating widget
.\StudyApp.exe --dashboard    # Standalone dashboard
.\StudyApp.exe --stop-session # Freeze all study timers
```

Study time starts only when you click Start. Existing subject histories, totals
and daily activity remain in their original folders.

See the [workspace guide](docs/Workspace-Guide.md),
[app and development guide](study-app/README.md), and
[tutoring rules](AGENTS.md). Adapted from
[bevibing/tutor-skills](https://github.com/bevibing/tutor-skills) under the
included [MIT license](LICENSE).
