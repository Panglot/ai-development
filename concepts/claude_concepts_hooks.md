# Claude Code Hooks

**Confidence: high** — pulled directly from the official reference (code.claude.com/docs/en/hooks, fetched today) plus corroborating secondary sources. Where a secondary source added something not in the official page, it's marked as such.

### The one-line mental model

Hooks are the **third control layer**, alongside CLAUDE.md and permissions — but the only one that's *deterministic*:

- **CLAUDE.md** → persuades (Claude reads it, might ignore it)
- **Permissions** → filters (static allow/deny rules on tool calls)
- **Hooks** → enforce-and-react (a real shell command / HTTP call / MCP call / LLM check runs, every time, no exceptions)

If something must *always* happen — formatting, blocking `rm -rf`, audit logging, injecting live context — it belongs in a hook, not a CLAUDE.md instruction.

---

## What a hook actually is (5 handler types)

A hook is not just "a shell script." There are five handler types, same mechanism, different backend:

| Type | What runs | When to use it |
|---|---|---|
| `command` | A shell command, receives JSON on stdin, replies via exit code + stdout | ~90% of use cases: formatting, linting, blocking, logging |
| `http` | POST request to a URL with the same JSON body; reply via HTTP response body | Central policy service, team-shared validation server |
| `mcp_tool` | Calls a tool on an *already-connected* MCP server | Reuse an MCP server's logic (e.g. a security-scan tool) instead of shelling out |
| `prompt` | Sends the event JSON to a fast Claude model for a single-turn yes/no evaluation | Judgment calls a regex can't make ("does this diff look like it leaks a secret?") |
| `agent` | Spawns a subagent with Read/Grep/Glob access to verify something before deciding | Checks that need to *look around* the repo first (experimental) |

---

## Where hooks plug in — the lifecycle

Every event falls into one of three cadences, plus a long tail of conditional events:

**Once per session:** `SessionStart`, `SessionEnd`, `Setup`
**Once per turn:** `UserPromptSubmit`, `Stop`, `StopFailure`
**Every tool call (the agentic loop):** `PreToolUse`, `PostToolUse` (also `PermissionRequest`, `PermissionDenied`, `PostToolUseFailure`, `PostToolBatch`)
**Conditional / structural:** everything else — subagents, compaction, worktrees, model switches, config/file changes, MCP elicitation

A source claims **33 documented events total** as of Sept 6, 2026 — consistent with what the official reference lists. You'll only ever build against ~5 of them in practice (see "the 90% set" below).

### Full event table — what fires, when, and whether it can block

| Event | Fires when | Can block (exit 2)? |
|---|---|---|
| `SessionStart` | Session begins or resumes | No |
| `Setup` | `--init-only` / `--init` / `--maintenance` in `-p` mode (CI prep) | No |
| `UserPromptSubmit` | You submit a prompt, before Claude sees it | **Yes** — blocks + erases the prompt |
| `UserPromptExpansion` | A slash command expands into a prompt | **Yes** — blocks the expansion |
| `PreToolUse` | Before any tool call executes | **Yes** — blocks the call |
| `PermissionRequest` | A tool call needs a permission decision | No (use `decision` object instead) |
| `PermissionDenied` | Auto mode denies a call | No |
| `PostToolUse` | After a tool call succeeds | No — but shows stderr to Claude |
| `PostToolUseFailure` | After a tool call fails | No — shows stderr to Claude |
| `PostToolBatch` | After a parallel batch resolves, before next model call | **Yes** — stops the loop |
| `Notification` | Claude Code sends a notification | No |
| `MessageDisplay` | While assistant text streams | No |
| `SubagentStart` / `SubagentStop` | Subagent spawned / finishes | Stop: **Yes** |
| `TaskCreated` / `TaskCompleted` | Task tool creates/completes a task | **Yes** (both) |
| `Stop` | Claude finishes responding | **Yes** — forces it to keep going |
| `StopFailure` | Turn ends on an API error | No |
| `TeammateIdle` | An agent-team teammate is about to idle | **Yes** |
| `InstructionsLoaded` | A CLAUDE.md / rules file loads | No |
| `ConfigChange` | A config file changes mid-session | **Yes** (except `policy_settings`) |
| `CwdChanged` | Working directory changes (e.g. `cd`) | No |
| `DirectoryAdded` | Dir added via `/add-dir` mid-session | No |
| `FileChanged` | A watched file changes on disk | No |
| `WorktreeCreate` / `WorktreeRemove` | Worktree created/removed | Create: **Yes** (any non-zero exit) |
| `PreCompact` / `PostCompact` | Before/after context compaction | Pre: **Yes** |
| `PreModelSwitch` / `PostModelSwitch` | Before/after a model switch | Pre: **Yes** |
| `Elicitation` / `ElicitationResult` | MCP server asks the user something | **Yes** (both) |
| `SessionEnd` | Session terminates | No |

### The 90% set (what you'll actually use)

`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`. Everything else exists for the day you need it — don't pre-build against the long tail.

---

## Where hooks are *defined* (the "plugs where" part)

This is the config-location axis — same event, different scope depending on which file declares it:

| Location | Scope | Shareable? |
|---|---|---|
| `~/.claude/settings.json` | All your projects | No — local machine only |
| `.claude/settings.json` | One project | Yes — committable to repo |
| `.claude/settings.local.json` | One project | No — gitignored |
| Managed policy settings | Org-wide | Admin-controlled |
| Plugin `hooks/hooks.json` | Active while plugin enabled | Yes — bundled with plugin |
| Skill frontmatter | Rest of session once skill invoked | Yes — in the skill file |
| Subagent frontmatter | While that subagent runs | Yes — in the agent file |

Practical implication for your case (freelance, multi-project, some solo some client work):
- **Project-scoped** (`.claude/settings.json`) is the one to commit per client repo — e.g. a Mobica-panel-specific formatter hook that a future contractor also gets.
- **User-scoped** (`~/.claude/settings.json`) is where your personal cross-project defaults go (e.g. a desktop notification on `Stop`, log-all-bash-commands).
- **Skill/subagent frontmatter** hooks are scoped tightest — only active while that skill/agent runs, then gone. Good for a reviewer subagent that structurally can't call `Edit` (enforced via `tools`, not the prompt).

All matching hooks from every level run in parallel; the same handler defined twice only runs once.

---

## How a hook resolves (the actual mechanics)

Three-stage funnel, in order:

1. **Event fires** → JSON lands on stdin (command) or as POST body (http)
2. **`matcher` field** filters by tool name (or session-start reason, subagent type, etc. — varies per event). `"*"` or omitted = fires on everything.
3. **`if` field** (optional, tool events only) filters further using permission-rule syntax against the *arguments*, not just the tool name — e.g. `"Bash(rm *)"` or `"Edit(*.ts)"`.

Worked example — block `rm -rf` specifically, not all `rm`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh"
          }
        ]
      }
    ]
  }
}
```

The script reads stdin, checks for `rm -rf`, and either prints a JSON `permissionDecision: "deny"` or exits 0 (silently defers to normal permission flow — silence ≠ approval, it just means "no opinion").

### Matching MCP tools specifically

MCP tools appear as regular tool names: `mcp__<server>__<tool>`. To match a whole server, `.*` is **required** — `mcp__memory` alone is treated as an exact string and matches nothing; you need `mcp__memory__.*`.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "mcp__.*__write.*", "hooks": [{ "type": "command", "command": "/scripts/validate-mcp-write.py" }] }
    ]
  }
}
```

This is the piece that connects directly to what you already know from the MCP writeup: a hook can gate or log *any* MCP tool call the same way it gates Bash/Edit — read tools and do tools both just show up as `tool_name` on `PreToolUse`/`PostToolUse`.

---

## Exit codes vs JSON — the control surface

Two ways to signal a decision, don't mix philosophies within one hook:

- **Exit code alone**: `0` = proceed silently, `2` = block (the *only* code that blocks on its own — exit `1` is silently non-blocking despite being the Unix convention).
- **JSON on stdout** (exit 0): finer control — `permissionDecision` (allow/deny/ask/defer), `additionalContext` (injects text into Claude's context next turn), `systemMessage` (shown to the user), `continue: false` (halts everything).

Exit 2 always wins over JSON `permissionDecision: "allow"` — a blocking exit code can't be overridden by contradictory JSON.

`additionalContext` is the mechanism worth remembering for your own use cases: it lets a `PostToolUse` hook inject live facts ("this file is generated, edit the source instead") without needing a static CLAUDE.md line. Static/never-changing rules still belong in CLAUDE.md — it's free (no script execution) and that's literally what it's for.

---

## Concrete, plug-in-ready examples (the "how it's used" part)

1. **Auto-format on save** — `PostToolUse` + matcher `Edit|Write` + command hook running `prettier --write` on the touched file. Deterministic version of "please run prettier" in CLAUDE.md.
2. **Block destructive commands** — `PreToolUse` + matcher `Bash` + `if: "Bash(rm *)"` → exit 2 if it's actually `rm -rf`.
3. **Desktop notification when Claude needs you** — `Notification` hook returning `terminalSequence` (OSC 9/777) — this is the one official mechanism for talking to the terminal from a hook, since hooks have no controlling TTY.
4. **Audit log of every shell command** — `PreToolUse` + matcher `Bash`, appends to a log file, always exits 0 (never blocks, just observes).
5. **Inject current branch/deploy target into context** — `SessionStart` or `PostToolUse` hook returning `additionalContext` with live environment facts a static file can't know.
6. **Reviewer subagent that can't edit** — not a hook itself, but hooks compose with subagent `tools`/`disallowedTools` restriction from your Subagents doc: a hook can additionally block that subagent's Bash calls to `git push` specifically.

---

## Compressed takeaway

Hooks are the deterministic layer: CLAUDE.md persuades, permissions filter, hooks *enforce and react*. Five handler types (command/http/mcp_tool/prompt/agent) attach to ~30 lifecycle events, but almost everything useful is built on five of them (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`). Where you *define* a hook (user settings / project settings / plugin / skill / subagent frontmatter) sets its scope and shareability — for freelance multi-client work, project-level `.claude/settings.json` is what you'd actually commit per repo. The matcher + optional `if` combination is what "plugs where" cashes out to mechanically: matcher picks the tool, `if` picks the specific arguments, and MCP tools slot into the exact same matcher syntax as any other tool (`mcp__server__.*`).

### Sources
- https://code.claude.com/docs/en/hooks (official reference, fetched Sept 9 2026)
- https://code.claude.com/docs/en/hooks-guide (quickstart/examples)
