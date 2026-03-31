/**
 * MCP Server — Model Context Protocol server for visiting agents.
 *
 * Exposes repo tools (file_read, search, etc.) and repo intelligence
 * (CLAUDE.md, analysis) via the MCP protocol so that external agents
 * can interact with the repo programmatically.
 *
 * Implements the three core MCP capabilities:
 *   - tools/list, tools/call
 *   - resources/list, resources/read
 *   - initialize
 */

import type { ToolRegistry } from '../tools/index.js';
import { IntelligenceEngine } from './intelligence.js';
import type { Storage } from '../tools/search.js';
import type { Provider } from '../providers/index.js';

// ── MCP types ────────────────────────────────────────────────────────────

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// ── Standard MCP error codes ─────────────────────────────────────────────

const MCP_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
} as const;

// ── Server info ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'makerlog-ai-mcp',
  version: '0.1.0',
};

const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
};

// ── MCP Server ───────────────────────────────────────────────────────────

export class MCPServer {
  private intelligence: IntelligenceEngine;
  private analysisCache: Map<string, unknown> = new Map();

  constructor(
    private tools: ToolRegistry,
    private storage: Storage,
    private llm?: Provider,
  ) {
    this.intelligence = new IntelligenceEngine();
  }

  /**
   * Dispatch an incoming MCP JSON-RPC request.
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'initialize':
          return this.ok(id, {
            protocolVersion: '2024-11-05',
            capabilities: CAPABILITIES,
            serverInfo: SERVER_INFO,
          });

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return this.handleToolsCall(id, params);

        case 'resources/list':
          return this.handleResourcesList(id);

        case 'resources/read':
          return this.handleResourcesRead(id, params);

        default:
          return this.err(id, MCP_ERRORS.METHOD_NOT_FOUND);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.err(id, { ...MCP_ERRORS.INTERNAL_ERROR, message });
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  private handleToolsList(id: string | number | undefined): MCPResponse {
    const definitions = this.tools.getToolDefinitions();
    const mcpTools: MCPTool[] = definitions.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.input_schema,
    }));
    return this.ok(id, { tools: mcpTools });
  }

  private async handleToolsCall(
    id: string | number | undefined,
    params?: Record<string, unknown>,
  ): Promise<MCPResponse> {
    const toolName = params?.name as string;
    const toolInput = (params?.arguments ?? {}) as Record<string, unknown>;

    if (!toolName) {
      return this.err(id, MCP_ERRORS.INVALID_PARAMS);
    }

    if (!this.tools.has(toolName)) {
      return this.err(id, {
        ...MCP_ERRORS.INVALID_PARAMS,
        message: `Unknown tool: ${toolName}`,
      });
    }

    const result = await this.tools.execute(toolName, toolInput);

    return this.ok(id, {
      content: [{ type: 'text', text: result }],
    });
  }

  private async handleResourcesList(
    id: string | number | undefined,
  ): Promise<MCPResponse> {
    const resources: MCPResource[] = [
      {
        uri: 'makerlog://repo/CLAUDE.md',
        name: 'CLAUDE.md',
        description: 'Repository guidance and conventions',
        mimeType: 'text/markdown',
      },
      {
        uri: 'makerlog://repo/analysis',
        name: 'Repo Analysis',
        description: 'Automated repository analysis',
        mimeType: 'application/json',
      },
    ];

    return this.ok(id, { resources });
  }

  private async handleResourcesRead(
    id: string | number | undefined,
    params?: Record<string, unknown>,
  ): Promise<MCPResponse> {
    const uri = params?.uri as string;

    if (uri === 'makerlog://repo/CLAUDE.md') {
      try {
        const content = await this.storage.readFile('CLAUDE.md');
        return this.ok(id, {
          contents: [{ uri, mimeType: 'text/markdown', text: content }],
        });
      } catch {
        // Generate if missing
        const analysis = await this.intelligence.analyzeRepo(this.storage);
        const generated = await this.intelligence.generateClaudeMd(analysis);
        return this.ok(id, {
          contents: [{ uri, mimeType: 'text/markdown', text: generated }],
        });
      }
    }

    if (uri === 'makerlog://repo/analysis') {
      const cached = this.analysisCache.get('analysis');
      if (cached) {
        return this.ok(id, {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(cached, null, 2) }],
        });
      }
      const analysis = await this.intelligence.analyzeRepo(this.storage);
      this.analysisCache.set('analysis', analysis);
      return this.ok(id, {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(analysis, null, 2) }],
      });
    }

    return this.err(id, { ...MCP_ERRORS.INVALID_PARAMS, message: `Unknown resource: ${uri}` });
  }

  // ── Response helpers ─────────────────────────────────────────────────

  private ok(id: string | number | undefined, result: unknown): MCPResponse {
    return { jsonrpc: '2.0', id: id ?? null, result };
  }

  private err(
    id: string | number | undefined,
    error: { code: number; message: string },
  ): MCPResponse {
    return { jsonrpc: '2.0', id: id ?? null, error };
  }
}
