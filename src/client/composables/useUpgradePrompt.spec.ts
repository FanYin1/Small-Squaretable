import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@client/services/usage.api', () => ({}));

describe('useUpgradePrompt', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadModule() {
    const mod = await import('./useUpgradePrompt');
    return mod.useUpgradePrompt();
  }

  it('has initial state: visible false, resource "messages"', async () => {
    const { upgradePromptVisible, upgradePromptResource } = await loadModule();
    expect(upgradePromptVisible.value).toBe(false);
    expect(upgradePromptResource.value).toBe('messages');
  });

  it('showUpgradePrompt sets visible true and resource type', async () => {
    const { upgradePromptVisible, upgradePromptResource, showUpgradePrompt } = await loadModule();
    showUpgradePrompt('images');
    expect(upgradePromptVisible.value).toBe(true);
    expect(upgradePromptResource.value).toBe('images');
  });

  it('hideUpgradePrompt sets visible false', async () => {
    const { upgradePromptVisible, showUpgradePrompt, hideUpgradePrompt } = await loadModule();
    showUpgradePrompt();
    hideUpgradePrompt();
    expect(upgradePromptVisible.value).toBe(false);
  });

  it('showUpgradePrompt works with different resource types', async () => {
    const { upgradePromptResource, showUpgradePrompt } = await loadModule();

    showUpgradePrompt('llm_tokens');
    expect(upgradePromptResource.value).toBe('llm_tokens');

    showUpgradePrompt('api_calls');
    expect(upgradePromptResource.value).toBe('api_calls');
  });
});
