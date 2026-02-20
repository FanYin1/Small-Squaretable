/**
 * TOTP Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToDataURL } = vi.hoisted(() => ({
  mockToDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fakequrcode'),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mockToDataURL },
}));

vi.mock('../../core/config', () => ({
  config: {
    jwtSecret: 'a]'.repeat(16),
    totpEncryptionKey: 'b'.repeat(32),
  },
}));

import { totpService } from './totp.service';
import { TOTP, Secret } from 'otpauth';

describe('totpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encrypt / decrypt round-trip', () => {
    it('should decrypt to the original plaintext', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP';
      const encrypted = totpService.encrypt(plaintext);
      const decrypted = totpService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt with tampered ciphertext', () => {
    it('should throw when ciphertext is tampered', () => {
      const encrypted = totpService.encrypt('some-secret');
      const parts = encrypted.split(':');
      // Flip a character in the ciphertext portion
      const tampered = parts[2].split('');
      tampered[0] = tampered[0] === 'a' ? 'b' : 'a';
      const tamperedEncrypted = `${parts[0]}:${parts[1]}:${tampered.join('')}`;
      expect(() => totpService.decrypt(tamperedEncrypted)).toThrow();
    });
  });

  describe('generateSetup', () => {
    it('should return encryptedSecret, uri, qrDataUrl, and base32Secret', async () => {
      const result = await totpService.generateSetup('user@example.com');

      expect(result).toHaveProperty('encryptedSecret');
      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('qrDataUrl');
      expect(result).toHaveProperty('base32Secret');

      expect(result.encryptedSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(result.uri).toContain('otpauth://totp/');
      expect(result.qrDataUrl).toBe('data:image/png;base64,fakequrcode');
      expect(result.base32Secret).toBeTruthy();

      expect(mockToDataURL).toHaveBeenCalledOnce();
    });
  });

  describe('verify', () => {
    it('should return true for a valid TOTP code', () => {
      const secret = new Secret({ size: 20 });
      const encryptedSecret = totpService.encrypt(secret.base32);

      const totp = new TOTP({
        issuer: 'SmallSquaretable',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      const validCode = totp.generate();

      expect(totpService.verify(encryptedSecret, validCode)).toBe(true);
    });

    it('should return false for an invalid code', () => {
      const secret = new Secret({ size: 20 });
      const encryptedSecret = totpService.encrypt(secret.base32);

      expect(totpService.verify(encryptedSecret, '000000')).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should return 10 plain codes and 10 hashed codes', async () => {
      const { plainCodes, hashedCodes } = await totpService.generateBackupCodes();

      expect(plainCodes).toHaveLength(10);
      expect(hashedCodes).toHaveLength(10);

      // Plain codes should be 8-char hex strings
      for (const code of plainCodes) {
        expect(code).toMatch(/^[0-9a-f]{8}$/);
      }

      // Hashed codes should be bcrypt hashes
      for (const hash of hashedCodes) {
        expect(hash).toMatch(/^\$2[aby]\$/);
      }
    });
  });

  describe('verifyBackupCode', () => {
    it('should return the matching record for a valid backup code', async () => {
      const { plainCodes, hashedCodes } = await totpService.generateBackupCodes();

      const fakeRecords = hashedCodes.map((hash, i) => ({
        id: `id-${i}`,
        userId: 'user-1',
        codeHash: hash,
        usedAt: null,
        createdAt: new Date(),
      }));

      const result = await totpService.verifyBackupCode(plainCodes[0], fakeRecords);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('id-0');
    });

    it('should return null for a wrong code', async () => {
      const { hashedCodes } = await totpService.generateBackupCodes();

      const fakeRecords = hashedCodes.map((hash, i) => ({
        id: `id-${i}`,
        userId: 'user-1',
        codeHash: hash,
        usedAt: null,
        createdAt: new Date(),
      }));

      const result = await totpService.verifyBackupCode('deadbeef', fakeRecords);
      expect(result).toBeNull();
    });
  });
});
