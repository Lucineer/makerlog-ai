# Onboarding Guide

Welcome to makerlog-ai. This guide gets you from clone to running in under
five minutes.

## Prerequisites

- Node.js 20+
- Git
- An LLM API key (DeepSeek, Anthropic, OpenAI, or Groq) — or Ollama for local models

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/your-org/makerlog-ai.git
cd makerlog-ai
```

### 2. Set your API key

```bash
cp docker/.env.example .env
# Edit .env and add your API key
```

Or use the CLI:

```bash
npx cocapn secret set DEEPSEEK_API_KEY
```

### 3. Install and run

```bash
npm install
npm run dev
```

The app starts at `http://localhost:3000`.

### 4. (Optional) Run with Docker

```bash
cd docker
cp .env.example .env
# Edit .env
docker-compose up --build
```

### 5. (Optional) Run with Ollama locally

```bash
# Start Ollama first
ollama serve
ollama pull codellama:7b

# Then start the app with OLLAMA_HOST set
OLLAMA_HOST=http://localhost:11434 npm run dev
```

## What You Get

- **Landing page** at `/` — public-facing site
- **IDE** at `/app` — full code editor with agent chat
- **API** at `/api/*` — REST + streaming chat endpoint
- **Webhooks** at `/api/webhooks/*` — Telegram, Discord, billing
- **MCP** at `/api/mcp` — visiting agent discovery

## Next Steps

- Edit `cocapn/soul.md` to customize the agent personality
- Edit `cocapn/cocapn.json` to configure providers and permissions
- Add skills to `cocapn/skills/` for domain-specific knowledge
- Read `CLAUDE.md` for the full project guide
