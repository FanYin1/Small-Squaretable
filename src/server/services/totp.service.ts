/**
 * TOTP Service
 *
 * Handles TOTP secret generation, verification, backup code management,
 * and AES-256-GCM encryption for storing secrets at rest.
 */

import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../../core/config';
import type { BackupCode } from '../../db/schema/backup-codes';

const ENCRYPTION_KEY = crypto.createHash('sha256').update(config.jwtSecret).digest();
const APP_NAME = 'SmallSquaretable';
const BACKUP_CODE_COUNT = 10;
const SALT_ROUNDS = 10;

export const totpService = {
  /**
   * Generate a new TOTP secret and QR code for setup.
   */
  async generateSetup(email: string): Promise<{
    encryptedSecret: string;
    uri: string;
    qrDataUrl: string;
    base32Secret: string;
  }> {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: APP_NAME,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri);
    const encryptedSecret = this.encrypt(secret.base32);

    return {
      encryptedSecret,
      uri,
      qrDataUrl,
      base32Secret: secret.base32,
    };
  },
  /**
   * Verify a TOTP code against an encrypted secret.
   * Allows a window of +/- 1 period (30s).
   */
  verify(encryptedSecret: string, code: string): boolean {
    const base32Secret = this.decrypt(encryptedSecret);
    const totp = new TOTP({
      issuer: APP_NAME,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(base32Secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  },

  /**
   * Generate backup codes (plain + hashed).
   */
  async generateBackupCodes(): Promise<{
    plainCodes: string[];
    hashedCodes: string[];
  }> {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const code = crypto.randomBytes(4).toString('hex'); // 8-char hex code
      plainCodes.push(code);
      const hash = await bcrypt.hash(code, SALT_ROUNDS);
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  },

  /**
   * Verify a backup code against stored hashes.
   * Returns the matching BackupCode record or null.
   */
  async verifyBackupCode(
    code: string,
    hashedCodes: BackupCode[],
  ): Promise<BackupCode | null> {
    for (const record of hashedCodes) {
      const match = await bcrypt.compare(code, record.codeHash);
      if (match) return record;
    }
    return null;
  },
  /**
   * AES-256-GCM encrypt a plaintext string.
   * Returns iv:authTag:ciphertext (all hex-encoded).
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  },

  /**
   * AES-256-GCM decrypt a string produced by encrypt().
   */
  decrypt(encrypted: string): string {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  },
};

