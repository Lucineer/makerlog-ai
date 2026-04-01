# makerlog.ai — Example Gallery

Copy-pasteable use cases. Paste the prompt into the agent chat, see the result.

---

## 1. Generate Documentation from Code

**Prompt:**
```
Generate JSDoc documentation for all exported functions in src/providers/index.ts
```

**Expected output:**

```ts
/**
 * Registry of LLM providers with automatic fallback chain.
 *
 * @example
 * const registry = new ProviderRegistry({ provider: 'anthropic', apiKey: 'sk-...' });
 * for await (const chunk of registry.chatStream(messages)) {
 *   if (chunk.type === 'text') process.stdout.write(chunk.content);
 * }
 */
export class ProviderRegistry {
  /**
   * Create a new provider registry.
   * @param config - Provider configuration (provider name, API key, model, optional base URL)
   */
  constructor(config: ProviderConfig) { ... }

  /**
   * Stream a chat completion from the primary provider.
   * Falls back to the secondary provider on failure.
   * @param messages - Array of chat messages with role and content
   * @yields {StreamChunk} Text or tool_use chunks as they arrive
   */
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> { ... }
}
```

---

## 2. Refactor a Module

**Prompt:**
```
Refactor src/billing/index.ts — extract the usage tracking into its own class
and make BillingManager use composition instead of having everything in one class
```

**Before:**
```ts
// src/billing/index.ts — 280 lines, 5 responsibilities
export class BillingManager {
  async checkAccess(userId: string): Promise<AccessResult> { ... }
  async recordUsage(userId: string, tokens: number, cost: number): Promise<void> { ... }
  async getUsageReport(userId: string): Promise<UsageReport> { ... }
  async handleWebhook(event: BillingEvent): Promise<void> { ... }
  async enforceQuota(userId: string): Promise<boolean> { ... }
}
```

**After:**
```ts
// src/billing/index.ts — orchestrator, ~40 lines
export class BillingManager {
  private tracker: UsageTracker;
  private access: AccessControl;
  private webhooks: WebhookHandler;

  constructor(db: D1Database, kv: KVNamespace) {
    this.tracker = new UsageTracker(db);
    this.access = new AccessControl(kv);
    this.webhooks = new WebhookHandler(db, kv);
  }

  async checkAccess(userId: string) { return this.access.check(userId); }
  async recordUsage(userId: string, tokens: number, cost: number) { return this.tracker.record(userId, tokens, cost); }
  async getUsageReport(userId: string) { return this.tracker.getReport(userId); }
  async handleWebhook(event: BillingEvent) { return this.webhooks.handle(event); }
}

// src/billing/usage-tracker.ts — ~60 lines
// src/billing/access-control.ts — ~50 lines
// src/billing/webhook-handler.ts — ~70 lines
```

---

## 3. Write Tests for a Function

**Prompt:**
```
Write vitest tests for the resolveProviderConfig function in src/worker.ts.
Cover: explicit provider, auto-detection order, ollama fallback, missing keys.
```

**Generated tests:**

```ts
import { describe, it, expect } from 'vitest';
// Note: resolveProviderConfig is a module-private function.
// In a real test, you'd export it or test via the /api/status endpoint.

// Assuming we can import or simulate the function:
function resolveProviderConfig(env: Record<string, string | undefined>) {
  if (env.COCAPN_PROVIDER) return { provider: env.COCAPN_PROVIDER, /* ... */ };
  if (env.ANTHROPIC_API_KEY) return { provider: 'anthropic', /* ... */ };
  if (env.OPENAI_API_KEY) return { provider: 'openai', /* ... */ };
  if (env.DEEPSEEK_API_KEY) return { provider: 'deepseek', /* ... */ };
  if (env.GROQ_API_KEY) return { provider: 'groq', /* ... */ };
  return { provider: 'ollama', baseUrl: env.OLLAMA_HOST ?? 'http://localhost:11434', model: 'llama3' };
}

describe('resolveProviderConfig', () => {
  it('uses explicit COCAPN_PROVIDER when set', () => {
    const result = resolveProviderConfig({
      COCAPN_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    expect(result.provider).toBe('anthropic');
  });

  it('auto-detects Anthropic first', () => {
    const result = resolveProviderConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: 'sk-test',
      DEEPSEEK_API_KEY: 'sk-test',
    });
    expect(result.provider).toBe('anthropic');
  });

  it('auto-detects OpenAI second', () => {
    const result = resolveProviderConfig({
      OPENAI_API_KEY: 'sk-test',
      DEEPSEEK_API_KEY: 'sk-test',
    });
    expect(result.provider).toBe('openai');
  });

  it('auto-detects DeepSeek third', () => {
    const result = resolveProviderConfig({
      DEEPSEEK_API_KEY: 'sk-test',
    });
    expect(result.provider).toBe('deepseek');
  });

  it('auto-detects Groq fourth', () => {
    const result = resolveProviderConfig({
      GROQ_API_KEY: 'gsk_test',
    });
    expect(result.provider).toBe('groq');
  });

  it('falls back to Ollama when no keys set', () => {
    const result = resolveProviderConfig({});
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('llama3');
  });

  it('uses custom OLLAMA_HOST when set', () => {
    const result = resolveProviderConfig({
      OLLAMA_HOST: 'http://192.168.1.100:11434',
    });
    expect(result.provider).toBe('ollama');
    expect(result.baseUrl).toBe('http://192.168.1.100:11434');
  });

  it('explicit provider overrides all auto-detection', () => {
    const result = resolveProviderConfig({
      COCAPN_PROVIDER: 'groq',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(result.provider).toBe('groq');
  });
});
```

---

## 4. Explain a Codebase

**Prompt:**
```
Explain how the agent loop works in this repo. Walk through a complete
request lifecycle from user message to response.
```

**Agent response:**

```
The agent loop in makerlog.ai follows this lifecycle:

1. REQUEST INGESTION
   POST /api/chat → worker.ts validates the request body, checks billing
   (if enabled), then calls resolveProviderConfig() to determine which LLM
   to use based on environment variables.

2. CONTEXT BUILDING
   The system builds the message array from the user's history (last 20
   messages). In local-bridge mode, the context manager would also inject:
   - soul.md (agent personality)
   - repo-understanding/ (architecture knowledge)
   - Recent git history
   - Relevant memories

3. LLM STREAMING
   ProviderRegistry.chatStream() sends messages to the provider's API.
   It wraps each provider (Anthropic, OpenAI, DeepSeek, Groq, Ollama)
   behind a unified AsyncGenerator interface that yields StreamChunks.

4. TOOL USE LOOP (agentic)
   When the LLM responds with tool_use blocks:
   - The permission system checks: allow/deny/ask
   - The tool is executed (file_read, bash, search, etc.)
   - The result is appended to messages
   - Messages are sent back to the LLM
   - This repeats until the LLM returns text-only or max turns is hit

5. SSE STREAMING
   Text chunks are written as SSE events to the client:
     event: token
     data: {"content": "..."}
   The browser's EventSource or fetch reader reconstructs the response.

6. COST TRACKING
   After the stream ends, token usage and cost are recorded via
   CostTracker → KV + D1 for analytics.

Key difference from Claude Code: makerlog.ai's loop runs on a Cloudflare
Worker (or local bridge), not as a CLI process. The web IDE receives
streaming updates via SSE instead of terminal output.
```

---

## 5. Find and Fix a Bug

**Prompt:**
```
There's a bug: the billing webhook handler crashes when the event has no
userId field. Find it, fix it, and add a guard.
```

**Agent debugging flow:**

```
agent: Let me look at the billing webhook handler.

[tool: file_read("src/billing/index.ts") done]
[tool: search("userId", "src/billing/") — 5 results]

agent: Found it. Line 87 in handleWebhook():

  const userId = event.userId;  // ← no null check
  await this.tracker.record(userId, tokens, cost);  // crashes if userId is undefined

The fix is a guard clause at the top of handleWebhook:

  if (!event.userId) {
    return { ok: false, error: 'Missing userId in billing event' };
  }

[tool: file_edit("src/billing/index.ts", ...) +3 -0 done]
[tool: file_write("tests/billing.webhook.test.ts", ...) new file done]
[tool: bash("npx vitest run tests/billing.webhook.test.ts") 4/4 passing]

done: Fixed the crash + added 4 test cases:
  - rejects event without userId
  - rejects event with empty string userId
  - processes valid event correctly
  - handles missing amount field gracefully
```

---

## More Examples

Have a use case? Submit it at [github.com/Lucineer/makerlog-ai/issues](https://github.com/Lucineer/makerlog-ai/issues).
