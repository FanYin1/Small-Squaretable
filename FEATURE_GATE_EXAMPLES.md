# Feature Gate Usage Examples

This document demonstrates how to use the feature permission control system in Small Squaretable.

## Backend Usage

### 1. Require Feature Permission

Use `requireFeature()` middleware to restrict access to specific features:

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requireFeature } from '../middleware/feature-gate';

const routes = new Hono();

// Only users with 'character_share' feature can publish characters
routes.post(
  '/:id/publish',
  authMiddleware(),
  requireFeature('character_share'),
  async (c) => {
    // Implementation
    const characterId = c.req.param('id');
    // ... publish logic
  }
);
```

### 2. Require Quota

Use `requireQuota()` middleware to check resource quotas:

```typescript
import { requireQuota } from '../middleware/feature-gate';

// Check message quota before sending
routes.post(
  '/:id/messages',
  authMiddleware(),
  requireQuota('messages'),
  async (c) => {
    // Implementation
    const chatId = c.req.param('id');
    // ... send message logic
  }
);
```

### 3. Require Both Feature and Quota

Use `requireFeatureAndQuota()` for combined checks:

```typescript
import { requireFeatureAndQuota } from '../middleware/feature-gate';

// Require advanced_models feature AND check images quota
routes.post(
  '/generate',
  authMiddleware(),
  requireFeatureAndQuota('advanced_models', 'images'),
  async (c) => {
    // Implementation
    // ... image generation logic
  }
);
```

### 4. Manual Feature Check in Service

```typescript
import { featureService } from '../services/feature.service';

async function someServiceMethod(tenantId: string) {
  // Check if tenant has a specific feature
  const hasFeature = await featureService.checkTenantFeature(tenantId, 'api_access');

  if (!hasFeature) {
    throw new ForbiddenError('API access requires Team plan');
  }

  // Check quota
  const quotaCheck = await featureService.checkQuota(tenantId, 'api_calls');

  if (!quotaCheck.allowed) {
    throw new ForbiddenError('API call quota exceeded');
  }

  // Continue with logic
}
```

## Frontend Usage

### 1. Check Feature Permission

```vue
<script setup lang="ts">
import { useFeatureGate } from '@client/composables';

const { hasFeature, getUpgradeMessage } = useFeatureGate();

// Check if user can share characters
const canShare = hasFeature('character_share');

function handleShare() {
  if (!canShare) {
    alert(getUpgradeMessage('character_share'));
    return;
  }

  // Proceed with sharing
}
</script>

<template>
  <button
    @click="handleShare"
    :disabled="!canShare"
  >
    Share Character
  </button>

  <div v-if="!canShare" class="upgrade-hint">
    {{ getUpgradeMessage('character_share') }}
  </div>
</template>
```

### 2. Conditional Rendering

```vue
<script setup lang="ts">
import { useFeatureGate } from '@client/composables';

const { hasFeature, isPaidUser, isTeamUser } = useFeatureGate();
</script>

<template>
  <!-- Show feature only to users with permission -->
  <div v-if="hasFeature('advanced_models')">
    <h3>Advanced Models</h3>
    <!-- Advanced model selection -->
  </div>

  <!-- Show upgrade prompt for free users -->
  <div v-if="!isPaidUser" class="upgrade-banner">
    Upgrade to Pro to unlock advanced features
  </div>

  <!-- Team-only features -->
  <div v-if="isTeamUser">
    <h3>Team Collaboration</h3>
    <!-- Team features -->
  </div>
</template>
```

### 3. Check Limits

```vue
<script setup lang="ts">
import { useFeatureGate } from '@client/composables';

const { getCurrentLimits, getLimit } = useFeatureGate();

const limits = getCurrentLimits();
const messageLimit = getLimit('messages');
</script>

<template>
  <div class="quota-info">
    <p>Message Limit: {{ messageLimit }}</p>
    <p>Token Limit: {{ limits.llm_tokens }}</p>
    <p>Image Limit: {{ limits.images }}</p>
  </div>
</template>
```

## Available Features

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| `basic_chat` | ✓ | ✓ | ✓ |
| `community_browse` | ✓ | ✓ | ✓ |
| `character_share` | ✗ | ✓ | ✓ |
| `advanced_models` | ✗ | ✓ | ✓ |
| `priority_support` | ✗ | ✓ | ✓ |
| `team_collaboration` | ✗ | ✗ | ✓ |
| `api_access` | ✗ | ✗ | ✓ |
| `custom_domain` | ✗ | ✗ | ✓ |

## Resource Limits

| Resource | Free | Pro | Team |
|----------|------|-----|------|
| `messages` | 100 | 10,000 | 100,000 |
| `llm_tokens` | 50,000 | 1,000,000 | 10,000,000 |
| `images` | 10 | 500 | 5,000 |
| `api_calls` | 0 | 1,000 | 10,000 |

## Error Responses

### Feature Not Available (403)

```json
{
  "error": "Upgrade required",
  "message": "This feature requires a higher subscription plan",
  "feature": "character_share",
  "currentPlan": "free"
}
```

### Quota Exceeded (403)

```json
{
  "error": "Quota exceeded",
  "message": "You have exceeded your messages quota",
  "resourceType": "messages",
  "currentUsage": 105,
  "limit": 100
}
```

## Example Route Modifications

### Character Publishing (Requires Feature)

```typescript
// src/server/routes/characters.ts
import { requireFeature } from '../middleware/feature-gate';

// Publish character to marketplace - requires character_share feature
characterRoutes.post(
  '/:id/publish',
  authMiddleware(),
  requireFeature('character_share'),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const character = await characterService.publish(characterId, user.id, user.tenantId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: character,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);
```

### Message Sending (Requires Quota)

```typescript
// src/server/routes/chats.ts
import { requireQuota } from '../middleware/feature-gate';

// Send message - requires message quota
chatRoutes.post(
  '/:id/messages',
  authMiddleware(),
  requireQuota('messages'),
  zValidator('json', createMessageSchema),
  async (c) => {
    const chatId = c.req.param('id');
    const input = c.req.valid('json');
    const message = await chatService.addMessage(chatId, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: message,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);
```
