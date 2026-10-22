# Quiz Design Rules

Read for multiple-choice quiz rounds only. Conversation, code-writing and other production tasks follow the selected teaching skill. Hints are appropriate in supported practice; if help reveals a quiz answer, mark that item as supported and use a fresh item for an independent check. This round is recognition evidence, not production mastery.
## Zero-Hint Policy (CRITICAL)

Every question must be answerable ONLY by someone who actually knows the material.

1. **Option descriptions**: NEVER reveal correctness
   - BAD: `label: "stderr"`, `description: "Error output stream used by Cloud Run for error classification"`
   - GOOD: `label: "stderr"`, `description: "Standard error stream"`

2. **No "(Recommended)" tag** on any option

3. **Shuffle independently** for each question. Repeated correct letters are valid; do not cycle a fixed pattern or assign letters by question number. Keep the resulting key until grading.
4. **Question phrasing**: Ask about behavior/purpose/output, don't hint at the answer
   - BAD: "Which error stream does error() use?"
   - GOOD: "Where does error() method output go?"

5. **Plausible distractors**: Wrong options must be real concepts from the domain, representing common misconceptions
## Question Types

1. **Factual recall**: "What HTTP status code is returned when...?"
2. **Conceptual understanding**: "Why does the system use X pattern?"
3. **Behavioral prediction**: "What happens when X fails?"
4. **Comparison/distinction**: "What is the difference between X and Y?"
5. **Debugging scenario**: "Given this error, what is the most likely cause?"

## Difficulty Balancing

- Diagnostic: easy 40%, medium 40%, hard 20%
- Weak-area drill: medium 30%, hard 70%
- Review: all levels evenly
## Drilling Unresolved Concepts

When targeting 🔴 concepts from concept files:
- Do NOT repeat the exact same question — rephrase in a new context
- Test the same underlying knowledge from a different angle
- E.g., if user confused "400 vs 422", ask a scenario question where they must choose the correct status code for a new situation

## Chat Quiz Format

- Exactly 4 numbered questions per round, 4 options A-D each, one correct choice.
- Present all questions in chat; ask for question number + letter, then wait for explicit answers. Any reply-format example must not reproduce the actual answer key.
- Never reveal the answer key before the user answers. Do not use preselected UI options as responses.
- Validate all choices before grading; request missing or invalid choices without counting them as attempts.
- For four-question diagnostic rounds, use 2 easy, 1 medium, 1 hard; for drills, 1 medium and 3 hard. Approximate other percentages over multiple rounds.
## File Update Protocol

After grading:
Follow [quiz-progress.md](quiz-progress.md) and the shared tutor workflow for batched, duplicate-safe concept/dashboard updates. Preserve original choices and any help given; supported answers are not independent evidence.

## Language Rule

Use the learner's explanation language for instructions and feedback; use the language being studied when the task calls for it. Preserve existing file languages and names. Badge emojis are universal.
