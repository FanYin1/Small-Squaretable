import { describe, it, expect } from 'vitest';
import { pushService } from './push.service';

describe('pushService', () => {
  it('isSubscribed returns false when PushManager not available', async () => {
    const result = await pushService.isSubscribed();
    expect(result).toBe(false);
  });

  it('subscribe returns false when serviceWorker not available', async () => {
    const result = await pushService.subscribe();
    expect(result).toBe(false);
  });
});
