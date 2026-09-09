# Subagents & Multi-Agent Patterns

### The one-line mental model

A subagent is a separate Claude instance with its own context window, tools, permissions, and model. The parent delegates, the subagent does the noisy work in isolation, and only a summary comes back. The problem it solves: byproducts (40 file reads, a full test log) flooding your main context, not "more intelligence."

### The decision rule

Delegate when the byproducts are large and the conclusion is small. Stay in the main conversation when the task needs back-and-forth, several phases share the same evolving context, it's a quick targeted change, or latency matters — a fresh subagent starts cold and re-gathers context you already have.

### You already have three, unconfigured

Claude Code ships Explore (read-only search/analysis), Plan (research during plan mode), and general-purpose (exploration + modification), and delegates to them automatically. Zero setup. Note: as of v2.1.198, Explore inherits the main conversation's model instead of always running on Haiku (capped at Opus on the API) — costs more than it used to if your session runs Opus. Fix: define a custom `Explore` with `model: haiku` to override the built-in.

### When a custom one earns its place (the function analogy)

Same logic as "if you reuse code, make a function" — but the trigger is *repetition*, not first use:
- You keep re-explaining the same task shape to Claude
- You need an enforced tool boundary (a reviewer that structurally cannot call Edit — enforced by omission from `tools`, not by hoping the prompt is obeyed)
- You want an MCP server's tool descriptions and output kept out of your main context permanently (see below)

**Cost side, don't skip this:** every subagent's `description` sits in context on every turn, whether used or not. Claude Code warns at 15,000 combined tokens across all subagents. A library of rarely-used definitions is a standing tax. Vague/overlapping descriptions actively hurt routing — Claude picks by reading descriptions, so two similar ones route worse than zero.

### How to define one

Markdown file, YAML frontmatter, `.claude/agents/` (project, versioned) or `~/.claude/agents/` (personal, all projects). Only `name` and `description` required; body = system prompt.

Fields that mattered most in practice:

- **`tools` / `disallowedTools`** — allowlist or denylist. This is the actual enforcement mechanism, not a suggestion in the prompt.
- **`mcpServers`** — scope an MCP server to just this subagent. Defined inline, it connects only when the subagent runs and never shows up in the main conversation's tool list — keeps both the server's tool descriptions and its (often verbose) output out of your main context entirely. Concrete use: give Playwright or Context7 to one subagent instead of the whole session.
- **`memory: project`** — persistent directory (`.claude/agent-memory/<name>/`) that survives across sessions, loaded into the subagent's system prompt via `MEMORY.md`. This is what makes a reviewer accumulate real project conventions over time instead of relearning cold each session. `project` scope is shareable via version control.
- **`model`** — per-subagent model override, useful for routing cheap/high-volume tasks to Haiku.

### Skills vs. subagents — not competing, different axes

- **Skill** = reusable instructions/knowledge (what to do). Loads into whatever invoked it — by default, the main conversation.
- **Subagent** = isolation (context window, tools, permissions, model). The mechanism, not the content.

Function analogy refined: a skill is the function body; a subagent is running that function in its own process with its own permissions. Two documented directions, literal inverses of the same mechanism:

- Skill → subagent: set `context: fork` in the skill's own definition — it always runs forked, automatically, no need to ask each time.
- Subagent → skill: `skills:` field in subagent frontmatter preloads full skill content at startup (not just the description).

Rule of thumb: reusable *knowledge* → skill. Need it *isolated* → subagent. Need both without duplicating conventions across multiple subagent prompts → subagent with `skills:` pointing at one shared skill file.

### Forks — the cheap middle ground

A fork (`/subtask`, or `/fork` on older versions/config) inherits the *entire* conversation — same system prompt, tools, model, permission mode — instead of starting fresh. Its tool calls stay out of your context; only the result returns. Because system prompt and tools match the parent exactly, it reuses the parent's prompt cache, making it cheaper than a fresh subagent for tasks needing the same context.

**The ceiling this creates:** a fork can never have a tool restriction, a different model, or a stricter permission mode — it always inherits everything from the parent, by definition. "Spawn a fork and run this skill" isolates context growth, not capability. If you need "read-only, cannot Edit," that requires an actual subagent — a fork structurally can't enforce it.

### Councils — the pattern that looked adjacent but isn't (see separate log entry)

Multiple role-based agents answering the same question independently. Evidence is split (debate sometimes beats self-consistency, sometimes underperforms it; 90-101x token cost in benchmarked setups) and the packaged frameworks fail the overhead test. Full writeup filed separately in tech-research-log.md. One-line takeaway: implementation → never (conflicting parallel writes); verification/cross-checking → yes, and Claude Code already has this built as dynamic workflows, not as a "council" product.

### Dynamic workflows — the closest official thing to a council

A JavaScript script Claude writes that orchestrates many subagents at once (`agent()`, `pipeline()`, `parallel()`), runtime-executed in the background. Moves the plan into code so intermediate results live in script variables instead of your context — and lets a script apply adversarial review or multi-angle drafting as a repeatable pattern. Triggered via `ultracode:` keyword in a prompt (or asking in your own words), or by the bundled `/deep-research` command. Requires Dynamic workflows turned on in `/config` (off by default on Pro).

Limits: 16 concurrent agents, 1,000 per run, no mid-run user input, `medium` size guideline default (<15 agents). `/workflows` shows live token spend and lets you stop/save a run as a reusable `/<name>` command.

### Environment note specific to this setup

VS Code's Claude Code extension bundles its own separate Claude Code install from the standalone CLI — different versions, updated independently. Confirmed gaps at time of writing: `/workflows` (the monitoring view) doesn't work in the extension panel; `/subtask` and `/deep-research` as slash commands didn't register there either, though the underlying features (`ultracode:` keyword, natural-language fork requests) are documented to work in IDE extension panels generally — likely a version-lag or parity bug in this specific extension build, not an intentional restriction. Terminal CLI confirmed working at v2.1.265.

Separately: native Windows terminal (outside WSL) doesn't support pasting clipboard images into Claude Code CLI — a real, currently-open gap, not a config issue. For screenshot-heavy front-end work, this makes "just use the terminal" a bad blanket answer; the workable split is extension for anything screenshot-based, terminal only for the specific moment of kicking off or monitoring a large workflow run.
