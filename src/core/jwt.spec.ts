import { describe, it, expect, vi } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';

describe('JWT Module', () => {
  const mockPayload = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    tenantId: '123e4567-e89b-12d3-a456-426614174001',
    email: 'test@example.com',
  };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', async () => {
      const token = await generateAccessToken(mockPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', async () => {
      const token = await generateRefreshToken(mockPayload.userId);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', async () => {
      const token = await generateAccessToken(mockPayload);
      const payload = await verifyAccessToken(token);
      expect(payload.userId).toBe(mockPayload.userId);
      expect(payload.tenantId).toBe(mockPayload.tenantId);
      expect(payload.email).toBe(mockPayload.email);
    });

    it('should throw on invalid token', async () => {
      await expect(verifyAccessToken('invalid.token.here')).rejects.toThrow();
    });

    it('should throw on expired token', async () => {
      vi.useFakeTimers();
      const token = await generateAccessToken(mockPayload);
      vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes
      await expect(verifyAccessToken(token)).rejects.toThrow();
      vi.useRealTimers();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', async () => {
      const token = await generateRefreshToken(mockPayload.userId);
      const payload = await verifyRefreshToken(token);
      expect(payload.userId).toBe(mockPayload.userId);
    });
  });
});
