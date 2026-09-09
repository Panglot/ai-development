# Tech & Product Research Log

Running log of products/technologies looked into: what they are, what they're for, and whether they're useful.

Format per entry:
- **What it is:** one line
- **Used for:** one line
- **Verdict:** useful / not useful / maybe — and why
- **Status:** exploring / shelved / adopted

---

<!-- Add new entries below this line, most recent first -->

### Agent Councils (multi-perspective agent pattern) — 2026-09-09

- **What it is:** A community pattern, not an Anthropic feature — no official product is called this. Several role-based agents (Principal Engineer, Security Engineer, QA Lead, etc.) answer the same question independently, then a synthesis step reconciles them. Origin: James Stanier's "Councils of agents" post (Oct 2025). Packaged version exists as `andrewvaughan/agent-council` (13 personas / 6 councils, Approve–Concern–Block voting), but it's ~8 stars and requires installing 28 separate plugins post-install.
- **Used for:** Getting a second (third, fourth) opinion before committing to an expensive-to-reverse decision — architecture, schema/API contract, library choice, project scoping. Not for implementation.
- **The evidence is genuinely split:** Du et al. found multi-round debate improves reasoning and reduces hallucination, with per-agent personas helping further. But Huang et al. ("LLMs Cannot Self-Correct Reasoning Yet") replicated it on full GSM8K and found debate only slightly beats self-consistency at equal agent count, and *significantly underperforms* majority-vote self-consistency at an equal number of responses — concluding debate is better understood as consistency than as critique. Later work notes debate can inject noise and overturn a correct single-agent answer. Benchmarked debate setups have cost 90–101× single-agent tokens.
- **Hard boundary — never for implementation:** Cognition's "Don't Build Multi-Agents" (Flappy Bird example: mismatched background + bird, unmergeable) — parallel agents make conflicting implicit decisions. LangChain's synthesis is the usable rule: **read actions parallelize, write actions don't.** Anthropic agrees from the other side: domains needing shared context or with many inter-agent dependencies don't benefit, and most coding tasks have fewer truly parallelizable subtasks than research.
- **Cost trap to remember:** the expense is in the *architecture*, not the idea. Four personas as four subagents = four context windows (~4× tokens). Four personas answered sequentially in one conversation = roughly one long answer. Brainstorming doesn't need the architecture.
- **The part that IS worth it, under a different name:** council-as-*verification* rather than council-as-*brainstorm*. Independent agents cross-checking each other's findings has real support precisely because self-correction is the weak case. This is already built in Claude Code as dynamic workflows — `/deep-research` (fan out, cross-check, vote per claim, drop claims that fail) and prompts like `use a workflow to audit X and adversarially verify each finding`. Fan-out audits over a repo are the genuine fit: many independent reads, small conclusion each.
- **Verdict:** Not useful right now as a standing setup. For decisions, a single prompt asking for N independent perspectives + "list only where they disagree" gets ~the same value at ~1/4 the cost with zero setup. For implementation, actively harmful. The packaged frameworks fail the overhead test badly (28 plugins before any work is saved) — worth reading the persona definitions, not installing.
- **Status:** shelved — revisit only if (a) a decision comes up that's genuinely expensive to reverse and worth the token multiple, or (b) an audit-shaped task appears, in which case use dynamic workflows directly rather than building a council.

### Context7 (Upstash) — 2026-09-08

- **What it is:** A documentation-fetching service for coding agents (Claude Code, Cursor, etc.), available as an MCP server or a CLI+skill (`ctx7`). It indexes library docs and code examples and injects the current, version-specific version straight into your prompt/context instead of the model guessing from stale training data.
- **Used for:** Killing the two classic LLM-coding failure modes — outdated API usage and hallucinated methods that don't exist — for any library you're actively coding against, especially npm packages. Triggers either manually ("use context7" in the prompt) or automatically — confirmed Claude recognizes on its own when a question needs an npm package lookup and calls it without being told.
- **Core pieces:** `resolve-library-id` (name → Context7 library ID, e.g. `/vercel/next.js`) and `query-docs` (ID + your question → relevant doc chunks) as MCP tools; same two ops as `ctx7 library` / `ctx7 docs` CLI commands if you skip MCP. Setup is one command: `npx ctx7 setup` (Node 18+), which does OAuth, generates an API key, and installs the right integration for Cursor/Claude/opencode.
- **Cost/overhead:** Free plan = public repos only, 1,000 API calls/month (blocked after that, with 20 bonus calls/day trickled in until reset). Pro = $10/seat/month, 5,000 calls/seat, then $10/1,000 extra, plus private-repo parsing at $5/1M tokens. Setup overhead is minimal — one CLI command, no infra to self-host.
- **Verdict:** Useful — installed and confirmed working across projects. Auto-triggers correctly on npm package questions without manual prompting. Free tier's 1,000 calls/month is not a limiting factor since doc lookups aren't a constant, high-frequency need.
- **Status:** adopted

### Graphify — 2026-09-08

- **What it is:** Open-source CLI that parses a codebase (tree-sitter AST, no LLM needed) into a queryable knowledge graph — nodes = functions/classes/files, edges = calls/imports/inherits. Runs as a CLI or MCP tool your coding assistant calls directly.
- **Used for:** Giving an AI assistant precise "what connects to what" context instead of grepping/reading files cold — saves tokens on architecture/dependency/exploration questions specifically, not on editing.
- **Cost:** Core tool free (Apache-2.0/MIT), fully local, no API key for code-only use. Optional LLM call only if feeding it docs/PDFs (uses your own existing model spend). Paid Pro/Enterprise tiers exist for team features — price not public, not needed solo.
- **Verdict:** Maybe — real savings on large/unfamiliar backend or full-stack repos with deep call chains; benchmarked as weakest specifically on frontend UI work (convention drift issues). Limited upside for typical React/Next.js project work.
- **Status:** exploring (worth a 30-min trial on a large full-stack repo; skip for small/solo frontend projects)

### Temporal.io — 2026-09-06

- **What it is:** Open-source durable execution engine. You write a workflow function (multi-step orchestration logic) and Temporal persists progress at every step, so the process can crash or restart at any point and resume exactly where it left off — no re-running completed steps, no hand-rolled retry/state-tracking code.
- **Used for:** Multi-step processes that call several external systems (APIs, DB, email) and need to survive failures partway through without duplicating side effects — e.g. payment → inventory → confirmation email, where a crash after the charge shouldn't re-charge the card. Also handles arbitrarily long waits (days/months) at zero cost, and gives a full inspectable event history/trace of what ran.
- **Core pieces:** Workflow (orchestration logic, must be deterministic — no random/time/network calls inline), Activity (the actual side-effecting work), Worker (your process running both), Temporal Server (persists history, hands out tasks via named task queues).
- **Cost/overhead:** Self-hosted is free (MIT license) but is several stateful services (server + Postgres/Cassandra + optional Elasticsearch) — not a single container. Temporal Cloud starts at $100/mo (Essentials, 1M actions). Learning curve includes determinism rules and workflow versioning across deploys.
- **Lighter alternatives for TS stack:** BullMQ (Redis-backed queue, full control), Inngest (zero infra, deploy from existing Next.js app), Trigger.dev (managed/self-host, no determinism constraints, real-time streaming to frontend). All three clear the "saves more than it costs" bar more easily for small/solo projects.
- **Verdict:** Not useful right now — none of the active projects (App Planner, self-hosted infra, One Piece translation) currently have the multi-system, crash-surviving process shape Temporal solves. Self-hosting on the homelab NAS via docker-compose would be a low-cost way to learn it (costs disk/RAM, not money), but BullMQ/Inngest would cover actual current needs for less overhead.
- **Status:** exploring (shelved — revisit if a project needs multi-step external-API orchestration with crash-safe resumption, e.g. a content/translation pipeline or a homelab sync job across services)

### Hermes Agent (Nous Research) — 2026-09-06

- **What it is:** Open-source, self-hosted AI agent with persistent memory, a cron-style scheduler, and a multi-platform messaging gateway (Telegram/Discord/Slack/etc.) — built around a self-improving "skill" system, model-agnostic.
- **Used for:** Unattended, recurring background tasks — monitoring, scheduled status reports/digests — rather than interactive coding work. Functionally closer to "cron + persistent memory + chat interface wrapped around an LLM" than to a dev tool.
- **Can wrap Claude:** Yes — its `claude-acp` provider lets it use Claude Code as the reasoning backend, riding your existing Claude Code login/subscription instead of a separate API key. Confirmed working but still rough at the edges (open issues around spend-tracking parity, a `/compact` command collision bug when run alongside Claude Code in VS Code).
- **Related — OpenClaw:** The other major open-source agent in this space, and Hermes's direct competitor/predecessor (Hermes even ships a one-command migration tool for OpenClaw users). Same general shape — messaging gateway, memory, automation — but opposite architecture: OpenClaw is a TypeScript gateway that's ecosystem-first, routing to multiple isolated agents/workspaces and shipping native IDE integration (Zed, Codex, Claude Code) via its own ACP Bridge; Hermes is a single-agent Python runtime that's learning-first, centered on its self-improvement loop. OpenClaw is larger and more established (bigger community, larger skills marketplace, backed by more development resources) but same "nothing to monitor yet" verdict applies — not useful until there's live infrastructure to point it at.
- **Verdict:** Not useful right now — no deployed infrastructure yet to monitor, so the scheduler has nothing to watch. Could become useful once something (homelab, a client project, fitness-app in production) is actually running 24/7 and needs unattended status reporting. Setup overhead + immature Claude-backend integration don't clear the "saves more hours than it costs" bar today.
- **Status:** exploring (shelved for now, revisit if self-hosted infra or a live deployment materializes)
