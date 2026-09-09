# ai-development

Personal research on AI tooling — how to prompt effectively, and when to reach for an MCP server, a Skill, a Subagent, a Hook, or a dynamic workflow versus plain documentation. It's both a set of notes for me and, ultimately, a guide for using Claude Code well.

- [`ai-tooling-guide.md`](ai-tooling-guide.md) — the prescriptive core: decision rules for picking the right mechanism, prompting principles, and context/document hierarchy rules. Written to double as a Claude Skill.
- [`tech-research-log.md`](tech-research-log.md) — running log of specific products/technologies investigated (what they are, verdict, status).
- [`ai-concepts-log.md`](ai-concepts-log.md) — index of general AI concepts and background research, with full write-ups in [`concepts/`](concepts/).

## Setup

```sh
npm run setup
```

Copies `ai-tooling-guide.md` into `~/.claude/skills/ai-tooling-guide/SKILL.md`, installing it as a Claude Code skill. Re-run after editing the guide to pick up changes — it's a plain overwrite, not a sync.
