---
name: tutor
description: Teach, resume lessons, quiz, or review learning progress in an existing StudyVault. Routes language learning and software engineering to their focused tutor skills while sharing session and assessment handling.
---
# Tutor

Keep one session and one learning history per subject. `$tutor` remains the app's entry point; the two focused skills can also be invoked directly.

## Choose the teaching skill

- Language learning: read [tutor-language](../tutor-language/SKILL.md).
- Software engineering, including React: read [tutor-software-engineering](../tutor-software-engineering/SKILL.md).
- Other subjects: use the shared workflow below, adapting practice to the learner's goal.

When entering through a focused skill, read the shared workflow below without repeating this dispatch. Read only the selected domain skill. Determine the subject from the request, app launch context or existing selected subject; ask only if still ambiguous.

## Shared workflow

### 1. Resume the actual subject

Read workspace `AGENTS.md` for session startup, timer, coverage and notebook rules. In an app session, also read `study-app/TUTOR-INTEGRATION.md` and the supplied evidence handoff. Starting a real study session follows those rules; reviewing or editing these skills does not start one.

Find the chosen `StudyVault/<Subject>/` or user-supplied vault. If absent, ask for materials or offer `$tutor-setup`; do not fabricate a curriculum. Within that subject:

- Read the study plan, session modes and current checkpoint/roadmap instructions when present, then only the relevant latest assessed evidence and target material. Current resume instructions take precedence over older historical next steps.
- Preserve existing dashboard, tracker paths, totals and original responses. Exclude `00-Dashboard/`, `concepts/` and `90-Session-Notes/` from curriculum discovery; session pages are references, not new topics.
- Separate the learner's explanation language from the language being studied. Preserve existing file languages and paths; use target-language practice at a manageable level.

Proceed when the subject, current target and applicable subject rules are known. The subject's current mode/scoring rules govern; shared quiz counters never replace them.

### 2. Select the next activity

Honor an activity already requested. Otherwise follow the subject's opening choices; if none exist, offer a next lesson based on the checkpoint, a review of demonstrated gaps, or a diagnostic when evidence is absent. Wait for a choice. A progress-only request returns the requested summary without starting exercises.

Finnish uses `StudyVault/Finnish/00-Dashboard/Study Modes.md` and `Study Plan.md`, including its exact three-choice opening and existing scoring helper. React uses its current `Lesson Checkpoint.md` and `Learning Roadmap.md`, including small code-writing exercises and automatic continuation after success during an active lesson.

### 3. Teach, attempt, assess

Choose one observable target, such as rescheduling an appointment or updating an array item without mutation. Use the selected domain skill to decide how much explanation or modeling is needed. Present a manageable task, then wait for an explicit learner response.

Distinguish evidence before assessing:

- **Supported practice:** models, task-specific hints, partial solutions or feedback guide the answer. Give useful help, and record the support used. General reference/documentation use can be an allowed condition of a realistic task; state it explicitly.
- **Independent check:** state the task and permitted resources before the attempt; keep its answer/model hidden. If help is requested, provide it and treat the attempt as supported, then offer a fresh check later. Independence is reported from observed/declared conditions, not assumed to be externally verified.
- **Recognition quiz:** follow [quiz-rules.md](references/quiz-rules.md) only for multiple-choice rounds. Exactly four questions and A-D options remain supported. Open-ended tasks and conversation have no four-question constraint.

Assess only the response actually submitted. Missing, skipped or ambiguous answers are not failures. Give concise feedback against the target, separate what worked from the relevant correction, and have the learner apply it in a fresh context. A copied model or immediate correction is supported practice, not new independent evidence.

Continue according to the selected mode and learner preferences. Introduce later retrieval of important targets in new contexts; use an existing review queue when available and adapt to observed difficulty rather than imposing one universal schedule. A single success, quiz accuracy, coverage or self-rating cannot establish broad mastery or CEFR placement.

### 4. Save at a useful boundary

Return feedback promptly. Batch assessed updates after a block or on pause/stop using existing subject tools and records. Stop time immediately when asked, before file maintenance, following `AGENTS.md`.

Keep stable exercise IDs, target, date, original response, task type, support conditions, assessment and useful next review in the existing assessment records outside session notes. Preserve existing schemas; add this context to their evidence/checkpoint sections rather than introducing a parallel score system. Check IDs before importing app evidence or retrying a save; identical exercises must not award points twice. If persistence fails, report it and retain the unsaved evidence for retry without claiming it was saved.

For scored multiple-choice rounds, read [quiz-progress.md](references/quiz-progress.md) and update the existing concept tracker and dashboard together. Keep code-writing, language production and recognition evidence distinct. Use the Finnish helper for its production meters, following the subject's current policy.

Notebook updates remain concise learner references; assessed responses, scores, next steps and plans belong in tracking files. Record coverage only when a curriculum topic is first reached. Finish a block with its assessed outcome and exact resume point; pending tasks remain unassessed.
