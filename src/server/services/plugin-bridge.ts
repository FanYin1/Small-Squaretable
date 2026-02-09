/**
 * Plugin EventBus Bridge
 *
 * Bridges EventBus events to plugin sandboxes.
 * For 'chat.message.before' events, uses a pipeline pattern where each plugin
 * can modify the payload before passing to the next.
 * For all other events, dispatches fire-and-forget.
 */

import type { EventBus, WildcardHandler } from './event-bus.service';
import type { PluginService } from './plugin.service';
import { PLUGIN_EVENTS } from '../../types/plugin';

const PIPELINE_EVENTS = ['chat.message.before'] as const;

export class PluginBridge {
  private handler: WildcardHandler | null = null;

  constructor(
    private pluginService: PluginService,
    private eventBus: EventBus,
  ) {}

  start(): void {
    this.handler = async (event: string, payload: Record<string, unknown>) => {
      await this.handleEvent(event, payload);
    };
    this.eventBus.on('*', this.handler);
  }

  stop(): void {
    if (this.handler) {
      this.eventBus.off('*', this.handler as any);
      this.handler = null;
    }
  }

  async handleEvent(event: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!PLUGIN_EVENTS.includes(event as any)) return payload;

    const userId = payload.userId as string | undefined;
    if (!userId) return payload;

    try {
      if (this.isPipelineEvent(event)) {
        return await this.processPipeline(userId, event, payload);
      } else {
        this.pluginService.executeEvent(userId, event, payload).catch((err) => {
          console.error(`[PluginBridge] Error dispatching event "${event}":`, err);
        });
        return payload;
      }
    } catch (error) {
      console.error(`[PluginBridge] Error handling event "${event}":`, error);
      return payload;
    }
  }

  private async processPipeline(userId: string, event: string, payload: unknown): Promise<unknown> {
    const results = await this.pluginService.executeEvent(userId, event, payload);
    let finalPayload = payload;
    for (const result of results) {
      if (result.success && result.output !== undefined) {
        finalPayload = result.output;
      }
    }
    return finalPayload;
  }

  private isPipelineEvent(event: string): boolean {
    return (PIPELINE_EVENTS as readonly string[]).includes(event);
  }
}

import { pluginService } from './plugin.service';
import { eventBus } from './event-bus.service';
export const pluginBridge = new PluginBridge(pluginService, eventBus);