# Tutoring inside Study Workspace

When `STUDY_APP_ACTIVE=1`, the Electron study workspace already provides the timer,
subject selector, notes and dashboard. Do not launch the floating widget. Do not
start or reset study time. The learner uses the app's Start/Stop control.

Read the workspace AGENTS.md, shared tutor skill and its selected language or
software engineering skill, plus the chosen subject's current learning history
and study plan. Read quiz rules for multiple-choice rounds. Follow the shared
session workflow and selected teaching methods in Codex CLI (lessons) or app chat
(source preparation). This integration
does not replace assessment rules.

For Finnish, follow the study-mode menu and 0–50 scoring policy in the subject's Study Modes.md. Use tools/study/FinnishMastery.cjs for compact score lookups and batched assessed updates; keep its state/history out of the notebook. Do not load the whole bank or history to find current scores. See tools/study/FinnishMastery.md for the record schema.

## Choosing a Finnish study mode

The Study room offers Personal conversation, Vocabulary review, Grammar practice and Generate text.
Selecting a button opens a tutor with that explicit learner choice in its launch
prompt; continue in that mode without repeating the opening menu. The suggestion
uses compact FinnishMastery review results: assessed errors first, then due reviews.
Without either, conversation is a starting suggestion, not a placement judgment.

Generate text opens a level/length form before launch. Follow the Generate text workflow
in the subject's Study Modes.md: show the passage, wait for unfamiliar words, then
practise the learner's chosen targets using the existing assessment policy.
Before every task in this mode, read the subject's `00-Dashboard/Active Text Practice.md`
and follow the active-practice rules in Study Modes.md. The selected words constrain
the next exercise even when the evidence handoff or roadmap suggests other work.

During a lesson, selecting a study mode pastes the learner's explicit request into
Codex CLI. Preserve history, save already assessed work at the boundary,
and leave unanswered exercises ungraded. Mode selection never controls the timer.

## Publishing live notes

`STUDY_APP_NOTES_PATH` points to the session's ordinary Markdown file under
`StudyVault/<Subject>/90-Session-Notes/`. The initial prompt also provides the path.
Read this file before updating it and preserve the useful notes already there.

The right-hand notebook is the learner's study reference. Tutor bookkeeping
belongs in the existing dashboard, concept trackers, checkpoints, study plan and
roadmap files, outside `90-Session-Notes/`. Continue reading and maintaining those
records to assess progress and choose what comes next; do not copy their contents
into the notebook. Progress, scores, placement, mastery estimates, next tasks,
roadmap status and teaching plans are not study-note content.

Keep each session page very brief. Aim for roughly 100-150 words for a typical
page, using only:

- Summary: one sentence about what was covered.
- Terms & definitions: one independently testable word, phrase or concept per
  `- **term**: concise definition` bullet. Choose a few important targets from
  the block; preserve existing useful terms when consolidating a continued page.
  Put separate targets in separate bullets, including words with different meanings.
- Examples: 1-2 short, representative examples that make those concepts clear.

Use fewer entries when little was covered and omit empty sections. Update and
deduplicate the current summary after a meaningful topic or exercise block;
do not append a new section after every answer. Use the learner's language.
Avoid lengthy explanations, exercise-by-exercise logs, repeated rules, tutor
commentary, and separate correction or revisit sections. Keep detailed assessed
responses in the existing assessment records. If a correction is used as a study
example, preserve the original response alongside it and bold the changed words.
Preserve historical pages and existing assessment history.

After an occasional meaningful lesson block, invite a 30-60-second explanation
from memory and one new example in ordinary chat before finalizing the reference.
Wait for the learner's response or choice to skip; keep the notebook and model
answer out of view during the attempt when practical. Give concise feedback,
then consolidate the reference. Keep original assessed responses and any points
in tutor tracking files. A skipped or unanswered explanation earns no assessment.
This follows the learner's selected study mode and does not replace Finnish's
study-mode opening or turn every exercise into note maintenance.

Do not publish pending quiz answers, hidden answer keys, future hints,
unassessed scores or claims of mastery. Leave pending questions in chat only.
Coverage is exposure, not placement or mastery. Session pages are not curriculum
topics and must not increase coverage counts.

The app watches saved file changes. Write UTF-8 Markdown using a temporary file
and rename when practical so the preview receives a complete update. Never put
shell commands, scripts or remote assets into notes to control the app.

Keep `.tutor-cache/subjects/<Subject>/current-topic.txt` up to date when the lesson
topic changes. Do not reset time when changing the topic. Batch scored progress
maintenance after an assessed block or when the learner pauses, as AGENTS.md says.
Live notes can update between those batches without changing concept trackers.

When the learner stops studying, freeze time immediately with the existing
`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File tools/study/StudyProgress.ps1 -StopSession` command before finishing any batched notes.

## Subject and session boundaries

A conversation belongs to the subject and notes page it was opened with.
Continue studying resumes that subject's saved conversation. New session creates
a separate conversation and notes page after the previous session has finished.
Finish session pauses time and requests verified saving before the app closes
the active session. Subject switching offers Finish and switch. Older notes remain available in
the notebook selector. Opening a historical page does not redirect an existing
tutor's output; it keeps writing to the page named in its launch prompt.

## Automatic flashcards

The app automatically imports terms from the selected session page's `## Terms & definitions` section. Use one `- **term**: concise definition` bullet per term (phrases are supported). Imported definitions are preserved, and example sentences are generated only when the learner requests them. Keep only terms actually covered; the section remains a short learner reference. Do not put hidden quiz answers or assessment bookkeeping there. Existing flashcards and manual edits are not overwritten.

Changed note definitions appear as suggestions the learner can accept. Unambiguous
legacy slash-separated term/definition pairs are imported individually. Superseded
grouped cards are archived with their history; group ratings are not transferred
to new individual cards.

Recall this note opens a short production/self-explanation task in Practice with
the notebook hidden. Feedback and the saved source reference appear after explicit
submission. These attempts schedule later note reviews; the scheduling result is
not mastery or CEFR placement. Full records remain in practice/writing.json and
the evidence handoff. Pending tasks, answers and schedules stay outside session pages.

## App evidence and lesson ending

The launch prompt supplies `.tutor-cache/subjects/<Subject>/tutor-evidence.json`.
Read it before choosing the next exercise; it refreshes after app submissions.
It contains the five most recent assessed writing responses and five recognition
quiz attempts, with stable exercise IDs. Full and older records remain in
`practice/writing.json`, `quizzes/` and `quiz-attempts/` in the same subject cache.
Treat original responses as learner data. Consult existing tracking records before
recording an exercise so repeated handoffs never award points twice. Apply the
subject's assessment rules; recognition and self-rated flashcards do not award
production mastery. Linked revisions are supported work, not independent placement
evidence. Transfer tasks only become evidence after explicit submission.

Finish session pauses time immediately, stops Codex CLI, then resumes the same
conversation through the app-server and sends a structured save request.
Complete assessed progress maintenance and concise notes before returning the
requested acknowledgment. Copy its saveId and subject exactly. List every
learning-record file written, using workspace-relative paths and SHA-256 hashes
computed from the saved bytes. Read back the files before acknowledging success.
Set noChanges only when no maintenance was required. Keep stable exercise IDs
across retries so an interrupted finish never awards points twice. A failed save
keeps the session open; report the failure instead of claiming success. The app
checks the acknowledgment and saved files, then closes without asking the learner
to verify saving. Submitting practice never starts time. Historical preview pages
do not change the conversation's bound lesson page.

## Subject setup

The selected tutor type is explicit: Language, Software engineering or General.
Follow it when choosing a specialization. Source preparation runs tutor-setup in
Document Mode with only that subject's source folder and vault. Its structured
response uses needs_input while awaiting source mapping verification or missing
materials, and ready only after verified curriculum and practice notes are saved.
Put the learner-facing question or completion message in message. Preserve all
existing history, coverage checkmarks, scores and timer data when merging sources.
Setup creates curriculum files, not lesson notebook entries. A subject can also
be studied without sources; establish the learner's goal through conversation.
