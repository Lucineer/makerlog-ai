/**
 * Research Engine — auto-research (Karpathy pattern).
 *
 * When the agent encounters an unknown concept during a session, the
 * research engine can:
 *   1. Generate targeted search queries
 *   2. Fetch relevant documentation (via web search API)
 *   3. Summarize the findings
 *   4. Store the result in memory for future reference
 *
 * This implements the "learn on the fly" behavior: the agent becomes
 * progressively more knowledgeable about the specific domain it serves.
 */

import type { Provider, Message } from '../providers/index.js';

// ── Types ────────────────────────────────────────────────────────────────

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface ResearchResult {
  topic: string;
  depth: ResearchDepth;
  summary: string;
  sources: string[];
  queries: string[];
  timestamp: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  search(query: string, maxResults?: number): Promise<WebSearchResult[]>;
  fetchContent(url: string): Promise<string>;
}

export interface MemoryStore {
  set(key: string, value: string, metadata?: Record<string, unknown>): Promise<void>;
  get(key: string): Promise<string | null>;
}

// ── Depth configuration ──────────────────────────────────────────────────

const DEPTH_CONFIG: Record<ResearchDepth, {
  maxQueries: number;
  maxSources: number;
  fetchPages: number;
  maxSummaryTokens: number;
}> = {
  quick: { maxQueries: 1, maxSources: 3, fetchPages: 1, maxSummaryTokens: 500 },
  standard: { maxQueries: 3, maxSources: 5, fetchPages: 3, maxSummaryTokens: 1500 },
  deep: { maxQueries: 5, maxSources: 10, fetchPages: 5, maxSummaryTokens: 3000 },
};

// ── Patterns that indicate research might be needed ──────────────────────

const RESEARCH_TRIGGERS: RegExp[] = [
  /I('m| am) (not sure|uncertain|unfamiliar) (about|with)/i,
  /I don('t| not) know (how|what|why|if)/i,
  /unclear (what|how|whether)/i,
  /no (documentation|docs|examples?) (available|found)/i,
  /could not find/i,
  /unfamiliar (with|concept)/i,
];

// ── Engine ───────────────────────────────────────────────────────────────

export class ResearchEngine {
  private memory: MemoryStore | null;

  constructor(
    private llm: Provider,
    private webSearch: WebSearchProvider | null = null,
    memory?: MemoryStore,
  ) {
    this.memory = memory ?? null;
  }

  /**
   * Research a topic at the given depth.
   *
   * 1. Generate search queries via LLM
   * 2. Execute web searches (if provider available)
   * 3. Fetch top page content
   * 4. Summarize via LLM
   * 5. Store in memory
   */
  async research(topic: string, depth: ResearchDepth = 'standard'): Promise<ResearchResult> {
    const config = DEPTH_CONFIG[depth];
    const queries = await this.generateQueries(topic, config.maxQueries);

    // Search the web if a provider is available
    let sources: string[] = [];
    let rawContent = '';

    if (this.webSearch) {
      const allResults: WebSearchResult[] = [];
      for (const query of queries) {
        const results = await this.webSearch.search(query, config.maxSources);
        allResults.push(...results);
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      const unique = allResults.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      sources = unique.slice(0, config.maxSources).map((r) => r.url);

      // Fetch content from top results
      const contents: string[] = [];
      for (let i = 0; i < Math.min(config.fetchPages, unique.length); i++) {
        try {
          const pageContent = await this.webSearch.fetchContent(unique[i].url);
          contents.push(`--- ${unique[i].title} (${unique[i].url}) ---\n${pageContent.slice(0, 5000)}`);
        } catch {
          // Skip unreadable pages
        }
      }
      rawContent = contents.join('\n\n');
    }

    // Summarize via LLM
    const summary = await this.summarize(topic, rawContent, config.maxSummaryTokens);

    const result: ResearchResult = {
      topic,
      depth,
      summary,
      sources,
      queries,
      timestamp: Date.now(),
    };

    // Store in memory for future reference
    if (this.memory) {
      const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await this.memory.set(key, JSON.stringify(result), {
        type: 'research',
        depth,
        timestamp: result.timestamp,
      });
    }

    return result;
  }

  /**
   * Auto-detect whether research is needed from a code context string.
   * Returns null if no research is needed, or a topic string if it is.
   */
  async autoResearch(codeContext: string): Promise<string | null> {
    // Check if the context contains any trigger patterns
    const triggered = RESEARCH_TRIGGERS.some((pattern) => pattern.test(codeContext));
    if (!triggered) return null;

    // Ask the LLM to identify the specific topic
    const messages: Message[] = [
      {
        role: 'user',
        content:
          `Given the following context from an AI agent, identify the single most important ` +
          `topic that needs research. Return ONLY the topic as a short phrase, or "NONE" if ` +
          `no research is needed.\n\nContext:\n${codeContext.slice(0, 2000)}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages);
      const topic = response.content.trim();
      if (topic === 'NONE' || topic.length === 0 || topic.length > 200) {
        return null;
      }
      return topic;
    } catch {
      return null;
    }
  }

  /**
   * Check if a topic has been previously researched.
   */
  async hasResearched(topic: string): Promise<boolean> {
    if (!this.memory) return false;
    const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
    const stored = await this.memory.get(key);
    return stored !== null;
  }

  /**
   * Retrieve a previous research result from memory.
   */
  async getResearch(topic: string): Promise<ResearchResult | null> {
    if (!this.memory) return null;
    const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
    const stored = await this.memory.get(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as ResearchResult;
    } catch {
      return null;
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private async generateQueries(topic: string, maxQueries: number): Promise<string[]> {
    const messages: Message[] = [
      {
        role: 'user',
        content:
          `Generate up to ${maxQueries} web search queries to research the topic: "${topic}". ` +
          `Return ONLY a JSON array of query strings, no explanation. ` +
          `Example: ["query 1", "query 2"]`,
      },
    ];

    try {
      const response = await this.llm.chat(messages);
      const text = response.content.trim();
      // Extract JSON array from the response
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as string[];
        return parsed.slice(0, maxQueries);
      }
    } catch {
      // Fall back to the topic itself as a single query
    }
    return [topic];
  }

  private async summarize(
    topic: string,
    rawContent: string,
    maxTokens: number,
  ): Promise<string> {
    const contextSection = rawContent
      ? `\n\nResearch material:\n${rawContent.slice(0, 20_000)}`
      : '\n\n(No web content available — summarize from general knowledge.)';

    const messages: Message[] = [
      {
        role: 'user',
        content:
          `Write a concise, actionable summary about "${topic}" for a software developer. ` +
          `Focus on practical knowledge: what it is, how to use it, common patterns, and gotchas. ` +
          `Keep it under ~${maxTokens} tokens.${contextSection}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages);
      return response.content;
    } catch {
      return `Research on "${topic}" — summary generation failed. Raw content may be available.`;
    }
  }
}
