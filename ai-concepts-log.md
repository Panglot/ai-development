# AI Concepts & General Research Log

Running index of general AI concepts, techniques, and background understanding — as opposed to specific products/technologies (those go in `tech-research-log.md`). Each entry here is a short title + one-line description + link to the full write-up in `concepts/`. Full detail, practical examples, and reference URLs live in the linked file, not here — keeps this index scannable as the list grows.

---

<!-- Add new entries below this line, most recent first -->

- **Claude Code Hooks**: The deterministic third control layer alongside CLAUDE.md (persuades) and permissions (filters) — hooks enforce and react, every time, no exceptions. → [concepts/claude_concepts_hooks.md](concepts/claude_concepts_hooks.md)

- **Subagents & Multi-Agent Patterns**: What a subagent actually is (isolated context/tools/model), when delegating earns its cost, and how skills, forks, and dynamic workflows relate to it. → [concepts/subagents-and-multi-agent-patterns.md](concepts/subagents-and-multi-agent-patterns.md)

- **Context Engineering & Documentation for LLMs**: Curating the entire token budget at inference time (system prompt, tools, docs, history), not just writing good instructions — the practical successor to prompt engineering. → [concepts/context-engineering-and-agent-docs.md](concepts/context-engineering-and-agent-docs.md)

- **MCP — The API for LLMs**: A standard that lets an LLM discover and call external functions (read or do) at runtime, instead of a developer hardcoding the call. → [concepts/MCP.md](concepts/MCP.md)
