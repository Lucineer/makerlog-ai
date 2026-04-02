# CLAUDE.md

## Project Overview
MakerLog.ai is an AI Coding Agent built as a Cloudflare Worker with BYOK (Bring Your Own Key) LLM routing. It is part of the Cocapn ecosystem (cocapn.ai) under the Lucineer GitHub organization. The agent operates on a core philosophy: knowledge and code are the same layer—capable of coding itself.

## Architecture Summary
- **Cloudflare Worker** (`src/worker.ts`): The main entry point handling all routing and serving inline HTML. No external asset binding is used.
- **BYOK Module** (`src/lib/byok.ts`): 503 lines, handling LLM routing across 7 providers with a strict config discovery hierarchy.
- **Core Agent Systems** (`src/core/`): Contains all coding agent capabilities including the task runner, dependency graph, test runner, file manager, terminal, self-builder, build pipeline, git manager, and snippet manager.
- **State/Storage**: Uses Cloudflare KV (`MAKERLOG_MEMORY` binding) for persistence.

## Key Commands
- `wrangler dev`: Start local development server.
- `wrangler deploy`: Deploy to Cloudflare Workers production.
- `git push`: Push changes to the remote repository (Commits should be attributed to "Author: Superinstance").

## Code Style and Conventions
- **Language**: Strict TypeScript (45 files).
- **Runtime**: Zero runtime dependencies for the MVP.
- **Deployment**: No build step. Code is deployed directly using Wrangler.
- **UI**: All HTML/CSS/JS is inlined directly into `src/worker.ts`.
- **Styling**: Theme is "code". Brand/accent color is cyan-purple (`#00d4ff`).
- **Auth**: BYOK config discovery strictly follows this cascade: URL params → Auth header → Cookie → KV → fail.

## Testing Approach
- The agent includes its own test runner within `src/core/`.
- Standard validation is handled via `wrangler dev` before deploying.

## Important File Paths
- `src/worker.ts` - Worker entry point, router, and inline HTML.
- `src/lib/byok.ts` - BYOK LLM routing and provider config discovery.
- `src/core/` - Coding agent systems (task runner, file manager, etc.).

## What NOT to Change
- Do not extract inline HTML from `worker.ts` into external files or attach an ASSETS binding; the single-file UI pattern is intentional.
- Do not alter the BYOK config discovery cascade (URL params → Auth header → Cookie → KV → fail).
- Do not introduce runtime dependencies without careful consideration of the MVP constraints.

## How to Add New Features
1. Create a new module in the appropriate directory (e.g., `src/core/new-feature.ts` or `src/lib/new-tool.ts`).
2. Import the new module into `src/worker.ts`.
3. Add the necessary route handlers (e.g., `/api/new-feature`, `/public/new-feature`) directly within `worker.ts`.

## Deployment Instructions
1. Ensure you have the latest code passing local checks.
2. Run `wrangler deploy` to build and deploy to Cloudflare.
3. Commit and push using `git push`. Ensure commits are attributed to "Author: Superinstance".

## Ecosystem Links
- **Organization**: [github.com/Lucineer](https://github.com/Lucineer)
- **Main Hub**: [cocapn.ai](https://cocapn.ai)
- **Sister Repos**: Look for other `*log.ai` repositories within the Lucineer GitHub organization.
