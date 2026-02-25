/**
 * E2E Database Seed Script (Playwright globalSetup)
 *
 * Registers a test user and creates a character via the API so that
 * chat-dependent tests have data to work with.  Credentials and IDs
 * are written to `.auth-state.json` for tests to consume.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const STATE_FILE = path.join(__dirname, '.auth-state.json');

interface AuthState {
  accessToken: string;
  refreshToken: string;
  userId: string;
  characterId: string;
  chatId: string;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.warn(`[seed] ${label} attempt ${i + 1}/${retries} failed:`, e instanceof Error ? e.message : e);
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`${label} failed after ${retries} retries`);
}

async function globalSetup() {
  const email = `e2e-seed-${Date.now()}@example.com`;
  const password = 'SeedPassword123!';
  const displayName = 'E2E Seed User';

  try {
    // 1. Register user
    const registerRes = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!registerRes.ok) {
      console.warn('[seed] Registration failed, server may not be running. Skipping seed.');
      return;
    }

    const { data: authData } = await registerRes.json();
    const accessToken: string = authData.accessToken;
    const userId: string = authData.user?.id ?? '';

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    // 2. Create a character (with retry)
    let characterId = '';
    try {
      characterId = await withRetry(async () => {
        const charRes = await fetch(`${API_URL}/api/v1/characters`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            name: 'E2E Test Character',
            description: 'Character created by E2E seed script',
            greeting: 'Hello! I am the E2E test character.',
            personality: 'Friendly and helpful test assistant',
            scenario: 'E2E testing environment',
          }),
        });
        if (!charRes.ok) {
          throw new Error(`Character creation returned ${charRes.status}`);
        }
        const charData = await charRes.json();
        return charData.data?.id ?? '';
      }, 'Character creation');
    } catch {
      console.warn('[seed] Character creation failed after retries, continuing without character');
    }

    // 3. Create a chat with the character (with retry)
    let chatId = '';
    if (characterId) {
      try {
        chatId = await withRetry(async () => {
          const chatRes = await fetch(`${API_URL}/api/v1/chats`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ characterId }),
          });
          if (!chatRes.ok) {
            throw new Error(`Chat creation returned ${chatRes.status}`);
          }
          const chatData = await chatRes.json();
          return chatData.data?.id ?? '';
        }, 'Chat creation');
      } catch {
        console.warn('[seed] Chat creation failed after retries, continuing without chat');
      }
    }

    // 4. Write state file
    const state: AuthState = {
      accessToken,
      refreshToken: authData.refreshToken ?? '',
      userId,
      characterId,
      chatId,
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('[seed] Seed data written to', STATE_FILE);
  } catch (err) {
    console.warn('[seed] Seed failed (server may not be running):', String(err));
  }
}

export default globalSetup;
