---
name: tutor-setup
description: >
  Transforms knowledge sources into an Obsidian StudyVault. Two modes:
  (1) Document Mode — PDF/text/web sources → study notes with practice questions.
  (2) Codebase Mode — source code project → onboarding vault for new developers.
  Use when asked to build study notes or a StudyVault from supplied learning materials
  or a source code project. Mode is auto-detected from project markers.
---

# Tutor Setup — Knowledge to Obsidian StudyVault
## Codex tools

Use the available file and shell tools; prefer `rg --files` for discovery and `rg` for text search. Use the web tool for URLs. Use PowerShell on Windows. Read the linked references relative to this skill directory, even when the materials are elsewhere within the workspace.

## CWD Boundary Rule (ALL MODES)

> Keep source discovery, extraction, and vault output within the selected project workspace (CWD and its subdirectories). Skill instructions and bundled references are separate resources and may be read from their installed location. Honor explicit user-provided paths when permissions allow; ask for a usable path only when access is actually blocked.
> Honor a supplied source folder or URL instead of scanning unrelated workspace contents. Default document inputs in this study workspace are under `Sources/`; default output is `StudyVault/` at the workspace root. If no materials are available, ask for a source and stop without inventing a vault.
## Mode Detection

On invocation, detect mode automatically:
1. **Check for project markers** in CWD:
   - `package.json`, `pom.xml`, `build.gradle`, `Cargo.toml`, `go.mod`, `Makefile`,
     `*.sln`, `pyproject.toml`, `setup.py`, `Gemfile`
2. **If any marker found** → **Codebase Mode**
3. **If no marker found** → **Document Mode**
4. **Tie-break**: If `.git/` is the sole indicator and no source code files (`*.ts`, `*.py`, `*.java`, `*.go`, `*.rs`, etc.) exist, default to Document Mode.
5. Announce detected mode and proceed when intent is clear. Clarify only when the choice affects the requested result.

---
## Document Mode

> Transforms knowledge sources (PDF, text, web, epub) into study notes.
> Templates: [templates.md](references/templates.md)
### Phase D1: Source Discovery & Extraction
1. **Discover sources** under the user-specified folder or `Sources/` if present; otherwise scan CWD for PDF, TXT, MD, HTML, and EPUB. Exclude `node_modules/`, `.git/`, `.agents/`, `.codex/`, `.tutor-cache/`, `dist/`, `build/`, and `StudyVault/`, plus this workspace's README, AGENTS, and license. Present the selected sources and proceed unless scope is ambiguous.
2. **Extract text**:
   - PDF: prefer installed `pdftotext` with `-layout -enc UTF-8`. Write one separate text file per PDF into `.tutor-cache/` within the workspace, retaining form-feed page boundaries for source mapping.
     On Windows, resolve it with `Get-Command pdftotext`; this machine has a Git-bundled executable. Example:
     ```powershell
     New-Item -ItemType Directory -Path '.tutor-cache' -Force | Out-Null
     pdftotext -layout -enc UTF-8 'Sources/source.pdf' '.tutor-cache/source.txt'
     ```
   - If the CLI is missing, use an available PDF text extractor. If extracted text is empty or unusable, the source may be scanned: use available OCR or explain the missing capability. Never infer content from a filename or claim empty extraction succeeded.
   - URLs: retrieve with the available web tool.
   - Markdown/TXT: read directly. HTML/EPUB: extract readable content in document/spine order with available tools; preserve heading and source identifiers.
3. **Read the extracted text** to establish scope, structure, and depth. Use page images only when diagrams, tables, or OCR require them.
4. **Source Content Mapping (MANDATORY for multi-file sources)**:
   - Read **cover page + TOC + 3+ sample pages from middle/end** for EVERY source file
   - **NEVER assume content from filename** — file numbering often ≠ chapter numbering
   - Build verified mapping: `{ source_file → actual_topics → page_ranges }`
   - Flag non-academic files and missing sources
   - Present mapping to user for verification before proceeding
### Phase D2: Content Analysis

1. Identify topic hierarchy — sections, chapters, domain divisions.
2. Separate concept content vs practice questions.
3. Map dependencies between topics.
4. Identify key patterns — comparisons, decision trees, formulas.
5. **Full topic checklist (MANDATORY)** — every topic/subtopic listed. Drives all subsequent phases.

> **Coverage rule**: Cover every source topic at a depth appropriate to the user's goal. Label supplemental knowledge separately from verified source content; verify uncertain or time-sensitive additions.
6. **Classification completeness**: When source enumerates categories ("3 types of X"), every member gets a dedicated note. Scan for: "types of", "N가지", "categories", "there are N".
7. **Source-to-note cross-verification (MANDATORY)**: Record which source file(s) and page range(s) cover each topic. Flag untraceable topics as "source not available".
### Phase D3: Tag Standard

Define tag vocabulary before creating notes:
- **Format**: English, lowercase, kebab-case (e.g., `#data-hazard`)
- **Hierarchy**: top-level → domain → detail → technique → note-type
- **Registry**: Only registered tags allowed. Detail tags co-attach parent domain tag.

### Phase D4: Vault Structure

Create `StudyVault/` with numbered folders per [templates.md](references/templates.md). Group 3-5 related concepts per file.
### Phase D5: Dashboard Creation

Create `00-Dashboard/`: MOC, Quick Reference, Exam Traps. See [templates.md](references/templates.md).

- **MOC**: Topic Map + Practice Notes + Study Tools + Tag Index (with rules) + Weak Areas (with links) + Non-core Topic Policy
- **Quick Reference**: every heading includes `→ [[Concept Note]]` link; all key formulas
- **Exam Traps**: per-topic trap points in fold callouts, linked to concept notes
### Phase D6: Concept Notes

Per [templates.md](references/templates.md). Key rules:
- YAML frontmatter: `source_pdf`, `part`, `keywords` (MANDATORY)
- **source_pdf MUST match verified Phase D1 mapping** — never guess from filename
- If unavailable: `source_pdf: "source not available" (localize if appropriate)`
- `[[wiki-links]]`, callouts (`[!tip]`, `[!important]`, `[!warning]`), comparison tables > prose
- ASCII diagrams for processes/flows/sequences
- **Simplification-with-exceptions**: general statements must note edge cases
### Phase D7: Practice Questions

Per [templates.md](references/templates.md). Key rules:
- Every topic folder MUST have a practice file (10+ questions (6 recall, 2 application, 2 analysis for a 10-question set))
- **Active recall**: answers use `> [!answer]- 정답 보기` fold callout
- Patterns use `> [!hint]-` / `> [!summary]-` fold callouts
- **Question type diversity**: ≥60% recall, ≥20% application, ≥2 analysis per file (requires at least 10 total)
- `## Related Concepts` with `[[wiki-links]]`
### Phase D8: Interlinking

1. `## Related Notes` on every concept note
2. MOC links to every concept + practice note
3. Cross-link concept ↔ practice; siblings reference each other
4. Quick Reference sections → `[[Concept Note]]` links
5. Weak Areas → relevant note + Exam Traps; Exam Traps → concept notes

### Phase D9: Self-Review (MANDATORY)

Verify against [quality-checklist.md](references/quality-checklist.md) **Document Mode** section. Fix and re-verify until all checks pass.

---
## Codebase Mode

> Generates a new-developer onboarding StudyVault from a source code project.
> Full workflow: [codebase-workflow.md](references/codebase-workflow.md)
> Templates: [codebase-templates.md](references/codebase-templates.md)
### Phase Summary
| Phase | Name | Key Action |
|-------|------|------------|
| C1 | Project Exploration | Scan files, detect tech stack, read entry points, map directory layout |
| C2 | Architecture Analysis | Identify patterns, trace request flow, map module boundaries and data flow |
| C3 | Tag Standard | Define `#arch-*`, `#module-*`, `#pattern-*`, `#api-*` tag registry |
| C4 | Vault Structure | Create `StudyVault/` with Dashboard, Architecture, per-module, DevOps, Exercises folders |
| C5 | Dashboard | MOC (Module Map + API Surface + Getting Started + Onboarding Path) + Quick Reference |
| C6 | Module Notes | Per-module notes: Purpose, Key Files, Public Interface, Internal Flow, Dependencies |
| C7 | Onboarding Exercises | Code reading, configuration, debugging, extension exercises (5+ per major module) |
| C8 | Interlinking | Cross-link modules, architecture ↔ implementations, exercises ↔ modules |
| C9 | Self-Review | Verify against [quality-checklist.md](references/quality-checklist.md) **Codebase Mode** section |
See [codebase-workflow.md](references/codebase-workflow.md) for detailed per-phase instructions.

---
## Language

- Match source material language (Korean → Korean notes, etc.)
- **Tags/keywords**: ALWAYS English
