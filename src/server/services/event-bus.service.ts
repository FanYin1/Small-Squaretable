/**
 * 事件总线服务
 *
 * 进程内事件发布/订阅，作为 Webhook 和通知系统的基础
 */

import { logger } from './logger.service';

const busLogger = logger.child({ module: 'event-bus' });

export type EventHandler = (...args: unknown[]) => void | Promise<void>;
export type WildcardHandler = (event: string, payload: Record<string, unknown>) => void | Promise<void>;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private wildcardHandlers: Set<(event: string, payload: Record<string, unknown>) => void | Promise<void>> = new Set();

  on(event: '*', handler: WildcardHandler): void;
  on(event: string, handler: EventHandler): void;
  on(event: string, handler: EventHandler | WildcardHandler): void {
    if (event === '*') {
      this.wildcardHandlers.add(handler as (event: string, payload: Record<string, unknown>) => void | Promise<void>);
      return;
    }
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
  }

  off(event: '*', handler: WildcardHandler): void;
  off(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler | WildcardHandler): void {
    if (event === '*') {
      this.wildcardHandlers.delete(handler as (event: string, payload: Record<string, unknown>) => void | Promise<void>);
      return;
    }
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  once(event: string, handler: EventHandler): void {
    const wrapper: EventHandler = (...args: unknown[]) => {
      this.off(event, wrapper);
      return handler(...args);
    };
    this.on(event, wrapper);
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(payload);
        } catch (error) {
          busLogger.error(`Handler error for event "${event}"`, error as Error);
        }
      }
    }

    for (const handler of this.wildcardHandlers) {
      try {
        await handler(event, payload);
      } catch (error) {
        busLogger.error(`Wildcard handler error for event "${event}"`, error as Error);
      }
    }
  }

  listenerCount(event: string): number {
    if (event === '*') return this.wildcardHandlers.size;
    return this.handlers.get(event)?.size ?? 0;
  }
}

export const eventBus = new EventBus();
