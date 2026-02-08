/**
 * EventBus 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.service';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on / emit', () => {
    it('should call handler when event is emitted', async () => {
      const handler = vi.fn();
      bus.on('test.event', handler);
      await bus.emit('test.event', { key: 'value' });
      expect(handler).toHaveBeenCalledWith({ key: 'value' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple handlers for same event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      await bus.emit('test.event', { data: 1 });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handler for different event', async () => {
      const handler = vi.fn();
      bus.on('event.a', handler);
      await bus.emit('event.b', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call wildcard handler for any event', async () => {
      const handler = vi.fn();
      bus.on('*', handler);
      await bus.emit('some.event', { x: 1 });
      expect(handler).toHaveBeenCalledWith('some.event', { x: 1 });
    });
  });

  describe('off', () => {
    it('should remove handler', async () => {
      const handler = vi.fn();
      bus.on('test.event', handler);
      bus.off('test.event', handler);
      await bus.emit('test.event', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should call handler only once', async () => {
      const handler = vi.fn();
      bus.once('test.event', handler);
      await bus.emit('test.event', { a: 1 });
      await bus.emit('test.event', { a: 2 });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ a: 1 });
    });
  });

  describe('error handling', () => {
    it('should not throw if handler throws', async () => {
      bus.on('test.event', () => { throw new Error('boom'); });
      await expect(bus.emit('test.event', {})).resolves.not.toThrow();
    });

    it('should continue calling other handlers if one throws', async () => {
      const handler2 = vi.fn();
      bus.on('test.event', () => { throw new Error('boom'); });
      bus.on('test.event', handler2);
      await bus.emit('test.event', {});
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
