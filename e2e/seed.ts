/**
 * E2E Database Seed Script (Playwright globalSetup)
 *
 * Registers a test user and creates a character via the API so that
 * chat-dependent tests have data to work with.  Credentials and IDs
 * are written to `.auth-state.json` for tests to consume.
 */

import fs from 'node:fs';
import path from 'node:path';

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

    // 2. Create a character
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

    let characterId = '';
    if (charRes.ok) {
      const charData = await charRes.json();
      characterId = charData.data?.id ?? '';
    }

    // 3. Create a chat with the character
    let chatId = '';
    if (characterId) {
      const chatRes = await fetch(`${API_URL}/api/v1/chats`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ characterId }),
      });
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        chatId = chatData.data?.id ?? '';
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
