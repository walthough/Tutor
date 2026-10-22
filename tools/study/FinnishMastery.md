# Finnish mastery helper

Run from the workspace in PowerShell. Node.js 22 is installed; no package install or network/API call is used.

~~~powershell
node tools/study/FinnishMastery.cjs summary
node tools/study/FinnishMastery.cjs lookup word palautua ymmärtää sujuvammin
node tools/study/FinnishMastery.cjs lookup grammar G017 G095
node tools/study/FinnishMastery.cjs review word 6
node tools/study/FinnishMastery.cjs review grammar 3
node tools/study/FinnishMastery.cjs search grammar partitive 6
node tools/study/FinnishMastery.cjs record tools/study/assessed-exercises.json
~~~

Lookup returns current scores, counts, days, tested form and latest error, not the full bank/history. Pass headwords or stable IDs. The explicit sujuvammin alias maps to sujuvasti. Other inflected forms need tutor mapping; this is not an automatic Finnish lemmatizer. Review prioritizes recent errors, due checks, then developing/new items; untested names, abbreviations and affixes are excluded by default. This is simple scheduling, not a validated spaced-repetition algorithm. Limit is 1–50, default 6.

## Recording assessed exercises

The record file may contain one object or an array. Example schema (illustration only; never submit this example as learner evidence):

~~~json
{
  "id": "finnish-YYYY-MM-DD-session-unique-exercise-01",
  "date": "2026-10-15",
  "evidence": "00-Dashboard/Portfolio/actual-assessed-record.md",
  "support": "Describe prompt, visible models and tools honestly.",
  "model_supplied": false,
  "responses": ["The learner's exact original response"],
  "results": [
    {"kind": "word", "key": "palautua", "outcome": "correct", "form": "palaudun"},
    {"kind": "grammar", "key": "G017", "outcome": "incorrect", "form": "observed construction", "error": "Specific assessed error"}
  ]
}
~~~

Write actual assessed evidence first, outside session notes. Then write UTF-8 record JSON and call record. Only an explicit learner response that has been assessed can produce a correct/incorrect result. The helper performs arithmetic, not grading. If a model was supplied for the attempt, use outcome practice (zero points). Pending/missing answers are omitted. A result requires the observed form; errors require an explanation. Each item can appear once per exercise; use separate stable IDs for genuinely separate exercises, not repetitions in a single response. For mixed correct/incorrect uses of one item in an exercise, record one incorrect result and keep both originals. Do not reward every incidental word or stack overlapping broad rules.

+1 correct and −1 incorrect are applied chronologically, clamped after each result to 0–50. Therefore score is not necessarily correct minus incorrect: an error at 0 stays 0, and a later success reaches 1. Lifetime counters preserve both. Mastered is exactly 50; a later error gives 49. Correct practice at 50 leaves score capped but increments the lifetime correct count. Days and observed forms are tracked separately; no extra day threshold is imposed.

An identical exercise-ID retry is a no-op; changed content under an existing ID is an error. Record dates chronologically per item. A lock prevents concurrent writes. All results in a batch are validated before writing. Detailed immutable events are written before the atomic state commit; replay of the same event can recover an interrupted commit without double-counting. If the grammar view fails after state commit, retry the same records or run render; never invent a new exercise ID to repair a failed write. Inspect a leftover lock before removing it; do not blindly clear a possibly live lock. To correct a mistaken assessment record, preserve the original and perform an explicitly documented correction/migration; do not overwrite historical events or quietly mint replacement practice points.

## State and views

- StudyVault/Finnish/00-Dashboard/Mastery State.json is the only canonical current-score store (words, grammar, personal extras, deduplication IDs).
- Word Bank.json is the 8,000-entry frequency catalogue, retaining original IDs/source metadata. It is not a second score store.
- Grammar Mastery.md is generated from state after recording. It displays individual N/50 meters. Rebuild with render; do not edit numbers manually.
- Mastery History contains detailed assessed events. Portfolio Markdown preserves readable original responses and feedback. Neither needs to be reread to find a score.
- Preserve any pre-points source backups in the local dashboard archive. No recognition-quiz, curriculum-coverage or timer files are modified.

## Node REPL fallback

If the shell tool is unavailable, use the Node REPL and emit only the helper result:

~~~javascript
var { createRequire } = await import('node:module');
var req = createRequire('C:/path/to/TutorSkills/tools/study/FinnishMastery.cjs');
var mastery = req('./FinnishMastery.cjs').createTracker('C:/path/to/TutorSkills/StudyVault/Finnish');
nodeRepl.write(mastery.lookup({kind:'word',keys:['palautua']}));
// mastery.summary(); mastery.review({kind:'grammar',limit:3});
// mastery.recordMany(actualAssessedExercises);
~~~

The module reads fresh state for each operation; no session-memory cache is treated as the source of truth. For optional detail use lookup({kind:'word',keys:['palautua'],details:true}). Add a personal word through add({kind:'word',name:'verified headword',part_of_speech:'noun'}), or a new grammar unit through add({kind:'grammar',name:'Specific rule',group:'Relevant family'}). The helper creates stable IDs and starts at 0/50; additions do not change curriculum coverage. The three-menu choice, timed study and assessment remain controlled by the learner and tutor respectively.

Validation: node --test tools/study/FinnishMastery.test.cjs
