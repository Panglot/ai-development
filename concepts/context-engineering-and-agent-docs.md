# Context Engineering & Documentation for LLMs

### The one-line mental model

Prompt engineering is about writing good instructions. Context engineering is about curating the *entire* set of tokens present at inference time — system prompt, tools, docs, history — because that whole set competes for one finite attention budget. Nearly everything below is a consequence of that one constraint.

---

## Prompt engineering → context engineering

Anthropic frames context engineering as the natural progression of prompt engineering, not a replacement. Prompting = writing instructions. Context engineering = the ongoing curation of everything else that lands in the window (tools, MCP, retrieved docs, message history), repeated at every turn rather than done once.

Why it matters mechanically: transformers give every token n² pairwise relationships with every other token. As context grows, that attention gets stretched thinner — "context rot." Models degrade gradually, not off a cliff, but the direction is always the same: more tokens ≠ more capability past a point. The operating principle that falls out of this: find the *smallest* set of high-signal tokens that gets the outcome you want. Not the most complete set.

### What still works (current models)

- Explain *why* a rule exists, not just the rule — the model generalizes from the reason.
- 3–5 diverse, relevant examples beat a long list of edge cases crammed into the prompt.
- Long documents go at the *top* of the prompt, question at the bottom — measured up to +30% quality on complex multi-doc inputs.
- XML/markdown sectioning still helps, though matters less as models improve.

### What changed and trips people up

- Prefilled assistant responses are gone on current-generation models (400 error).
- Manual chain-of-thought is largely obsolete — thinking is adaptive and on by default; internal evals favor it over manual CoT.
- Over-prompting now backfires. "CRITICAL: you MUST use this tool" causes *overtriggering* on current models. Plain "use this tool when…" is correct. Prompts tuned to fight an older model's laziness need to be dialed back, not kept as insurance.

---

## Prompt structure itself — recency, primacy, and the "lost in the middle" mechanism

**Lost-in-the-middle is real, but not "the middle gets read only when needed."** Every token in context gets attended to on every forward pass — what varies is how well, from two compounding effects, not one:

- **Recency**: positional decay (e.g. RoPE) makes attention between tokens weaken with distance. The query sits at the end, so nearby tokens get a real boost.
- **Primacy**: softmax attention has to sum to 1 even when nothing is relevant, so models learn to dump leftover weight on the first few tokens as a "sink" — reinforced by early tokens being visible to every later token, while late tokens are only visible to themselves.

The middle gets neither boost, and since attention is zero-sum, whatever the edges take is what the middle loses. This compounds across layers.

Whether this still holds on current frontier models is contested — some 2026 evals still find it on long inputs, others report it's disappeared for simple factoid recall on specific models. No confirmed answer for current Claude models specifically.

**The practical fix has three parts, and the front part needs to be specific:**

1. **Start** — what to look for and why it matters, specific rather than generic framing
2. **Middle** — the bulk document
3. **End** — the actual question or task

Start/end placement is Anthropic's documented advice. The reason a specific pointer at the start also helps comes from a separate finding (the R&R paper): proximity to an instruction predicts recall, not just proximity to the document's edges — so a concrete pointer up front gives mid-document content something to anchor to later. This is a reasoned combination of two separately-supported ideas, not one benchmarked recipe, and it mostly matters at genuine length (20k+ tokens) — not worth restructuring ordinary prompts over.

**Formalities ("please," "thank you") — no reliable performance effect either direction.** Studies disagree with each other: one found impolite prompts hurt, another found the opposite on GPT-4o, a third found politeness changes response style (more exploratory) rather than correctness. Anthropic's own guidance never mentions tone at all — only clarity, specificity, and directness. So dropping the pleasantries isn't a proven performance gain; it's just tokens that aren't doing measurable work either way. If you like writing that way, no evidence here says you're paying a real cost.

---

## Documentation *for* LLMs — two different things, often conflated

**(a) Repo-level context files** (AGENTS.md / CLAUDE.md). The open standard — 60k+ repos, no required schema, Linux Foundation–stewarded. Claude Code reads `CLAUDE.md` specifically, not `AGENTS.md`; bridge with a `CLAUDE.md` that does `@AGENTS.md` plus Claude-specific additions below it.

**The evidence is not what the ecosystem's enthusiasm implies.** ETH Zurich / LogicStar (arXiv:2602.11988, Feb 2026) found that context files *did not generally improve task success rates* across Claude Code, Codex, and Qwen Code, while increasing inference cost by 20%+ on average — holding across models and across both LLM-generated and developer-written files. The mechanism: when they stripped all other documentation from the repos, LLM-generated files suddenly helped (+2.7%) — meaning most generated files just pre-cache what the agent would've found by reading the repo anyway. Directory/architecture overviews were tested directly and didn't help: more reads, more searching, no accuracy gain.

**The rule that survives this**: a context file earns its place only by encoding what the repo can't tell the agent itself — non-default tool choices, non-obvious test commands, conventions that contradict framework defaults. Anthropic's own tooling agrees: `/doctor` trims content Claude can derive from the codebase and keeps pitfalls, rationale, and conventions that differ from defaults. Target under 200 lines; longer measurably reduces adherence.

**(b) Docs for external LLMs consuming your product** (`llms.txt`). Real adoption (Stripe, Cloudflare, Anthropic, Cursor all ship one) but SE Ranking's ~300k-domain analysis found *no* correlation with AI citation frequency — removing the variable improved their prediction model. The one place it's confirmed to work: developer documentation, where coding assistants fetch it live while a developer works. Not a general visibility play.

---

## The core mechanical caveat: `@` imports are not lazy

This is the trap worth internalizing above everything else here, because it inverts what "hierarchical" and "lazy-loaded" *feel* like they should mean.

- `@path/to/file` in a CLAUDE.md is an **import**. It is expanded and loaded into context **at launch**, and it recurses up to **four hops deep**.
- A markdown link — `[ARCHITECTURE.md](./ARCHITECTURE.md)` — is **not** an import. It's inert text. The agent may choose to `Read` it later, as an explicit tool call, at the moment it's actually needed.

A tree of `@`-imports *looks* like a well-organized lazy hierarchy on paper — top index imports category indices, which import section indices — but mechanically it's the opposite: everything reachable within four hops is concatenated into context before the first token of the user's message is even read. This is eager loading wearing a hierarchy's clothes.

**Diagnostic symptom**: if context is already filling up — or compaction is firing — before the first prompt is even sent, this is very likely the cause (or its sibling: directory-hierarchy CLAUDE.md stacking, where every parent directory's file concatenates rather than overrides). Run `/context` immediately on opening a session, before typing anything, and check what's listed under *Memory files*. That single check tells you whether your always-loaded layer is what you think it is.

**The fix** is structural, not "trim harder": stop importing the tree. Have the top-level index reference lower sections as plain pointers the agent reads on demand — exactly the difference between an `@import` and a markdown link in a table.

---

## Progressive disclosure — the actual lazy-loading mechanism

Agent Skills formalize the pointer pattern above into a spec: a `SKILL.md`'s `name` + `description` (frontmatter) load always; the full body loads only when a task triggers it; any further reference files or scripts load only if the skill itself needs them. Measured discovery cost across Anthropic's own 17 skills: ~80 tokens each. That's the actual efficiency story — many capabilities available for the cost of one paragraph, until one is actually used.

Claude Code's `.claude/rules/` applies the same idea to instructions: a rule with `paths:` frontmatter loads only when Claude touches a matching file glob, instead of every rule loading on every task regardless of relevance.

Same principle, different layer: Anthropic's "just-in-time" context strategy — keep lightweight identifiers (file paths, stored queries) and load the actual data at runtime via tools, rather than pre-loading everything. Mirrors how humans use file systems and bookmarks instead of memorizing entire corpora.

For long-running work specifically, three named techniques address context filling *during* a session (a separate failure mode from eager preloading at start): **compaction** (summarize near the limit, reinitiate with the summary), **structured note-taking** (a NOTES.md / progress file the agent reads back after a reset), and **subagents** (isolated context per workstream, returning only a condensed summary to the lead agent).

---

## Case study: the "documentation factory" pattern

A real pattern reported by a tech lead at a large company: comprehensive documentation as the actual product source, devs navigating and editing docs rather than writing code directly, an LLM building from the docs. This is a real, named category — **spec-as-source** development, the far end of spec-driven development, where the spec is the only artifact humans edit and code is a generated/verified output. Legitimate for complex requirements, many maintainers, integration-heavy systems.

Reported failure mode: context filling even with lazy loading in place, badly enough that opening a fresh chat triggered compaction before the first prompt. Diagnosis chain, useful as a general checklist for any large doc-driven setup:

1. **Filling before the first prompt** → the always-loaded layer is already too big. Prime suspect: `@`-import chains (above), or CLAUDE.md stacking up a deep directory tree.
2. **Filling during a long task, not before** → an accumulation problem instead — missing compaction or tool-result clearing, not a documentation-authoring problem at all.
3. **A flat index that's merely large** → scales with total project size by construction. Fix is hierarchy — nested indices where the agent descends level by level (mirrors nested `AGENTS.md`/`CLAUDE.md` per-package, which load only when Claude reads files in that subtree) — not more aggressive trimming of one giant list.
4. **Even a good hierarchy costs tool calls to traverse** → past a certain corpus size, embedding-based retrieval (jump straight to the relevant chunk) beats browsing a manually maintained tree. This is a different axis from lazy-loading, easy to conflate with it.

Manual trimming, as a strategy, is a symptom-suppressant that works regardless of which of these four is actually wrong — which is exactly why it doesn't tell you which one you have.

---

## Applying the same idea to a *generative* system

The pattern generalizes past dev tooling: a library of markdown pattern/decision files as the actual substrate an LLM builds *from* — e.g. an app builder where each `.md` encodes one pattern (an auth flow, a component convention) and the agent loads whichever are relevant to the current build. Real precedent exists at smaller scale (Google's `DESIGN.md` format encodes a visual identity system for agents to apply when generating UI).

The part that decides whether this works is not the file format — it's **routing**: how does the agent pick which files apply?

- **Description-based selection** (what Skills actually do): cheap, scales fine, but lives or dies on how distinct each file's description is. Same warning Anthropic gives for tools applies verbatim: if a human can't say definitively which one applies here, an agent can't either.
- **Retrieval-based selection** (embeddings/semantic search): skips discovery, needed once the library is too large to describe-and-choose from directly.

A risk specific to *generative* use that doesn't show up in a pure dev-docs setup: **composition**. Building one feature often needs several pattern files loaded together, and nothing guarantees they don't contradict each other — the same "two rules conflict, model picks arbitrarily" failure CLAUDE.md has, except baked silently into someone else's generated output instead of visible in a config file. Worth deciding up front whether patterns are meant to compose (need explicit precedence rules) or are mutually exclusive alternatives (need an explicit choice rule) — rather than leaving it implicit.

---

## Compressed takeaway

Context is finite and every token in it has a cost, so the entire discipline is variations on one move: **decide what's always loaded, and make everything else load only when actually needed.** The recurring failure across every example here — the enterprise factory, a generated CLAUDE.md, a bloated tool set — is the same one: something that was supposed to be on-demand turned out to be eager, usually because the eager mechanism (`@import`, a directory overview, an unscoped rule) looked structurally identical to the lazy one on the page. The fix is never "write a better document." It's checking, mechanically, what actually loads and when — `/context` before the first prompt is the single cheapest version of that check.

### Useful links

<https://arxiv.org/abs/2602.11988> — Evaluating AGENTS.md (ETH Zurich / LogicStar, Feb 2026)
<https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
<https://code.claude.com/docs/en/memory> — CLAUDE.md loading mechanics, imports, auto memory
<https://agents.md/> — AGENTS.md spec
