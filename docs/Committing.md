# What to commit

Commit `.agents/skills/`, `study-app/` source, scripts, tests and configuration
(including `package.json` and `package-lock.json`), `tools/`, `docs/`,
`README.md`, `LICENSE` and `.gitignore`. Git ignores generated app files.

Keep `Sources/`, `StudyVault/`, `.tutor-cache/` and `AGENTS.md` local.
These contain your materials, notes, assessments, mastery scores, study time
and personal tutoring instructions. They stay in their current locations so
the app continues to work. Local environment files are also ignored.

`StudyApp.exe` is generated and ignored; rebuild it using
`tools/launcher/Build-Launcher.ps1`. See `study-app/README.md` for app setup.
A fresh checkout does not include your vaults, materials or personal instructions.

Before committing, inspect `git status --short` and `git diff --cached`.
Do not force-add ignored personal files. Ignore rules do not remove files
from an existing Git index or from previous commits.
