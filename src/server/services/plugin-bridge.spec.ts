/**
 * PluginBridge unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginBridge } from './plugin-bridge';

// ── Mock factories ──

function createMockPluginService() {
  return {
    executeEvent: vi.fn().mockResolvedValue([]),
  };
}

function createMockEventBus() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

type MockPluginService = ReturnType<typeof createMockPluginService>;
type MockEventBus = ReturnType<typeof createMockEventBus>;

describe('PluginBridge', () => {
  let bridge: PluginBridge;
  let mockPluginService: MockPluginService;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockPluginService = createMockPluginService();
    mockEventBus = createMockEventBus();
    bridge = new PluginBridge(mockPluginService as any, mockEventBus as any);
  });

  // ── 1. start() registers wildcard listener ──
  describe('start()', () => {
    it('should register a wildcard listener on EventBus', () => {
      bridge.start();
      expect(mockEventBus.on).toHaveBeenCalledTimes(1);
      expect(mockEventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
    });
  });

  // ── 2. stop() removes wildcard listener ──
  describe('stop()', () => {
    it('should remove the wildcard listener from EventBus', () => {
      bridge.start();
      const registeredHandler = mockEventBus.on.mock.calls[0][1];
      bridge.stop();
      expect(mockEventBus.off).toHaveBeenCalledTimes(1);
      expect(mockEventBus.off).toHaveBeenCalledWith('*', registeredHandler);
    });

    it('should do nothing if not started', () => {
      bridge.stop();
      expect(mockEventBus.off).not.toHaveBeenCalled();
    });
  });

  // ── 3-9. handleEvent tests ──
  describe('handleEvent()', () => {
    // 3. dispatches chat.message.before to pluginService.executeEvent
    it('should dispatch chat.message.before to pluginService.executeEvent', async () => {
      const payload = { userId: 'user-1', content: 'hello' };
      mockPluginService.executeEvent.mockResolvedValue([]);
      await bridge.handleEvent('chat.message.before', payload);
      expect(mockPluginService.executeEvent).toHaveBeenCalledWith('user-1', 'chat.message.before', payload);
    });

    // 4. for chat.message.before, returns modified payload from pipeline
    it('should return modified payload from pipeline for chat.message.before', async () => {
      const payload = { userId: 'user-1', content: 'original' };
      mockPluginService.executeEvent.mockResolvedValue([
        { success: true, duration: 5, output: { userId: 'user-1', content: 'modified' } },
      ]);
      const result = await bridge.handleEvent('chat.message.before', payload);
      expect(result).toEqual({ userId: 'user-1', content: 'modified' });
    });

    // 5. for character.created, fire-and-forget (returns original payload)
    it('should return original payload for fire-and-forget events like character.created', async () => {
      const payload = { userId: 'user-1', characterId: 'char-1' };
      mockPluginService.executeEvent.mockResolvedValue([]);
      const result = await bridge.handleEvent('character.created', payload);
      expect(result).toEqual(payload);
      // executeEvent is called but not awaited in the main flow (fire-and-forget)
      // We need to flush the microtask queue
      await vi.waitFor(() => {
        expect(mockPluginService.executeEvent).toHaveBeenCalledWith('user-1', 'character.created', payload);
      });
    });

    // 6. ignores events not in PLUGIN_EVENTS list
    it('should ignore events not in PLUGIN_EVENTS list', async () => {
      const payload = { userId: 'user-1', data: 'test' };
      const result = await bridge.handleEvent('unknown.event', payload);
      expect(result).toEqual(payload);
      expect(mockPluginService.executeEvent).not.toHaveBeenCalled();
    });

    // 7. handles pluginService errors gracefully (returns original payload)
    it('should handle pluginService errors gracefully and return original payload', async () => {
      const payload = { userId: 'user-1', content: 'hello' };
      mockPluginService.executeEvent.mockRejectedValue(new Error('sandbox crash'));
      const result = await bridge.handleEvent('chat.message.before', payload);
      expect(result).toEqual(payload);
    });

    // 8. returns original payload when no userId in payload
    it('should return original payload when no userId in payload', async () => {
      const payload = { content: 'no user' };
      const result = await bridge.handleEvent('chat.message.before', payload);
      expect(result).toEqual(payload);
      expect(mockPluginService.executeEvent).not.toHaveBeenCalled();
    });

    // 9. processPipeline chains multiple plugin results for before events
    it('should chain multiple plugin results for chat.message.before pipeline', async () => {
      const payload = { userId: 'user-1', content: 'step0' };
      mockPluginService.executeEvent.mockResolvedValue([
        { success: true, duration: 3, output: { userId: 'user-1', content: 'step1' } },
        { success: true, duration: 2, output: { userId: 'user-1', content: 'step2' } },
      ]);
      const result = await bridge.handleEvent('chat.message.before', payload);
      expect(result).toEqual({ userId: 'user-1', content: 'step2' });
    });

    // 10. pipeline skips failed plugin results
    it('should skip failed plugin results in pipeline and use last successful output', async () => {
      const payload = { userId: 'user-1', content: 'original' };
      mockPluginService.executeEvent.mockResolvedValue([
        { success: true, duration: 3, output: { userId: 'user-1', content: 'modified' } },
        { success: false, duration: 1, error: 'plugin error' },
      ]);
      const result = await bridge.handleEvent('chat.message.before', payload);
      expect(result).toEqual({ userId: 'user-1', content: 'modified' });
    });

    // 11. fire-and-forget logs errors without throwing
    it('should log errors from fire-and-forget dispatch without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const payload = { userId: 'user-1', characterId: 'char-1' };
      mockPluginService.executeEvent.mockRejectedValue(new Error('dispatch fail'));
      const result = await bridge.handleEvent('character.created', payload);
      expect(result).toEqual(payload);
      // Wait for the fire-and-forget promise to settle
      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PluginBridge] Error dispatching event "character.created"'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
