---
name: ai-tooling-guide
description: Decision rules for choosing between plain documentation, an MCP server, a Skill, a Subagent, a Fork, a Hook, or a Dynamic workflow when building AI-assisted dev tooling, writing a CLAUDE.md or SKILL.md, or structuring a Claude Code task. Also covers prompting principles and document/context hierarchy rules.
---

# AI Tooling & Prompting Guide

A prescriptive companion to the research logs (`tech-research-log.md`, `ai-concepts-log.md`, `concepts/*.md`). Those explain _what things are and why_; this is _what to do_ — the decision rules for picking a tool, where each one lives, and how it's invoked. Written to be read by both a human and an LLM (it will eventually become the body of a personal Skill).

Where a point is a synthesis or an imported opinion rather than something Anthropic states directly, it's marked **(opinion)**.

---

## 1. Prompting principles

- **Explain _why_ a rule exists, not just the rule itself** — the model generalizes from the reason, not the instruction alone.
- **3–5 diverse examples beat a long list of edge cases** crammed into a prompt.
- **Long reference material goes at the top, the actual question at the bottom** — matters mainly past ~20k tokens; not worth restructuring short prompts over.
- **Drop "CRITICAL: you MUST use this tool."** On current models this causes overtriggering. Plain "use this tool when…" is correct — prompts tuned to fight an older model's laziness need to be dialed back, not kept as insurance.
- **Manual chain-of-thought is largely unnecessary.** Thinking is adaptive and on by default on current models.
- **Politeness has no reliable, evidence-backed effect either direction.** Not worth optimizing for or against.

---

## 2. The core distinction — four different problems, not one ladder

| Mechanism           | Problem it solves                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **MCP**             | New _capability_ — reaching a live external system Claude can't otherwise touch                                             |
| **Skill**           | Packaged _knowledge/procedure_ — what to do, reused                                                                         |
| **Subagent / Fork** | _Isolation_ — keeping context clean, or enforcing a restriction                                                             |
| **Hook**            | _Enforcement_ — guaranteed action regardless of what the model decides (cross-cutting, not a competitor to the other three) |

**Documentation vs. nothing is a separate axis again** — whether a fact needs to exist as text at all, independent of which mechanism (if any) surfaces it.

---

## 3. Tool decision tree

Work through in order; stop at the first "yes" that applies.

1. **Does the task need to touch something outside Claude's own reasoning** (a live DB, API, browser, filesystem, calendar)?
    - No → skip to step 2.
    - Yes → check existing registries/directories before building anything. Only build a new MCP server if it'll be reused across projects/clients — that's the actual payoff of the client/server split.

2. **Does the shape actually recur, or is this a one-off?**
    - One-off → do nothing. No file, no skill, no subagent.
    - Recurs, or you've caught yourself re-explaining it → continue.

3. **Is it a fact Claude can't infer, or an active multi-step procedure?**
    - A fact/convention → **plain documentation** (CLAUDE.md line, or a linked reference file). No skill — skills exist to be _triggered_; a static fact doesn't need triggering logic.
    - A procedure, especially one benefiting from bundled scripts/reference material → candidate for a **Skill**, but only build it once repetition is confirmed (2+ times).

4. **Does it also need isolation?** (Ask regardless of step 3's outcome — isolation is a separate, layered need.)
    - Byproducts would flood context, no structural restriction needed → **Fork**.
    - Needs something _enforced_ (can't-edit, must-use-a-specific-model, an MCP's tool descriptions/output kept fully out of the main session) → **Subagent**. A Fork can't do any of these — it inherits the parent by definition. If it's running a recurring procedure, point the subagent at the Skill via `skills:` rather than duplicating instructions in its prompt.
    - Needs back-and-forth, shares evolving context with the main conversation, or you need to watch it reason live → stay in the main thread. Subagents currently can't run in plan/thinking mode and give no live intermediate output — a real limitation, not just a design choice, on top of the "cold start" cost of isolating.

5. **Does a specific action need to happen deterministically, regardless of whether Claude remembers or decides to** (formatting after every edit, blocking a genuinely destructive command, an audit log, a notification)?
    - Yes → **Hook**. Never put a guaranteed-enforcement rule in CLAUDE.md or a Skill's instructions — both are text the model reads and _could_ skip.
    - This is cross-cutting: a hook can gate an MCP tool call, enforce a subagent's tool restriction at the argument level (not just its coarse allow/deny list), or scope itself to a single Skill's or Subagent's frontmatter.

6. **Does the task need many independent reads/audits cross-verified against each other** (not brainstorming, not implementation)?
    - Yes → **Dynamic workflow**. Never for implementation — parallel agents make conflicting implicit decisions (the Flappy-Bird problem). Fine for fan-out audits: many independent reads, small conclusion each.

---

## 4. Storage & invocation reference

All paths below are Claude Code–specific unless noted.

### Documentation

- **Storage**: `CLAUDE.md` at repo root (nested per-package loads when Claude touches that subtree); plain reference files anywhere, pulled in only via a markdown link.
- **Invocation**: CLAUDE.md always loads; a linked file loads only when Claude follows the link via the Read tool.

### MCP

- **Storage**: Claude Desktop → `claude_desktop_config.json`, `mcpServers` key, requires a full app restart to reload. Claude Code → `claude mcp add <name> --scope local|project|user -- <command>` (`local` is the default).
- **Not personal-only**: `--scope project` writes to a `.mcp.json` at the repo root, committed like any config file — everyone who clones the repo gets that server (each person still supplies their own secrets via `${API_KEY}`-style env var expansion). Use this for a client-specific server; keep cross-project tools like Context7/Playwright at `--scope user`. `local` (the actual default, not `user`) is private to you and tied to just the current project. Precedence when names collide: local > project > user.
- **Invocation**: automatic — Claude calls its tools when relevant, no invocation by name. `/mcp` (session) or `claude mcp list` (shell) shows what's connected.

### Skill

- **Storage**: personal `~/.claude/skills/<name>/SKILL.md` (all projects) · project `.claude/skills/<name>/SKILL.md` (this project, loads from the start directory up to repo root) · plugin `<plugin>/skills/<name>/SKILL.md`.
- **Invocation**: automatic based on the `description` field, or explicit `/skill-name` (slash commands and skills were merged — an old `.claude/commands/*.md` file behaves the same way). `/skills` lists everything available.

### Subagent

- **Storage**: project `.claude/agents/` (highest priority) · personal `~/.claude/agents/` (all projects, lower priority) · plugin `agents/` directory · `--agents` CLI flag with raw JSON for a throwaway session-only definition.
- **Invocation**: automatic based on description, explicit "Use the `<name>` agent to…", or `@name` to bypass routing. `/agents` manages them; `claude --agent <name>` sets a session default.
- **Default gotcha**: omitting the `tools:` field grants the subagent **all** available tools, MCP included. Always set it explicitly.

### Fork (`/subtask`)

- **Storage**: none — an operation, not a saved artifact.
- **Invocation**: `/subtask`, or asking in plain language. Inherits the parent's tools/model/permissions entirely — zero setup, but zero restriction capability.

### Dynamic workflow

- **Storage**: none by default; `/workflows` can save a completed run as a reusable `/<name>` command, at which point it behaves like a custom command.
- **Invocation**: the `ultracode:` keyword, natural language ("run this as a workflow"), or `/deep-research`. Requires **Dynamic workflows** enabled in `/config` (off by default on Pro). `/workflows` monitors live token spend.

### Hook

- **Storage**: `~/.claude/settings.json` (personal, all projects) · `.claude/settings.json` (project, commit this) · `.claude/settings.local.json` (project, gitignored) · managed policy settings (org-wide, admin) · plugin `hooks/hooks.json` · Skill or Subagent frontmatter (narrowest — active only during that skill/agent's run).
- **Invocation**: never by name — purely declarative. Fires automatically when its lifecycle event (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`, and ~28 others) occurs and its `matcher`/`if` conditions match.

**Pattern worth noticing**: Skill and Subagent share an identical two-tier storage shape (`.claude/<type>/` project vs `~/.claude/<type>/` personal). Fork and Dynamic workflow are the odd ones out — they're _operations_, not _definitions_, so there's nothing to store unless a workflow gets promoted into a saved command.

---

## 5. Document & context hierarchy rules

- **`@path/to/file` in CLAUDE.md is an import, not a link** — expanded and loaded at launch, recursing up to four hops deep. It looks like a lazy hierarchy on paper but is eager loading in practice. A plain markdown link is inert text the agent reads later, on demand, via the Read tool. If context fills before the first prompt is even sent, an `@import` chain (or CLAUDE.md stacking up a directory tree) is the prime suspect.
- **A Skill's SKILL.md stays under ~500 lines and is self-contained** — no cross-skill dependencies. Overflow goes into a `references/` file, pulled in via an explicit "Read `references/x.md`" instruction — never an `@import` (that syntax doesn't resolve inside a SKILL.md at all).
- **Subagents spawned from a Skill start with blank context** — they don't inherit the conversation. Any rule the subagent needs has to be repeated inline in its own prompt, or supplied via the Skill's `skills:` field on the subagent's frontmatter.
- **State that must survive across isolated subagent calls belongs in an external file** (a status/queue record on disk), never in assumed-shared context — subagents don't share memory with each other or the parent by design.
- **CLAUDE.md scope stays narrow by construction**: only what the repo can't tell Claude on its own — non-default tool choices, non-obvious commands, conventions that contradict framework defaults. Target under 200 lines, hand-written. Auto-generated CLAUDE.md files measurably don't improve task success and add 20%+ inference cost on average — they mostly just pre-cache what the agent would've found by reading the repo anyway.

---

## 6. Anti-patterns

- **Don't use MCP to store instructions.** That's a Skill's job; MCP's only job is reaching the external system.
- **Don't skill-ify (or subagent-ify) on first use.** Build it only once the task shape has actually recurred — the same overhead-without-payoff trap that made packaged "agent council" frameworks a bad deal (28 plugins installed before any work was saved).
- **Don't duplicate one convention across CLAUDE.md, a Skill, and a subagent prompt.** One canonical location; the others point at it. **(opinion — one practitioner's take, not Anthropic's, though it follows from the same duplication problem the "generated CLAUDE.md" finding above already shows.)**
- **Don't build a multi-agent "council" for implementation.** Parallel agents make conflicting implicit decisions (mismatched pieces that don't merge). Independent-agent _verification_ — auditing, cross-checking, dropping claims that fail — is the pattern with real support; Claude Code already has this as dynamic workflows, no custom framework needed.
- **Don't assume a subagent's tool list is restricted by default.** Omitting `tools:` grants everything, MCP included.
- **Don't rely on a symlinked personal skill folder without checking `CLAUDE_CONFIG_DIR` first.** At least one previously-reported case had skill discovery break entirely whenever `CLAUDE_CONFIG_DIR` was set explicitly — even to the literal default path — with skills resolving only when it was left unset entirely. Worth a live check before depending on the setup, not assumed fixed.

---

## 7. Maintenance checklist

- Run `/context` immediately on opening a session, before typing anything — the cheapest way to catch an always-loaded layer that's bigger than intended.
- Watch the combined subagent-description budget: Claude Code warns at 15,000 tokens across all defined subagents, whether used that session or not.
- Promote something from "log entry" to an actual Skill/Subagent/Hook only after the task shape has repeated — not on first encounter.
- Re-verify anything time-sensitive here against current docs before leaning on it hard — this guide reflects research as of September 2026; paths, flags, and defaults in a fast-moving tool like Claude Code are the most likely things to drift.

---

### Sources

Synthesized from `concepts/MCP.md`, `concepts/context-engineering-and-agent-docs.md`, `concepts/subagents-and-multi-agent-patterns.md`, `concepts/claude_concepts_hooks.md`, relevant `tech-research-log.md` entries, official Anthropic docs (code.claude.com/docs), and one external practitioner source (PubNub blog on Claude Code subagents) — the latter flagged inline wherever its content is opinion rather than corroborated mechanics.
