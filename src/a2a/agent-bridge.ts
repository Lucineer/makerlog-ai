/**
 * agent-bridge.ts — Cross-agent communication bridge.
 *
 * Connects makerlog-ai to other cocapn agents (dmlog, fishinglog, etc.)
 * for sharing context, requesting help, and coordinating tasks.
 *
 * Uses the A2A protocol defined in src/agent/a2a.ts as the wire format,
 * with HTTP/WebSocket transport for cross-repo communication.
 */

import { type A2AMessage, type A2AResponse, type AgentPeer, A2AProtocol } from '../agent/a2a.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface BridgeConfig {
  /** This agent's identity (e.g., "makerlog-ai") */
  agentId: string;
  /** Base URL for this agent's HTTP endpoint */
  localEndpoint?: string;
  /** Authentication token for outbound connections */
  authToken?: string;
  /** Capabilities this agent advertises */
  capabilities?: string[];
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Maximum number of connected peers */
  maxPeers?: number;
  /** Heartbeat interval in milliseconds (0 = disabled) */
  heartbeatInterval?: number;
}

export interface ConnectionOptions {
  auth?: string;
  capabilities?: string[];
}

export interface HelpRequest {
  task: string;
  context?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  deadline?: string; // ISO timestamp
}

export interface HelpResponse {
  accepted: boolean;
  result?: Record<string, unknown>;
  error?: string;
  from: string;
  timestamp: number;
}

export interface SharedContext {
  files?: Array<{ path: string; content: string }>;
  summary?: string;
  tags?: string[];
}

// ── Agent Bridge ─────────────────────────────────────────────────────────

export class AgentBridge {
  private protocol: A2AProtocol;
  private config: BridgeConfig;
  private connections: Map<string, { url: string; auth?: string; peer?: AgentPeer }> = new Map();
  private messageQueue: A2AMessage[] = [];
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.protocol = new A2AProtocol({
      requestTimeout: config.requestTimeout ?? 30_000,
      maxPeers: config.maxPeers ?? 50,
    });

    // Start heartbeat if configured
    if (config.heartbeatInterval && config.heartbeatInterval > 0) {
      this.startHeartbeat(config.heartbeatInterval);
    }
  }

  /**
   * Connect to another cocapn agent.
   * Discovers capabilities via /api/mcp endpoint.
   */
  async connectToAgent(
    agentUrl: string,
    options: ConnectionOptions = {},
  ): Promise<AgentPeer> {
    const url = agentUrl.replace(/\/$/, '');

    // Fetch capabilities from the remote agent's MCP discovery endpoint
    let capabilities: string[] = [];
    let agentId = url;

    try {
      const headers: Record<string, string> = {};
      if (options.auth) {
        headers['authorization'] = `Bearer ${options.auth}`;
      }

      const res = await fetch(`${url}/api/mcp`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json() as {
          name?: string;
          capabilities?: { tools?: string[] };
        };
        agentId = data.name ?? url;
        capabilities = data.capabilities?.tools ?? [];
      }
    } catch {
      // Agent might be offline or not have MCP endpoint — proceed with defaults
      capabilities = options.capabilities ?? [];
    }

    const peer: AgentPeer = {
      id: agentId,
      capabilities,
      lastSeen: Date.now(),
      endpoint: url,
    };

    this.connections.set(agentId, { url, auth: options.auth, peer });
    this.protocol.handleMessage(
      {
        type: 'heartbeat',
        from: agentId,
        timestamp: Date.now(),
      },
      capabilities,
    );

    return peer;
  }

  /**
   * Send a message to a connected agent.
   */
  async sendMessage(
    agentId: string,
    message: string,
  ): Promise<A2AResponse> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return {
        status: 'error',
        from: this.config.agentId,
        to: agentId,
        error: `Not connected to agent "${agentId}". Call connectToAgent() first.`,
        timestamp: Date.now(),
      };
    }

    const a2aMessage: A2AMessage = {
      type: 'request',
      from: this.config.agentId,
      to: agentId,
      task: message,
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
    };

    return this.sendOverTransport(a2aMessage, connection);
  }

  /**
   * Get all pending messages from other agents.
   */
  receiveMessages(): A2AMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }

  /**
   * Share code context with another agent.
   */
  async shareContext(
    agentId: string,
    context: SharedContext,
  ): Promise<A2AResponse> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return {
        status: 'error',
        from: this.config.agentId,
        to: agentId,
        error: `Not connected to agent "${agentId}".`,
        timestamp: Date.now(),
      };
    }

    const message: A2AMessage = {
      type: 'request',
      from: this.config.agentId,
      to: agentId,
      capability: 'context-sharing',
      task: 'share-context',
      payload: {
        files: context.files,
        summary: context.summary,
        tags: context.tags,
      },
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
    };

    return this.sendOverTransport(message, connection);
  }

  /**
   * Request another agent to help with a task.
   */
  async requestHelp(
    agentId: string,
    task: HelpRequest,
  ): Promise<HelpResponse> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return {
        accepted: false,
        error: `Not connected to agent "${agentId}".`,
        from: this.config.agentId,
        timestamp: Date.now(),
      };
    }

    // Find the best capability match for this task
    const capability = this.matchCapability(task.task, connection.peer?.capabilities ?? []);

    const message: A2AMessage = {
      type: 'request',
      from: this.config.agentId,
      to: agentId,
      capability,
      task: task.task,
      payload: {
        context: task.context,
        priority: task.priority ?? 'normal',
        deadline: task.deadline,
      },
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
    };

    const response = await this.sendOverTransport(message, connection);

    return {
      accepted: response.status === 'ok',
      result: response.payload,
      error: response.error,
      from: response.from,
      timestamp: response.timestamp,
    };
  }

  /**
   * Handle an incoming message from a remote agent.
   */
  async handleIncoming(message: A2AMessage): Promise<A2AResponse> {
    // Queue the message for receiveMessages()
    this.messageQueue.push(message);

    // Let the A2A protocol handle it
    return this.protocol.handleMessage(
      message,
      this.config.capabilities ?? [],
    );
  }

  /**
   * Get all connected peers.
   */
  getConnectedAgents(): AgentPeer[] {
    return this.protocol.getPeers();
  }

  /**
   * Get peers that advertise a specific capability.
   */
  getAgentsByCapability(capability: string): AgentPeer[] {
    return this.protocol.getPeersByCapability(capability);
  }

  /**
   * Disconnect from a specific agent.
   */
  disconnect(agentId: string): void {
    this.connections.delete(agentId);
  }

  /**
   * Shut down the bridge, stopping heartbeats.
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.connections.clear();
    this.messageQueue = [];
  }

  // ── Internal ───────────────────────────────────────────────────────

  private async sendOverTransport(
    message: A2AMessage,
    connection: { url: string; auth?: string },
  ): Promise<A2AResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (connection.auth) {
      headers['authorization'] = `Bearer ${connection.auth}`;
    }

    try {
      const res = await fetch(`${connection.url}/api/a2a`, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.config.requestTimeout ?? 30_000),
      });

      if (!res.ok) {
        return {
          status: 'error',
          from: connection.url,
          to: this.config.agentId,
          error: `HTTP ${res.status}: ${res.statusText}`,
          timestamp: Date.now(),
        };
      }

      return await res.json() as A2AResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        from: connection.url,
        to: this.config.agentId,
        error: `Transport error: ${msg}`,
        timestamp: Date.now(),
      };
    }
  }

  private matchCapability(taskDescription: string, available: string[]): string {
    const lower = taskDescription.toLowerCase();

    // Direct capability match
    for (const cap of available) {
      if (lower.includes(cap)) return cap;
    }

    // Keyword matching
    const keywordMap: Record<string, string[]> = {
      'asset-generation': ['image', 'icon', 'logo', 'sprite', 'asset', 'generate'],
      'vision': ['vision', 'see', 'look', 'visual', 'screenshot'],
      'code-gen': ['code', 'generate', 'write', 'build', 'create'],
      'testing': ['test', 'spec', 'coverage', 'verify'],
      'data': ['data', 'database', 'query', 'store', 'fetch'],
      'game': ['game', 'ttrpg', 'dnd', 'campaign', 'dmlog'],
      'fishing': ['fish', 'catch', 'vessel', 'fishinglog'],
    };

    for (const [cap, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(kw => lower.includes(kw)) && available.includes(cap)) {
        return cap;
      }
    }

    return available[0] ?? 'general';
  }

  private startHeartbeat(intervalMs: number): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [id, connection] of this.connections) {
        const message: A2AMessage = {
          type: 'heartbeat',
          from: this.config.agentId,
          to: id,
          timestamp: Date.now(),
        };
        this.sendOverTransport(message, connection).catch(() => {
          // Heartbeat failure — mark peer as stale
        });
      }
    }, intervalMs);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
