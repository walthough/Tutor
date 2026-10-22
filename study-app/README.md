# Study Workspace

A local Electron app for lessons, source material, practice and study progress.
Double-click **StudyApp.exe** in the workspace root. Close an older app window
before reopening to load a new build.

## Everyday study

The app opens directly to Study and starts Codex CLI automatically with the timer
paused. The terminal uses JetBrains Mono at size 12, matching the Git Bash settings.
Saved sessions reopen locally without starting an app-server or waiting for a model
response. New sessions prepare their context first, then begin responding inside
the visible CLI.

1. Choose a subject. **Overview** shows your last topic and next study action.
2. **Continue studying** opens Codex CLI with that subject's last conversation. **New session**
   starts a separate conversation and lesson notebook without removing history.
3. Use the native Codex CLI in Study, including its model picker and permission
   controls. It uses your installed CLI and configuration without forcing a model.
   Study sessions launch with full access and approvals set to never, as requested;
   this applies to their launch only and does not change your global configuration.
4. Use **Start** and **Stop** in the fixed timer bar to control counted time.
   Opening a subject, lesson or practice activity never starts time automatically.
5. **Notebook** shows your short lesson reference beside the CLI by default. The
   app remembers your preference. Reading an older page does not change the
   active tutor's bound notes page.
6. **Finish session** pauses time immediately, stops the CLI, saves assessed work and notes, and
   closes the active session after checking the tutor's save acknowledgment. Failed
   saving leaves the session open with **Retry saving**. Switching subjects during
   a session offers **Finish and switch**. Closing the app uses the same save flow.

Finnish study modes remain available through **Study modes**. Generate text
requires a level and word count. Mode changes send the selected request to the CLI.
Choose a mode when the CLI is ready for input. Subject-specific study and scoring
rules remain in force. No unanswered exercise is graded.

## New subjects and sources

**+ Add subject** starts guided setup: name and tutor type, optional sources, then
preparation. The app suggests Language, Software engineering or General from the
name; confirm or change it before creating the subject. Existing subjects can
change their type in Sources after finishing an active session.

**Add source files** copies PDF, TXT, Markdown, HTML and EPUB documents into
`Sources/<Subject>/`. Duplicate filenames get numbered copies; originals are kept.
**Add URL** saves an HTTP/HTTPS website link as a `.url` file. Links are retrieved
during preparation. Each subject has its own source list.

**Prepare study material** opens tutor setup in chat. Status progresses through
preparing, needs your input, and ready. Multi-source mappings require verification
in chat before the curriculum is generated. Sources must be accessible/readable;
scanned PDFs may need OCR. Errors keep the conversation and sources available.
Once ready, **Start studying** opens the ordinary tutor. **Study without sources**
lets the tutor establish your goal directly without inventing a source curriculum.
Adding sources to an existing subject must preserve its history and reached topics.

## Practice and progress

In **Practice**, choose a curriculum topic or lesson note first, then choose an
activity. The notebook page selected elsewhere stays unchanged.

- **Flashcards** uses terms from the chosen material. Recall before revealing,
  then choose Again or Remembered to schedule reviews. These self-ratings do not
  award mastery. Definitions are imported without AI; examples are generated on
  request. Manual edits and review history are preserved. Notebook words also
  have a right-click Add to flash card word bank action.
- **Writing & note review** creates a prompt from the chosen material. Feedback
  appears only after explicit submission; the original response is retained, and
  changed words in corrected text are bold. Drafts survive navigation/reopening.
  Reviewed work supports revisions and later retrieval tasks. Notes stay hidden
  during closed-note retrieval; the reference appears after submission.
- **Multiple-choice quiz** generates four independently shuffled questions with
  hidden answers until all choices are submitted. Saved quizzes and results can
  be reopened. Supporting curriculum sources are optional.

Practice results feed the tutor's evidence handoff. Subject rules determine any
subsequent progress recording; recognition and self-rated reviews do not award
production mastery or CEFR placement. **Progress** shows coverage, skill profiles,
study totals and actual timed activity by Helsinki calendar day. Undated historical
hours remain in totals without fabricated activity dates.

## Tools

**Tools** contains PowerShell, Git Bash and Open in VS Code. Closing a shell does
not close a tutor conversation. Shells use a Windows pseudoterminal. Developer
controls do not occupy the ordinary study screen.

## Storage and integration

Existing `StudyVault/<Subject>/` and `.tutor-cache/subjects/<Subject>/` records are
preserved. Conversations live under the subject cache's `chat/` folder, with
separate last-lesson/setup references and archived conversation files. Codex thread
IDs let the installed CLI resume its context. Subject settings hold the explicit
tutor type and preparation status. Back up both vaults and caches.

Old terminal sessions were not stored as structured chat transcripts. Their notes
and learning records remain available; new chat history starts with this version.

The app prepares the subject context through a local Codex app-server, then hands
the same conversation to the native CLI in a Windows pseudoterminal. Finishing
resumes that thread through the app-server to verify the saved learning records.
Source preparation retains its guided app chat.
See the [official protocol documentation](https://learn.chatgpt.com/docs/app-server).
Approvals and interactive questions appear in the app. No API key or new SDK is
required. Connection loss retains local history and pauses study time.

Finish uses a turn-specific save acknowledgment with file paths and SHA-256 hashes.
The app verifies subject boundaries and saved bytes before closing; it does not
independently verify the tutor's pedagogical judgments. Failed or interrupted
responses cannot count as successful saves. Stable exercise IDs protect assessment
records against duplicate recording on retries.

`TUTOR-INTEGRATION.md` defines the tutor contract. Notes are a short reference;
assessment bookkeeping remains outside `90-Session-Notes/`. Existing PowerShell
helpers remain the authority for timer transactions and the daily activity ledger.
The separate widget/dashboard launchers still work through `--widget`/`--dashboard`.

## Development and checks

Requires Windows 10/11, Node.js 22+, Windows PowerShell, installed dependencies and
the Codex CLI. Git Bash and VS Code are optional.

From `study-app/`:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:practice-ui
npm.cmd run test:quiz-ui
node scripts/check-chat-protocol.cjs
npm.cmd run build
```

Normal StudyApp.exe launches use the existing build. The UI tests use isolated
study roots and fake AI responses, preserving learner files. They cover setup,
chat, resumption, saving/retry, subject isolation, practice and compact layouts.
The protocol check initializes the installed Codex without creating a thread or
making an inference request. A live authenticated lesson still needs user testing.
The app-server protocol is experimental; incompatible updates report errors while
retaining local conversation history.

The native launcher is workspace-local, not a standalone installer. Rebuild it
with `tools/launcher/Build-Launcher.ps1`; `StudyApp.exe --check` verifies required
files without opening a lesson. No launcher rebuild is needed for app changes.
