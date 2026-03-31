/**
 * DiscordChannel — Discord bot interaction connector for makerlog-ai.
 *
 * Handles incoming interactions (slash commands & messages) via webhook,
 * sends responses back using Discord's API, and registers slash commands.
 */

export interface ChannelMessage {
  userId: string;
  text: string;
  channel: 'discord';
  metadata: Record<string, unknown>;
}

interface DiscordInteraction {
  type: number; // 1 = PING, 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT
  id: string;
  token: string;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string | number | boolean }>;
    custom_id?: string;
  };
  member?: {
    user: { id: string; username: string; global_name?: string };
  };
  user?: { id: string; username: string; global_name?: string };
  channel_id?: string;
  guild_id?: string;
}

const SLASH_COMMANDS = [
  { name: 'code', description: 'Generate or edit code' },
  { name: 'explain', description: 'Explain code or a concept' },
  { name: 'search', description: 'Search the codebase' },
  { name: 'status', description: 'Show system status' },
] as const;

export class DiscordChannel {
  private readonly apiBase = 'https://discord.com/api/v10';

  constructor(
    private applicationId: string,
    private botToken: string,
  ) {}

  /** Handle an incoming Discord interaction and normalize it. */
  async handleWebhook(interaction: DiscordInteraction): Promise<ChannelMessage | null> {
    // PING — must respond with type 1
    if (interaction.type === 1) {
      return null;
    }

    // Slash command
    if (interaction.type === 2 && interaction.data?.name) {
      const user = interaction.member?.user ?? interaction.user;
      const argsText = (interaction.data.options ?? [])
        .map((o) => String(o.value))
        .join(' ');

      return {
        userId: user?.id ?? 'unknown',
        text: `/${interaction.data.name} ${argsText}`.trim(),
        channel: 'discord',
        metadata: {
          interactionId: interaction.id,
          interactionToken: interaction.token,
          commandName: interaction.data.name,
          username: user?.username ?? null,
          channelId: interaction.channel_id ?? null,
          guildId: interaction.guild_id ?? null,
        },
      };
    }

    return null;
  }

  /** Send a follow-up message to an interaction. */
  async sendFollowup(interactionToken: string, text: string): Promise<void> {
    const formatted = this.formatResponse(text);

    const res = await fetch(
      `${this.apiBase}/webhooks/${this.applicationId}/${interactionToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: formatted }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord followup failed (${res.status}): ${body}`);
    }
  }

  /** Register slash commands for a guild (or globally if guildId omitted). */
  async registerCommands(guildId?: string): Promise<void> {
    const endpoint = guildId
      ? `${this.apiBase}/applications/${this.applicationId}/guilds/${guildId}/commands`
      : `${this.apiBase}/applications/${this.applicationId}/commands`;

    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(SLASH_COMMANDS),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord command registration failed (${res.status}): ${body}`);
    }
  }

  /**
   * Format agent response for Discord.
   *
   * Discord uses standard markdown. We truncate to 2000 chars (Discord limit)
   * and wrap long code blocks in a shorter form.
   */
  formatResponse(text: string): string {
    // Discord message limit is 2000 characters
    if (text.length > 1990) {
      return text.slice(0, 1980) + '\n... (truncated)';
    }
    return text;
  }

  /** Build the PING response that Discord expects. */
  static pingResponse(): { type: number } {
    return { type: 1 };
  }
}
