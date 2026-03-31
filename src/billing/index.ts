/**
 * BillingManager — Usage tracking and billing for makerlog-ai.
 *
 * Supports D1 for persistent records and KV for fast quota lookups.
 * Pricing model: hourly compute charge + per-token charge for premium models.
 */

export interface BillingEvent {
  type: 'low_balance' | 'payment_received' | 'subscription_renewed' | 'subscription_cancelled';
  userId: string;
  amount?: number;
  currency?: string;
  timestamp?: string;
}

export interface Bill {
  userId: string;
  period: string;
  computeHours: number;
  tokens: { input: number; output: number };
  totalCost: number;
  currency: string;
}

export interface UsageReport {
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number }>;
  byDay: Array<{ date: string; tokens: number; cost: number }>;
}

interface UsageRow {
  user_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  recorded_at: string;
}

interface QuotaData {
  allowed: boolean;
  remaining: number;
  limit: number;
  periodEnd: string;
}

export class BillingManager {
  constructor(
    private db: D1Database,
    private kv: KVNamespace,
  ) {}

  /** Record token usage and cost for a user. */
  async trackUsage(userId: string, tokens: number, cost: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage (user_id, model, input_tokens, output_tokens, cost, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(userId, 'default', tokens, 0, cost, new Date().toISOString())
      .run();

    // Update fast KV quota counter
    const key = `quota:${userId}:${this.currentPeriodKey()}`;
    const current = (await this.kv.get<number>(key, 'json')) ?? 0;
    await this.kv.put(key, JSON.stringify(current + cost), {
      expirationTtl: 86400 * 31, // 31 days
    });
  }

  /**
   * Calculate charges for a user over a given period.
   * Combines compute hours (tracked separately) with token costs.
   */
  async calculateCharge(userId: string, period: 'hour' | 'day' | 'month'): Promise<Bill> {
    const since = this.periodStartDate(period);

    const rows = await this.db
      .prepare(
        `SELECT input_tokens, output_tokens, cost, recorded_at
         FROM usage
         WHERE user_id = ? AND recorded_at >= ?`,
      )
      .bind(userId, since)
      .all<UsageRow>();

    const inputTokens = rows.results.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0);
    const outputTokens = rows.results.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0);
    const tokenCost = rows.results.reduce((sum, r) => sum + (r.cost ?? 0), 0);

    // Compute hours: rough estimate based on active usage records
    const activeMinutes = rows.results.length;
    const computeHours = activeMinutes / 60;

    return {
      userId,
      period,
      computeHours: Math.round(computeHours * 100) / 100,
      tokens: { input: inputTokens, output: outputTokens },
      totalCost: Math.round((tokenCost + computeHours * 0.05) * 100) / 100,
      currency: 'USD',
    };
  }

  /** Check whether a user is allowed to make a request. */
  async checkAccess(userId: string): Promise<{ allowed: boolean; remaining?: number }> {
    const key = `quota:${userId}:${this.currentPeriodKey()}`;
    const used = (await this.kv.get<number>(key, 'json')) ?? 0;
    const limit = 10.0; // $10 default monthly limit

    if (used >= limit) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.round((limit - used) * 100) / 100 };
  }

  /** Handle a billing webhook event (Stripe, Lemon Squeezy, etc.). */
  async handleWebhook(event: BillingEvent): Promise<void> {
    switch (event.type) {
      case 'payment_received':
      case 'subscription_renewed': {
        // Reset or extend the user's quota
        const key = `quota:${event.userId}:${this.currentPeriodKey()}`;
        await this.kv.put(key, JSON.stringify(0), { expirationTtl: 86400 * 31 });
        break;
      }
      case 'subscription_cancelled': {
        // Mark user as cancelled — will be blocked on next period
        await this.kv.put(`cancelled:${event.userId}`, JSON.stringify(true));
        break;
      }
      case 'low_balance': {
        // Could trigger a notification — no-op for now
        break;
      }
    }
  }

  /** Build a detailed usage report for a user. */
  async getUsageReport(userId: string): Promise<UsageReport> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await this.db
      .prepare(
        `SELECT model, input_tokens, output_tokens, cost, recorded_at
         FROM usage
         WHERE user_id = ? AND recorded_at >= ?
         ORDER BY recorded_at DESC`,
      )
      .bind(userId, thirtyDaysAgo.toISOString())
      .all<UsageRow>();

    const byModel: Record<string, { tokens: number; cost: number }> = {};
    const byDayMap: Record<string, { tokens: number; cost: number }> = {};

    let totalTokens = 0;
    let totalCost = 0;

    for (const row of rows.results) {
      const model = row.model ?? 'unknown';
      const tokens = (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
      const cost = row.cost ?? 0;

      totalTokens += tokens;
      totalCost += cost;

      if (!byModel[model]) byModel[model] = { tokens: 0, cost: 0 };
      byModel[model].tokens += tokens;
      byModel[model].cost += cost;

      const day = (row.recorded_at ?? '').slice(0, 10);
      if (!byDayMap[day]) byDayMap[day] = { tokens: 0, cost: 0 };
      byDayMap[day].tokens += tokens;
      byDayMap[day].cost += cost;
    }

    const byDay = Object.entries(byDayMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalTokens,
      totalCost: Math.round(totalCost * 100) / 100,
      byModel,
      byDay,
    };
  }

  // --- Helpers ---

  private currentPeriodKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private periodStartDate(period: 'hour' | 'day' | 'month'): string {
    const now = new Date();
    switch (period) {
      case 'hour':
        now.setUTCMinutes(0, 0, 0);
        break;
      case 'day':
        now.setUTCHours(0, 0, 0, 0);
        break;
      case 'month':
        now.setUTCDate(1);
        now.setUTCHours(0, 0, 0, 0);
        break;
    }
    return now.toISOString();
  }
}
