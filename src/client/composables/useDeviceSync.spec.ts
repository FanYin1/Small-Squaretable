import { describe, it, expect } from 'vitest';
import { useDeviceSync } from './useDeviceSync';

describe('useDeviceSync', () => {
  it('returns handleSyncMessage function', () => {
    const { handleSyncMessage } = useDeviceSync();
    expect(typeof handleSyncMessage).toBe('function');
  });

  it('handleSyncMessage does not throw when called', () => {
    const { handleSyncMessage } = useDeviceSync();
    expect(() =>
      handleSyncMessage({ type: 'device_connected', data: { deviceId: '123' } }),
    ).not.toThrow();
  });
});
