# Audit — Code Attribution Tracker

Know exactly who — or which AI — wrote every line in your codebase.

Audit runs quietly in the background and automatically records every meaningful
code change: who made it (you, or which specific AI tool — Copilot, Claude Code,
Cursor, Codex, Gemini, and more), which file and lines, whether it was a routine
edit or a structural design change, and what git branch it happened on. Nothing
to turn on per-edit, nothing to remember to log — it's on the moment you install it.

- **Automatic, zero-effort logging.** No manual entries, no slash commands to
  remember. Every real edit is captured the instant it happens.
- **Names the actual AI tool**, not just "AI wrote this." Detects GitHub Copilot,
  Copilot Chat, Claude Code, Cursor, Continue, Codeium, Tabnine, Codex (OpenAI),
  and Gemini Code Assist individually via their installed extensions.
- **Filters out noise automatically.** Blank-line edits, comment-only changes, and
  test-file boilerplate don't clutter the log — only real code changes do.
- **Flags design/architecture changes** — export, signature, class, and route
  changes get a visible flag so reviewers know where to look closer.
- **Tracks the whole file lifecycle**, not just edits inside a file — creation,
  deletion, and renames are logged too.
- **Live in-editor feedback** — edited lines briefly flash color-coded by source
  (AI vs. developer vs. external paste), and a status bar counter shows today's
  AI-vs-manual split for the file you're in.
- **A real dashboard**, not just raw markdown — filter every entry ever logged by
  project, category, file, or developer, with per-project stat breakdowns. Export
  to CSV for spreadsheets or BI tools any time.
- **Self-healing log.** If any process — including an AI agent with file-write
  access — deletes or overwrites the log, Audit detects it and restores it
  automatically.
- **100% local.** No server, no account, no telemetry. Everything is plain
  markdown in your own workspace, fully git-diffable.

## New to Audit?

Install it, open any project, and start editing — that's it. On first run you'll
be asked what name to attribute your own manual edits to; after that, everything
is automatic. Run **Audit: Open Dashboard** any time to see the full picture, or
**Audit: Open Today's Log** to read the raw markdown.

## Honest about its limits

Audit is upfront about what it can and can't reliably tell: it can't identify a
specific AI model from code pasted in from a browser chat (ChatGPT web, Gemini
web) — that's logged as "external paste, source unknown" rather than guessed.
When more than one AI extension is active at once, ambiguous edits are logged as
"possibly: X / Y / Z" rather than a false single guess — you can correct these
after the fact with **Audit: Correct Last Entry Attribution**, or set a preferred
tool in settings if you only use one. Full details further down this page.

---

## Language support

Core tracking — edits, attribution, file create/delete/rename, branch tagging,
the dashboard — works on **any file, any language**, since it operates on VS Code's
document/file events rather than parsing syntax. Design-change flagging (the one
part that's language-aware) currently covers JavaScript/TypeScript, Python, Java,
C#, Kotlin, Go, Rust, PHP, and C++ — see below for details and how to extend it.

---

## What it records

For each meaningful edit, an entry is appended to `.audit/YYYY-MM-DD.md`:

```md
## 14:32:10
- File: `src/auth/login.ts`
- Project: src
- Lines: 45-52
- Mode: AI — GitHub Copilot
- Change: Code Modified (+8 / -2)
- Design-Change: true (export added/changed)
```

`Project` is the top-level folder of the file's path (e.g. `frontend`, `backend`) — written directly into every entry so it's visible reading the raw markdown, not just in the dashboard. `Language` is derived separately from the file extension (e.g. `.java` → Java, `.tsx` → TypeScript (React)) — useful when code isn't cleanly separated by folder, since it identifies what a file *is* independent of where it happens to sit. Both are filterable in the dashboard.

## Setup

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host with it loaded,
or package it with `vsce package` and install the `.vsix` normally.

On first run it will ask for the name to attribute your manual edits to.

## Commands

- `Audit: Open Today's Log`
- `Audit: Open Log Folder`
- `Audit: Toggle Tracking On/Off`
- `Audit: Set Developer Name`
- `Audit: Correct Last Entry Attribution` — fixes a wrong "possibly: X/Y/Z" guess after the fact
- `Audit: Add Today's Summary to Commit Message` — appends a one-line rollup (files touched, AI vs manual counts, design changes) to your git Source Control commit message box
- `Audit: Add Reason to Last Entry` — attach a one-line "what this was for" note to the most recent entry, for context later
- `Audit: Open Dashboard` — a filterable table view of every entry ever logged (all dates), with stats and filters by category/file/developer
- `Audit: Export Log to CSV` — dumps every parsed entry to a CSV file for spreadsheets or BI tools

## Live feedback while coding

- **Inline flash highlight** — right after a tracked edit, the affected lines briefly highlight (blue = AI, green = manual, orange = external paste), with a hover tooltip naming the source. Fades after a few seconds — this is a live cue, not a persistent blame view.
- **Status bar counter** — shows today's AI vs manual edit count for the currently open file. Click it to open the full log.

## Branch tagging

Each entry is automatically tagged with the current git branch (`audit.tagGitBranch`, default on) — since branch names are often the task/ticket name, this gives free "what was this for" context without extra effort. Turn off if you don't use feature branches.

## File create / delete / rename tracking

Not just in-file edits — new files, deleted files, and renames now get logged too, so you can see structural project changes, not just line-level ones:

```md
## 10:05:12
- File: `backend/src/main/java/com/registay/AuthController.java`
- Event: File Created
- Mode: AI — Claude Code (guessed)
```

File creation attribution is a coarser guess than in-file edits: if exactly one AI extension is active AND the new file already has real content the instant it appears, it's attributed to that tool; otherwise it's logged as the developer. Deletions and renames are always attributed to the developer, since there's no content or timing signal to guess a tool from.

## Multi-root workspaces (e.g. frontend + backend in one window)

If your workspace has more than one root folder (via "Add Folder to Workspace..."), each root gets its **own** `.audit` log, matched to whichever root the edited file actually belongs to — not just the first folder in the window. If entries for one part of your project seem to be missing, check whether that root has its own `.audit` folder rather than assuming tracking isn't working.

## Supported AI tools

Detected via installed/active extension: GitHub Copilot, GitHub Copilot Chat, Claude Code, Cursor, Continue, Codeium, Tabnine, Codex (OpenAI), Gemini Code Assist. If you use a tool not listed here, its edits will show as "Unclassified" — file an issue or add its extension ID to `KNOWN_AI_EXTENSIONS` in `attribution.ts`.

## Log integrity protection

AI agents with file-write access (Copilot's agent mode, Claude Code, etc.) can end up scanning the log file as project context and deciding to "clean up" or overwrite it — this has happened in testing. Since that kind of edit can come from a terminal command or a raw file write rather than VS Code's own file APIs, the extension can't rely on VS Code's edit events alone to catch it.

Instead, Audit watches the log folder at the filesystem level (`audit.protectLogFromExternalChanges`, default on). After every legitimate write, it remembers the file's exact contents. If anything — deletion, truncation, an agent rewriting the file — causes the file on disk to no longer contain everything it should, Audit restores it automatically and appends a `Log Integrity Restored` entry noting what happened. This works regardless of what caused the change, not just edits made through VS Code.

## How attribution works — and its honest limits

This is the part that matters most, so it's stated plainly rather than oversold:

**Reliably detected:**
- Whether an edit *looks* AI-generated (multi-line chunk appearing after a pause,
  rather than steady keystrokes) combined with which AI extensions are actually
  installed and active (Copilot, Claude Code, Cursor, Continue, Codeium, Tabnine).
- If exactly **one** AI extension is active, that chunk is attributed to it by name.
- If **multiple** AI extensions are active at once, the log honestly lists all
  candidates rather than guessing a single one.

**Not reliably detected:**
- Code pasted in from a browser tab (ChatGPT web, Gemini web, Claude web). VS Code
  has no way to know which model produced clipboard content — this is logged as
  `External paste (source tool not detectable)`, never guessed as a specific model.
  If you want ChatGPT/Gemini attribution to be accurate, you'd need to use their
  IDE extensions rather than the browser, or manually tag such pastes.
- Manual edits are attributed to whatever name is set in settings — this assumes
  one developer per machine. Multi-developer accuracy requires each person running
  their own instance with their own name configured.

## Design-change flagging

A small heuristic (`src/designChange.ts`) flags edits that touch exports, function/method
signatures, class/interface/struct/trait declarations, imports, API routes, or
framework annotations (Spring's `@RestController`, `@Entity`, etc.) — so `Design-Change: true`
lines are easy to grep out of the log separately from routine edits. Covers JavaScript/TypeScript,
Python, Java, C#, Kotlin, Go, Rust, PHP, and C++. It's pattern-based, not a real AST diff — good
enough to flag "look here," not a guarantee of completeness, and it may occasionally miss an
unusual style or (rarely) flag something routine. If your primary language isn't covered well,
add patterns to `SIGNAL_PATTERNS` in `designChange.ts`.

## Storage

Everything lives in `.audit/` inside your workspace, plain markdown, git-diffable.
Whether to commit it or `.gitignore` it is your call — some teams want it in history
for audit purposes, others treat it as personal scratch context.

## Team-wide use (the "accountability dashboard")

There's no server or shared account — the dashboard only reads whatever `.md` files
sit in your local `.audit/` folder. To get a team-wide view: **commit `.audit/`
to your git repo** instead of ignoring it. As teammates push their daily logs, pulling
those commits brings their entries into your local folder, and `Audit: Open
Dashboard` (or `Export to CSV`) then shows everyone's combined activity. This is
git-native by design — no extra infrastructure to run.

## Roadmap ideas (not built yet)

- Sidebar view to browse/filter the log without opening files.
- Batch small manual keystrokes into one entry per save instead of per edit event.
- Hook Copilot/Claude Code's own accept-suggestion commands directly (where exposed)
  for higher-confidence attribution instead of the timing heuristic.
- Per-file summary rollup (`.audit/summary.md`) showing % AI vs manual by file.
