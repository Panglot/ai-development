# MCP (Model Context Protocol)

### The one-line mental model

MCP = an API standard specifically designed for LLMs to call. Same request/response shape as any backend API, plus a self-describing discovery layer so an LLM — not a human developer — can find and choose the right call at runtime.

### The client/server split — same shape as frontend/backend

- MCP client = lives inside the host app (Claude Desktop, Cursor, Claude Code). Talks to the LLM, forwards whatever it decides to call.
- MCP server = a separate process holding the actual code/logic. Doesn't know or care which client is calling it.
- Why split into a "server"? Same reason backend split from frontend: decoupling. One server (e.g. a GitHub server) works unmodified across Claude Desktop, Cursor, Claude Code, or any other MCP host — write once, works everywhere.

### What actually crosses the wire

- Discovery (on connect): client asks "what tools do you have?" → server replies with a manifest — names, plain-language descriptions, parameter schemas. This is the "instructions," but it's just text/JSON describing what's callable, never the implementation.
- Execution (when the LLM decides to act): client sends "call tool X with these params" → server runs its real code → returns a small result blob, e.g. `{content: [{type: "text", text: "..."}]}`. Just data — same shape as any JSON API response. Never code, never a "ready tool."
- The server is never an LLM. Plain deterministic code, zero reasoning. The only LLM in the whole loop sits on the client/host side — it decides which tool to call, then later turns the returned data into a sentence.

### Why "for LLMs" specifically, if it's just JSON any code could send

Not a technical gate — a plain script could speak MCP too. It's about when the decision to call gets made:

- Normal API: a developer decides which endpoint to call and hardcodes it into code once, at write time. Fixed until someone edits it.
- MCP: nobody hardcodes the call. The LLM decides fresh, every conversation, by reading tool descriptions at runtime and matching them to what was just asked. That's why the discovery/description handshake is baked into the protocol — a human-written script doesn't need it, an LLM does.

### Correction: it's not just "data access" — read AND do

Two flavors of tool, exact same mechanism underneath (register a function, params in, result out):

- Read: query a DB, check a calendar, fetch GitHub issues
- Do: create an issue, send a message, run code in a sandbox, click through a webpage

MCP doesn't distinguish structurally between these — both are just "call a function, get a result back."

### Correction: MCP doesn't give the model a new "skill"

The model itself doesn't get smarter or gain some new innate ability. What it gets is a phone line to something external that already knows how to do the thing — the database already knows how to run a query, GitHub's API already knows how to create an issue. The actual capability lives entirely in the server's code, never in the model. The model's job stays the same as ever: decide when to pick up that phone line and what to say into it.

### The ecosystem layers — SDK vs ready-made servers vs registries (my mixup, resolved)

- SDK (e.g. `typescript-sdk`) = the raw library to build a server or client (`McpServer`, `registerTool`, transports). Not domain-specific — "TypeScript SDK" describes the implementation language, not the subject matter. Same relationship as React → the components you build with it.
- Ready-made servers (`modelcontextprotocol/servers`, `github/github-mcp-server`, etc.) = finished, install-and-go servers built using an SDK. This is the actual "ready stuff."
- Registries/directories (registry.modelcontextprotocol.io, Glama, PulseMCP, Smithery, mcp.so, awesome-mcp-servers) = where to find and evaluate ready-made servers. The official registry is metadata-only — self-reported, minimal moderation (spam/malware only). Glama's A–F security grading is the better signal for judging trust before installing.
- Naming trap to remember: "SDK for building MCP servers, written in X" ≠ "MCP servers FOR doing X work." Example: `typescript-sdk` (build any server, in TypeScript) vs `ts-diagnostics-mcp` / `mcp-language-server` (real servers that let an LLM do TypeScript type-checking/code-navigation) — genuinely separate repos, easy to conflate by name alone.

### Four real buckets of what people actually use MCP for

1. Read your own private data — DB, Drive, Gmail, GitHub. Needs your own credentials (connection string, API token) because it's reaching into things that belong to you.
2. Take real actions on your systems — create an issue, send a message, run code, browser automation. Same credential requirement, but it does something instead of just fetching.
3. Help an AI coding agent work on your actual codebase — type-check, navigate definitions, lint, without typing the commands yourself. No personal data involved — pure tooling for the session.
4. Genuinely public, free, zero-auth servers — weather, web fetch, public datasets (PubMed, open government data). Wraps a public API that needs no credentials at all — install and use immediately.

### Compressed takeaway

MCP = a standard way to expose a function — read or do — to an LLM, with a description attached so the LLM can find and call it on its own at runtime. The "for LLMs" part is entirely about who decides what to call and when — not a different technical mechanism than an ordinary API.

### Useful links

<https://www.pulsemcp.com/servers?sort=popular-total-desc>
<https://github.com/modelcontextprotocol/servers/tree/HEAD/src/filesystem>

---

### Practical example — actually setting up and running one (Playwright MCP)

Server used: Microsoft's official @playwright/mcp — browser automation, controls a real browser instead of just returning data.

#### Setup in Claude Desktop

Config file opened via Settings → Developer → Edit Config (claude_desktop_config.json). Confirmed it's a real file with real other content (Cowork prefs, trusted folders, etc.) — mcpServers is a new top-level key, sibling to whatever else is already in the file (e.g. preferences), not nested inside anything.
Base config: {"mcpServers": {"playwright": {"command": "npx", "args": ["@playwright/mcp@latest"]}}}.
Every config change needs a full quit and reopen of Claude Desktop, not just closing the window — it only reads the file on launch.

#### Proof it was genuinely live and local, not a fluke

Navigated to example.com — real page title came back, and the snapshot file path written to disk contained my own Windows username (D36EA~1.BOG, the short form of D.Bogatev), matching my config's coworkUserFilesPath. That's what confirmed it was really running on my machine, not some pre-existing unrelated connection.

Switching browser to Firefox — a real gotcha hit along the way:

Added "args": ["@playwright/mcp@latest", "--browser", "firefox"].
First attempt failed: Error: Browser "firefox" is not installed; expected executable at ...firefox-1542\firefox\firefox.exe. Playwright manages its own separate browser binaries — doesn't reuse the system's installed Firefox.
Fixed with the exact command the error itself gave: npx @playwright/mcp install-browser firefox (more reliable than the generic npx playwright install firefox, since it's the package's own installer).
Confirmed it was really Firefox (not Chromium mislabeled) by checking navigator.userAgent via browser_evaluate — came back with a genuine Gecko/... Firefox/155.0 string.

#### What it could actually reach — scope check

Since the browser runs as a process on my own machine, "localhost" from its point of view is my localhost — it successfully reached <http://localhost:8081/>, which turned out to be the fitness app's Expo/Metro dev server, already running. Confirmed by reading document.title/document.body.innerText via browser_evaluate.
Used browser_find to locate a "Modal" button's element ref on that live page, then browser_click on that ref — a real dialog opened on the running app ("Hello World! asd" + a "Hide Modal" button), confirmed via browser_snapshot.
Scope boundary confirmed: it only sees/acts inside that one browser window it controls — not my desktop generally, not my regular daily browser (separate fresh profile by default), and only on-demand per tool call, nothing continuous in the background.

#### Getting the same server into Claude Code (separate from Desktop)

Confirmed Claude Code (VS Code extension or CLI) does not read Claude Desktop's config file at all — fully separate config storage (~/.claude.json / .mcp.json vs Desktop's own file).
claude command wasn't recognized in cmd at first — turned out only the VS Code extension was installed, which bundles its own private copy just for its chat panel and doesn't add anything to PATH. Fixed by installing the standalone CLI via PowerShell (not cmd — the installer uses PowerShell-only syntax): irm <https://claude.ai/install.ps1> | iex.
Tried the one-command import, claude mcp add-from-claude-desktop — failed with Unsupported platform - Claude Desktop integration only works on macOS and WSL. Native Windows isn't supported for that specific import path.
Worked around it by adding the server directly instead, no Desktop dependency: claude mcp add playwright --scope user -- npx @playwright/mcp@latest --browser firefox.
Verified with claude mcp list (shows it registered) and /mcp inside a session (shows it connected with its tool list).
Net result: two independent Playwright MCP processes now exist — one wired into Claude Desktop, one into Claude Code — same package, separate profiles/state, configured completely separately.

<!-- Real MCPs tested/used, with notes and URLs -->
