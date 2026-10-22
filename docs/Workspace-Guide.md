# Tutor Skills for Codex

Adapted from [bevibing/tutor-skills](https://github.com/bevibing/tutor-skills), under the included MIT license. Both upstream skills and all five workflow references are included, with Codex and Windows adaptations.

## Start

For the desktop study workspace, double-click **StudyApp.exe**. It combines a
tutoring terminal, live session notes, shared timer controls and the dashboard.
See [the app guide](../study-app/README.md) for use, development and validation.

1. Open the project folder as your workspace in Codex and start a new task there. The skills are installed locally under `.agents/skills/`.
2. Put your study materials in `Sources/`, or specify a source folder or URL in your prompt.
3. Ask: `Use $tutor-setup to turn Sources into a StudyVault.`
4. After generation, ask `Use $tutor to study Finnish` or `Use $tutor to continue React`. The tutor selects the language or software engineering teaching skill. You can also invoke `$tutor-language` or `$tutor-software-engineering` directly.
5. Respond to the conversation or coding task in chat. For an explicitly selected quiz, reply with question number + letter for all four questions. The tutor assesses your actual response and batches progress updates using the subject's existing records.

If the skill selector has not refreshed, restart Codex or ask it to read `.agents/skills/tutor-setup/SKILL.md` or `.agents/skills/tutor/SKILL.md` directly. This installation is scoped to this workspace; it does not register the skills globally.

## Files and requirements

- `Sources/`: your input materials. Original learning materials, kept separate from generated notes.
- `StudyVault/`: subject folders containing notes, practice questions, navigation pages, and learning progress. React is in `StudyVault/React/`; use separate folders for other subjects.
- `.tutor-cache/`: extracted source text created during document processing.
- `.agents/skills/tutor-setup/`: document and codebase workflows and templates.
- `.agents/skills/tutor/`: shared session/progress workflow, subject routing and quiz rules.
- `.agents/skills/tutor-language/`: communication, comprehension, focused practice and fluency methods for language learning.
- `.agents/skills/tutor-software-engineering/`: worked examples, code-writing, debugging and verification methods for software engineering.

PDF text extraction uses `pdftotext`, already available on this machine through Git for Windows. Scanned PDFs may require OCR. Obsidian is optional; open a subject folder (currently `StudyVault/React`) as an Obsidian vault to navigate notes and folded answers. No Claude Code installation or separate API key is required for using these instructions in an existing Codex session.

Windows shell commands and ordinary chat questions replace Claude-specific tool names. Practice sets start at ten questions to satisfy the original recall/application/analysis proportions. Supplemental material is identified separately from verified source content. Source selection follows your request; setup asks for clarification only when needed.

Installation documentation: [OpenAI local skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).

The study widget has a subject selector for folders under `StudyVault/` with a `00-Dashboard/Curriculum Coverage.md` file. Each subject keeps its own timer and current lesson in `.tutor-cache/subjects/<Subject>/`. Switching subjects pauses time; Start resumes it, and Reset preserves accumulated hours. The selected subject persists in `.tutor-cache/active-subject.txt`. Legacy study time is migrated to React once. `tools/study/study-progress.sh` displays the selected subject’s coverage.

Launch the widget with `StudyApp.exe --widget`. Repeated launches bring the existing window forward. Startup exceptions are recorded in `.tutor-cache/widget-startup.log` and displayed in a message box.

Run `StudyApp.exe --dashboard` or the widget's **Dashboard** button for a local dashboard with a subject selector, topic filters, study totals and a yearly activity heatmap. Hover over a day for its date and minutes. It refreshes every 15 seconds and never starts the study timer. Only the widget's Start/Stop button controls study time.

Daily activity is saved separately per subject in `.tutor-cache/subjects/<Subject>/study-activity.json`, using Helsinki calendar days. Recoverable timed intervals are imported once; older accumulated time without dates remains in totals. Blank past cells mean no recorded time, not proof that you did not study. Future activity is recorded on Stop/reset/subject changes and every 30 seconds while the updated widget is open. Closing the dashboard does not stop or start the widget timer.

Local checks: `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File tools/study/StudyData.Tests.ps1`, `tools/study/StudyDashboard.ps1 -Check`, and `tools/study/StudyProgress.ps1 -Check`. Dashboard startup failures are logged to `.tutor-cache/dashboard-startup.log` and displayed in a message box.

Widget duplicate protection is scoped to the workspace and Windows desktop, so an agent’s sandbox instance cannot block the interactive desktop.
