# Recognition quiz progress

Read when saving a graded multiple-choice round. These counters describe quiz performance, separate from production, independent application and subject-specific mastery policies.

## Existing records first

Find the learning dashboard by its proficiency table, including nested/localized filenames. A MOC is navigation, not an assessment dashboard. Preserve its path, concept filenames, totals and historical labels. Only if absent, create `Learning Dashboard.md` in the subject root and one `concepts/{area}.md` per assessed area, using stable Windows-safe slugs and vault-relative wiki-links.

Record the round's stable ID and original choices in the existing assessment/checkpoint record, outside session notes. Check for prior recording before incrementing. Save only after all four choices are explicit and grading is complete; batch at the shared workflow's boundary. Keep per-question evidence out of the compact dashboard.

## Concept tracker

For each assessed concept increment attempts, increment correct only for a correct choice, and update Last Tested. Preserve error notes and add the specific misconception/correction when wrong. The existing red/green status records the latest quiz result: green after a correct response, red after a wrong one. It is not independent mastery.

```markdown
# {Area} — Concept Tracker

| Concept | Attempts | Correct | Last Tested | Status |
|---------|----------|---------|-------------|--------|

### Error Notes
```

## Dashboard arithmetic

Recalculate from concept rows, preserving untested areas:

- Area attempts/correct are sums; wrong = attempts − correct; rate = 100 × correct / attempts.
- Badge thresholds use the unrounded rate: 🟥 [0,40), 🟨 [40,70), 🟩 [70,90), 🟦 [90,100]. Zero attempts is ⬜ unmeasured.
- Total questions = sum of attempts. Cumulative rate = total correct / total attempts, not the average of area rates.
- Unresolved/resolved counts use red/green rows. Weakest/strongest use measured areas only. Verify sums and wiki-links before claiming success.

For new dashboards use neutral accuracy labels. Retain historical labels/data without presenting an old “Mastered” badge as a validated ability judgment.

```markdown
# Learning Dashboard

> Recognition quiz accuracy; application is assessed separately.

## Proficiency by Area

| Area | Correct | Wrong | Rate | Level | Details |
|------|---------|-------|------|-------|---------|
| {Area} | 0 | 0 | - | ⬜ Unmeasured | [[concepts/{area}]] |
| **Total** | **0** | **0** | **-** | ⬜ Unmeasured | |

> 🟥 0–39% · 🟨 40–69% · 🟩 70–89% · 🟦 90–100% · ⬜ Unmeasured

## Stats

- **Total Questions**: 0
- **Cumulative Rate**: -
- **Unresolved Concepts**: 0
- **Resolved Concepts**: 0
- **Weakest Area**: -
- **Strongest Area**: -
```
