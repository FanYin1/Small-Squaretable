# Subscription System UI - Implementation Guide

## Overview

This document describes the complete subscription system UI implementation for Small-Squaretable, including plan selection, usage tracking, quota management, and upgrade prompts.

## Architecture

### Components

#### 1. Subscription Page (`/src/client/pages/Subscription.vue`)
Main subscription management page with:
- Current plan status display
- Billing cycle toggle (monthly/yearly)
- Plan comparison cards (Free/Pro/Team)
- Feature lists with detailed quotas
- Stripe Checkout integration
- Billing portal access

#### 2. Usage Dashboard (`/src/client/components/subscription/UsageDashboard.vue`)
Real-time usage monitoring component:
- Quota consumption by resource type (messages, tokens, images, API calls)
- Progress bars with color-coded status (success/warning/danger)
- Warning alerts when approaching limits (>80%)
- Error alerts when limits exceeded
- Quota reset date display
- Upgrade CTA for free users

#### 3. Upgrade Prompt (`/src/client/components/subscription/UpgradePrompt.vue`)
Modal dialog for quota limit notifications:
- Context-aware messaging based on resource type
- Recommended plan display
- Feature comparison
- Quick upgrade action

### State Management

#### Subscription Store (`/src/client/stores/subscription.ts`)
Manages subscription state:
- Current subscription details
- Plan configuration (prices, features)
- Stripe Checkout session creation
- Billing portal access
- Loading and error states

#### Usage Store (`/src/client/stores/usage.ts`)
Manages usage tracking:
- Current usage statistics
- Quota information by resource type
- Warning/exceeded state detection
- Percentage calculations
- Status determination (success/warning/danger)

### API Integration

#### Usage API (`/src/client/services/usage.api.ts`)
Client-side API methods:
- `getStats()` - Fetch usage statistics
- `getQuota()` - Fetch quota information

#### Usage Routes (`/src/server/routes/usage.ts`)
Backend API endpoints:
- `GET /api/v1/usage/stats` - Usage statistics
- `GET /api/v1/usage/quota` - Quota limits and consumption

## Features

### 1. Plan Selection

**Monthly/Yearly Toggle:**
```vue
<el-switch
  v-model="billingCycle"
  active-value="yearly"
  inactive-value="monthly"
/>
```

**Dynamic Pricing:**
- Monthly: ¥29/¥99
- Yearly: ¥290/¥990 (17% savings)

**Plan Tiers:**

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Messages/month | 100 | 10,000 | 100,000 |
| LLM Tokens/month | 50,000 | 1,000,000 | 10,000,000 |
| Images/month | 10 | 500 | 5,000 |
| API Calls/month | 0 | 1,000 | 10,000 |

### 2. Usage Tracking

**Resource Types:**
- `messages` - Chat messages sent
- `llm_tokens` - LLM API tokens consumed
- `images` - Images generated
- `api_calls` - API requests made

**Status Indicators:**
- **Success** (green): < 80% usage
- **Warning** (yellow): 80-99% usage
- **Danger** (red): ≥ 100% usage

### 3. Quota Management

**Automatic Checks:**
```typescript
const quotaInfo = await featureService.checkQuota(tenantId, 'messages');
if (!quotaInfo.allowed) {
  showUpgradePrompt('messages');
}
```

**Reset Schedule:**
- Quotas reset on the 1st of each month
- Display countdown to next reset

### 4. Stripe Integration

**Checkout Flow:**
1. User selects plan
2. Frontend calls `/api/v1/subscriptions/checkout`
3. Backend creates Stripe Checkout session
4. User redirected to Stripe payment page
5. Webhook updates subscription status
6. User redirected back with success/cancel status

**Billing Portal:**
- Manage payment methods
- View invoices
- Cancel/upgrade subscription
- Update billing information

## Usage Examples

### Display Usage Dashboard

```vue
<template>
  <UsageDashboard />
</template>

<script setup>
import UsageDashboard from '@client/components/subscription/UsageDashboard.vue';
</script>
```

### Show Upgrade Prompt

```typescript
import { useUpgradePrompt } from '@client/composables/useUpgradePrompt';

const { showUpgradePrompt } = useUpgradePrompt();

// When quota exceeded
if (!quotaAllowed) {
  showUpgradePrompt('messages'); // or 'llm_tokens', 'images', 'api_calls'
}
```

### Check Quota Before Action

```typescript
import { useUsageStore } from '@client/stores/usage';

const usageStore = useUsageStore();
await usageStore.fetchQuota();

if (usageStore.messagesQuota?.allowed) {
  // Proceed with action
  await sendMessage();
} else {
  // Show upgrade prompt
  showUpgradePrompt('messages');
}
```

### Monitor Usage in Real-time

```typescript
import { useUsageStore } from '@client/stores/usage';

const usageStore = useUsageStore();

// Fetch on mount
onMounted(() => {
  usageStore.refresh();
});

// Check for warnings
if (usageStore.hasWarning) {
  console.warn('Approaching quota limit');
}

if (usageStore.hasExceeded) {
  console.error('Quota exceeded');
}
```

## Styling

All components use Element Plus design tokens for consistency:
- `--el-color-primary` - Primary brand color
- `--el-color-success` - Success states
- `--el-color-warning` - Warning states
- `--el-color-danger` - Error states
- `--el-fill-color-*` - Background fills
- `--el-text-color-*` - Text colors

## Testing

### Unit Tests

Run usage store tests:
```bash
npm test -- src/client/stores/usage.spec.ts
```

Test coverage includes:
- Store initialization
- Quota fetching
- Percentage calculations
- Status determination
- Warning/exceeded detection
- Error handling

### Integration Testing

Test the complete flow:
1. Navigate to `/subscription`
2. View current plan and usage
3. Toggle billing cycle
4. Select a plan
5. Complete Stripe Checkout
6. Verify subscription update

## Environment Variables

Required Stripe configuration:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
```

## API Reference

### GET /api/v1/usage/stats

Returns usage statistics for current period.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "2026-02",
    "byResource": [
      { "resourceType": "messages", "amount": 50 },
      { "resourceType": "llm_tokens", "amount": 25000 }
    ],
    "total": 25050
  }
}
```

### GET /api/v1/usage/quota

Returns quota information for all resource types.

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": {
      "allowed": true,
      "currentUsage": 50,
      "limit": 100,
      "remaining": 50
    },
    "llm_tokens": {
      "allowed": true,
      "currentUsage": 25000,
      "limit": 50000,
      "remaining": 25000
    },
    "images": {
      "allowed": true,
      "currentUsage": 5,
      "limit": 10,
      "remaining": 5
    },
    "api_calls": {
      "allowed": true,
      "currentUsage": 0,
      "limit": 0,
      "remaining": 0
    }
  }
}
```

## Future Enhancements

1. **Usage Analytics**
   - Historical usage charts
   - Trend analysis
   - Forecasting

2. **Custom Plans**
   - Enterprise pricing
   - Custom quota limits
   - Volume discounts

3. **Payment Methods**
   - Multiple payment methods
   - Automatic retry on failure
   - Payment method preferences

4. **Notifications**
   - Email alerts for quota warnings
   - Webhook notifications
   - Slack/Discord integrations

5. **Team Management**
   - Multi-user subscriptions
   - Usage by team member
   - Role-based access control

## Troubleshooting

### Quota not updating
- Check if usage tracking middleware is applied to routes
- Verify database connection
- Check usage repository queries

### Stripe checkout fails
- Verify Stripe API keys
- Check webhook endpoint configuration
- Review Stripe dashboard logs

### Usage dashboard shows incorrect data
- Refresh quota: `usageStore.refresh()`
- Check API response format
- Verify period calculation

## Support

For issues or questions:
- Check logs: `npm run dev`
- Review Stripe dashboard
- Test webhook locally: `stripe listen --forward-to localhost:3000/api/v1/subscriptions/webhook`
