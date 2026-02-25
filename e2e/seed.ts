/**
 * E2E Database Seed Script (Playwright globalSetup)
 *
 * Writes a minimal auth state file so tests don't block on server availability.
 * Real authentication is handled per-test by setupAuth() in helpers.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, '.auth-state.json');

interface AuthState {
  accessToken: string;
  refreshToken: string;
  userId: string;
  characterId: string;
  chatId: string;
}

async function globalSetup() {
  // Write a minimal placeholder state file.
  // Individual tests use setupAuth() to set up proper mocked auth per-page.
  const state: AuthState = {
    accessToken: '',
    refreshToken: '',
    userId: '',
    characterId: '',
    chatId: '',
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('[seed] Minimal auth state written to', STATE_FILE);
}

export default globalSetup;
