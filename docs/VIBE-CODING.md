# Vibe Coding with makerlog.ai

> Describe what you want. Get working code.

## What is Vibe Coding?

Vibe coding is building software by describing what you want in natural language instead of writing every line yourself. You provide the vibe — "make a todo app" — and the AI generates working code, tests, and documentation.

makerlog.ai takes vibe coding further: the generated code lives in your repo, version-controlled, with persistent memory. The agent understands your project's conventions because the repo IS the agent.

## How It Works

```
Your vibe                 makerlog.ai              Working code
─────────                 ───────────              ────────────
"make a todo       →     parseVibeRequest()  →     { type: 'app',
 app with dark            ↓                         framework: 'vanilla',
 mode"                   generateFromVibe()         features: ['todos',
                           ↓                        'add','dark-mode'] }
                         validateVibeOutput()
                           ↓
                         Files, tests, README
```

Three steps:

1. **Parse** — Natural language → structured task
2. **Generate** — Structured task → code files + tests
3. **Validate** — Security scan, syntax check, best practices

## Quick Start

### 1. Init your environment

```bash
git clone https://github.com/Lucineer/makerlog-ai.git
cd makerlog-ai
bash scripts/init.sh
```

Or use npx:

```bash
npx makerlog-ai init
```

### 2. Open the IDE

```bash
npm run dev
# → Open http://localhost:8787/app
```

### 3. Vibe code

Type in the chat panel:

```
make a todo app with dark mode
```

The agent will:
1. Parse your request into a structured task
2. Generate source files and tests
3. Validate the output for security and syntax
4. Show you the files for review

## Example Prompts

### Apps

```
make a todo app
→ Generates: src/index.ts, src/types.ts, tests/index.test.ts

build a weather dashboard with charts
→ Generates: src/index.ts, src/routes.ts, tests/index.test.ts

create a URL shortener API
→ Generates: src/index.ts, src/routes.ts, src/types.ts, tests/routes.test.ts
```

### Features

```
add dark mode
→ Detects: feature, scope: ui, feature: dark-mode

implement user authentication
→ Detects: feature, area: auth, features: [auth, signup]

add search with pagination
→ Detects: feature, features: [search, pagination]
```

### Bug Fixes

```
fix the login bug
→ Detects: bugfix, area: auth

debug the API crash on /api/users
→ Detects: bugfix, area: api
```

### Refactoring

```
refactor the database layer
→ Detects: refactor, area: data

clean up the config module
→ Detects: refactor, area: config
```

## From Idea to Deployed App in 10 Minutes

### Step 1: Init (1 minute)

```bash
npx makerlog-ai init
# Select: Anthropic, claude-sonnet-4-20250514
# Paste your API key
```

### Step 2: Describe your app (1 minute)

```
Build a bookmark manager with:
- Add/delete bookmarks
- Search by title or URL
- Dark mode
- Export to JSON
```

### Step 3: Review generated code (3 minutes)

The agent generates files. Review them in the IDE. Edit as needed.

### Step 4: Generate assets (2 minutes)

```
Generate an icon for this bookmark manager
```

```
Generate a screenshot mockup of the dark mode UI
```

### Step 5: Deploy (3 minutes)

```bash
# Cloudflare Workers
npm run deploy

# Docker
docker compose -f docker/docker-compose.yml up

# Local
npm run dev
```

## Asset Generation

makerlog.ai can generate visual assets for your project using the Gemini API.

### Icons

```
generateIcon("chat app icon")
→ 128x128 PNG, transparent background
```

### Screenshots

```
generateScreenshot("dashboard with sidebar and charts", { device: "desktop", darkMode: true })
→ 1280x720 mockup
```

### Diagrams

```
generateDiagram("microservices architecture with API gateway", { type: "architecture" })
→ 800x600 architecture diagram
```

### Avatars

```
generateAvatar("developer avatar")
→ 128x128 avatar image
```

### Logos

```
generateLogo("makerlog", "bold")
→ 256x256 project logo
```

All asset generation falls back to procedural generation when no Gemini API key is configured.

## Connecting to Other Agents

makerlog.ai uses the A2A (Agent-to-Agent) protocol to communicate with other cocapn agents.

### Connect to dmlog (game assets)

```typescript
import { AgentBridge } from './src/a2a/agent-bridge.js';

const bridge = new AgentBridge({
  agentId: 'makerlog-ai',
  capabilities: ['code-gen', 'asset-generation', 'testing'],
});

// Connect to dmlog.ai
const peer = await bridge.connectToAgent('https://dmlog.ai', {
  auth: 'your-fleet-token',
});

// Request game asset generation
const help = await bridge.requestHelp('dmlog-ai', {
  task: 'Generate a fantasy map tileset for a dungeon crawler',
  priority: 'normal',
});
```

### Connect to fishinglog (edge data)

```typescript
// Connect to fishinglog.ai for real-time data
const fishingPeer = await bridge.connectToAgent('https://fishinglog.ai');

// Share context about what you're building
await bridge.shareContext('fishinglog-ai', {
  files: [{ path: 'src/types.ts', content: '// weather data types...' }],
  summary: 'Building weather overlay for fishing spots',
  tags: ['weather', 'maps'],
});
```

### Agent Bridge API

| Method | Description |
|--------|-------------|
| `connectToAgent(url, options)` | Connect to a remote agent, discover capabilities |
| `sendMessage(agentId, message)` | Send a text message |
| `receiveMessages()` | Get queued messages from other agents |
| `shareContext(agentId, context)` | Share code/files with another agent |
| `requestHelp(agentId, task)` | Ask another agent to help with a task |
| `getConnectedAgents()` | List connected peers |
| `getAgentsByCapability(cap)` | Find peers with a specific capability |
| `disconnect(agentId)` | Disconnect from an agent |
| `destroy()` | Shut down the bridge |

## Validation

Every vibe-coded output is validated automatically:

| Check | Severity | What it catches |
|-------|----------|----------------|
| `eval()` usage | Error | Code injection risks |
| Dynamic Function() | Warning | Arbitrary code execution |
| `document.write` | Warning | XSS vectors |
| `innerHTML` assignment | Warning | DOM-based XSS |
| HTTP fetch | Warning | Insecure connections |
| Hardcoded secrets | Error | Passwords, tokens, API keys in source |
| Env var fallbacks | Warning | Leaked default secrets |
| Unbalanced braces | Warning | Syntax errors |
| Empty files | Warning | Incomplete generation |

## Architecture

```
src/
├── vibe/
│   └── glue.ts          ← parseVibeRequest, generateFromVibe, validateVibeOutput
├── vision/
│   ├── sprites.ts       ← Pixel sprite generation
│   ├── pipeline.ts      ← Resolution pipeline (draft → final → upscale)
│   └── dev-assets.ts    ← Icon, screenshot, diagram, avatar, logo generation
├── a2a/
│   └── agent-bridge.ts  ← Cross-agent communication (connect, message, share, help)
├── agent/
│   ├── loop.ts          ← Agentic tool_use loop
│   ├── a2a.ts           ← A2A protocol (wire format)
│   └── ...
└── scripts/
    └── init.sh          ← One-command setup
```

## Tips for Better Vibes

1. **Be specific about features** — "todo app with add, delete, and search" generates better code than "todo app"
2. **Mention the framework** — "React todo app" vs "vanilla todo app" changes the output
3. **Specify the area for bug fixes** — "fix the login auth bug" is better than "fix the bug"
4. **Use the IDE to iterate** — Generate, review, refine with follow-up messages
5. **Connect agents for specialized tasks** — dmlog for game assets, fishinglog for real-world data

---

Built with [cocapn](https://github.com/Lucineer/cocapn) — the repo-first agent paradigm.
