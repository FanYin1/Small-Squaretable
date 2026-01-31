# Subscription System Guide

This guide covers the setup, configuration, and usage of the Stripe-based subscription system in Small Squaretable.

## Table of Contents

- [Overview](#overview)
- [Stripe Configuration](#stripe-configuration)
- [Environment Variables](#environment-variables)
- [Subscription Plans](#subscription-plans)
- [User Flow](#user-flow)
- [Webhook Setup](#webhook-setup)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

The subscription system provides three tiers of service:

- **Free**: Basic features with limited usage
- **Pro**: Advanced features with higher limits
- **Team**: Full features with team collaboration

The system uses Stripe for payment processing and includes:
- Subscription management
- Usage tracking and quota enforcement
- Webhook handling for real-time updates
- Customer portal for self-service billing

## Stripe Configuration

### 1. Create a Stripe Account

1. Go to [stripe.com](https://stripe.com) and sign up
2. Complete your account setup
3. Navigate to the Dashboard

### 2. Get API Keys

1. Go to **Developers** → **API keys**
2. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

**Important**: Use test keys during development and live keys only in production.

### 3. Create Products and Prices

1. Go to **Products** → **Add product**
2. Create the following products:

#### Pro Plan - Monthly
- Name: `Pro Plan (Monthly)`
- Price: `$19.99/month`
- Billing period: `Monthly`
- Copy the **Price ID** (starts with `price_`)

#### Pro Plan - Yearly
- Name: `Pro Plan (Yearly)`
- Price: `$199.99/year`
- Billing period: `Yearly`
- Copy the **Price ID**

#### Team Plan - Monthly
- Name: `Team Plan (Monthly)`
- Price: `$99.99/month`
- Billing period: `Monthly`
- Copy the **Price ID**

### 4. Enable Customer Portal

1. Go to **Settings** → **Billing** → **Customer portal**
2. Click **Activate test link** (or **Activate** for production)
3. Configure portal settings:
   - ✅ Allow customers to update payment methods
   - ✅ Allow customers to update billing information
   - ✅ Allow customers to cancel subscriptions
   - ✅ Allow customers to switch plans

## Environment Variables

Add the following variables to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Price IDs
STRIPE_PRICE_PRO_MONTHLY=price_your_pro_monthly_id
STRIPE_PRICE_PRO_YEARLY=price_your_pro_yearly_id
STRIPE_PRICE_TEAM_MONTHLY=price_your_team_monthly_id
```

### Getting the Webhook Secret

The webhook secret is obtained when you set up webhooks (see [Webhook Setup](#webhook-setup) section).

## Subscription Plans

### Free Plan

**Features:**
- Basic chat functionality
- Community character browsing

**Limits:**
- 100 messages per month
- 50,000 LLM tokens per month
- 10 images per month
- No API access

### Pro Plan

**Features:**
- All Free features
- Character sharing
- Advanced AI models
- Priority support
- Custom characters

**Limits:**
- 10,000 messages per month
- 1,000,000 LLM tokens per month
- 500 images per month
- 1,000 API calls per month

**Pricing:**
- Monthly: $19.99/month
- Yearly: $199.99/year (save 17%)

### Team Plan

**Features:**
- All Pro features
- Team collaboration
- API access
- Custom domain
- Dedicated support
- Advanced analytics

**Limits:**
- 100,000 messages per month
- 10,000,000 LLM tokens per month
- 5,000 images per month
- 10,000 API calls per month

**Pricing:**
- Monthly: $99.99/month

## User Flow

### 1. Subscription Creation

```typescript
// Frontend: Initiate checkout
const response = await fetch('/api/subscriptions/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    priceId: 'price_pro_monthly',
    successUrl: 'https://yourapp.com/success',
    cancelUrl: 'https://yourapp.com/cancel'
  })
});

const { url } = await response.json();

// Redirect user to Stripe Checkout
window.location.href = url;
```

### 2. Payment Completion

After successful payment:
1. User is redirected to `successUrl`
2. Stripe sends webhook to your server
3. Subscription is activated automatically
4. User gains access to plan features

### 3. Managing Subscription

```typescript
// Frontend: Open billing portal
const response = await fetch('/api/subscriptions/portal', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    returnUrl: 'https://yourapp.com/settings'
  })
});

const { url } = await response.json();

// Redirect to Stripe Customer Portal
window.location.href = url;
```

### 4. Checking Subscription Status

```typescript
// Frontend: Get current subscription
const response = await fetch('/api/subscriptions/status', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const subscription = await response.json();

console.log(subscription);
// {
//   plan: 'pro',
//   status: 'active',
//   currentPeriodEnd: '2026-03-01T00:00:00.000Z',
//   cancelAtPeriodEnd: false
// }
```

### 5. Checking Usage and Quotas

```typescript
// Frontend: Check quota before action
const response = await fetch('/api/usage/quota?resourceType=messages', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const quota = await response.json();

if (!quota.allowed) {
  alert(`Quota exceeded! Used ${quota.currentUsage} of ${quota.limit}`);
  return;
}

// Proceed with action...
```

## Webhook Setup

Webhooks allow Stripe to notify your application about subscription events in real-time.

### Local Development (using Stripe CLI)

1. **Install Stripe CLI**
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe

   # Linux
   wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
   tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
   sudo mv stripe /usr/local/bin/

   # Windows
   # Download from https://github.com/stripe/stripe-cli/releases
   ```

2. **Login to Stripe**
   ```bash
   stripe login
   ```

3. **Forward webhooks to local server**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. **Copy the webhook signing secret**
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
   ```

   Add this to your `.env`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

### Production Setup

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Enter your webhook URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** and add to production environment variables

### Webhook Events

The system handles the following events:

#### `checkout.session.completed`
Triggered when a customer completes checkout.
- Creates or updates subscription record
- Activates plan features
- Sets billing period dates

#### `customer.subscription.updated`
Triggered when subscription details change.
- Updates plan tier
- Updates billing dates
- Handles plan upgrades/downgrades

#### `customer.subscription.deleted`
Triggered when subscription is canceled.
- Downgrades to free plan
- Removes premium features
- Clears subscription data

#### `invoice.payment_failed`
Triggered when payment fails.
- Sets subscription status to `past_due`
- Sends notification (if configured)
- May restrict access after grace period

## Testing

### Test Card Numbers

Stripe provides test card numbers for different scenarios:

#### Successful Payment
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/34)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

#### Payment Requires Authentication (3D Secure)
```
Card Number: 4000 0025 0000 3155
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

#### Payment Declined
```
Card Number: 4000 0000 0000 0002
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

#### Insufficient Funds
```
Card Number: 4000 0000 0000 9995
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

### Testing Webhooks

1. **Trigger test events using Stripe CLI**
   ```bash
   # Test checkout completion
   stripe trigger checkout.session.completed

   # Test subscription update
   stripe trigger customer.subscription.updated

   # Test subscription cancellation
   stripe trigger customer.subscription.deleted

   # Test payment failure
   stripe trigger invoice.payment_failed
   ```

2. **Monitor webhook delivery**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

3. **View webhook logs in Stripe Dashboard**
   - Go to **Developers** → **Webhooks**
   - Click on your endpoint
   - View recent deliveries and responses

### Running Tests

```bash
# Run subscription service tests
npm test src/server/services/subscription.service.spec.ts

# Run usage service tests
npm test src/server/services/usage.service.spec.ts

# Run all subscription-related tests
npm test -- --grep subscription
```

## API Reference

### POST `/api/subscriptions/checkout`

Create a Stripe Checkout session.

**Request:**
```json
{
  "priceId": "price_pro_monthly",
  "successUrl": "https://app.com/success",
  "cancelUrl": "https://app.com/cancel"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### GET `/api/subscriptions/status`

Get current subscription status.

**Response:**
```json
{
  "id": "sub_123",
  "tenantId": "tenant_123",
  "plan": "pro",
  "status": "active",
  "stripeCustomerId": "cus_123",
  "stripeSubscriptionId": "sub_123",
  "stripePriceId": "price_123",
  "currentPeriodStart": "2026-02-01T00:00:00.000Z",
  "currentPeriodEnd": "2026-03-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "createdAt": "2026-01-15T00:00:00.000Z",
  "updatedAt": "2026-02-01T00:00:00.000Z"
}
```

### POST `/api/subscriptions/portal`

Create a billing portal session.

**Request:**
```json
{
  "returnUrl": "https://app.com/settings"
}
```

**Response:**
```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

### POST `/api/webhooks/stripe`

Stripe webhook endpoint (called by Stripe, not directly).

**Headers:**
```
stripe-signature: t=1234567890,v1=signature...
```

**Response:**
```json
{
  "received": true
}
```

### GET `/api/usage/stats`

Get usage statistics for current period.

**Query Parameters:**
- `period` (optional): Period in YYYY-MM format (defaults to current month)

**Response:**
```json
{
  "period": "2026-02",
  "byResource": [
    {
      "resourceType": "messages",
      "amount": 75
    },
    {
      "resourceType": "llm_tokens",
      "amount": 25000
    }
  ],
  "total": 25075
}
```

### GET `/api/usage/quota`

Check quota for a specific resource.

**Query Parameters:**
- `resourceType`: One of `messages`, `llm_tokens`, `images`, `api_calls`

**Response:**
```json
{
  "allowed": true,
  "currentUsage": 75,
  "limit": 100,
  "remaining": 25,
  "resourceType": "messages",
  "period": "2026-02"
}
```

### POST `/api/usage/track`

Track resource usage (internal API).

**Request:**
```json
{
  "resourceType": "messages",
  "amount": 1,
  "metadata": {
    "chatId": "chat_123",
    "messageId": "msg_456"
  }
}
```

**Response:**
```json
{
  "id": "usage_123",
  "tenantId": "tenant_123",
  "resourceType": "messages",
  "amount": 1,
  "period": "2026-02",
  "createdAt": "2026-02-01T12:34:56.000Z"
}
```

## Troubleshooting

### Webhook Not Receiving Events

**Problem**: Webhooks are not being delivered to your server.

**Solutions**:
1. Check that your webhook endpoint is publicly accessible
2. Verify the webhook URL in Stripe Dashboard
3. Check webhook signing secret matches your `.env`
4. Review webhook logs in Stripe Dashboard for error messages
5. Ensure your server is returning 200 status code

### Invalid Signature Error

**Problem**: `Invalid webhook signature` error.

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Don't modify the raw request body before verification
3. Check that you're using the correct webhook secret (test vs live)
4. Regenerate webhook secret if compromised

### Subscription Not Activating

**Problem**: Payment succeeds but subscription doesn't activate.

**Solutions**:
1. Check webhook is configured and receiving events
2. Verify `checkout.session.completed` event is being handled
3. Check application logs for errors
4. Ensure database is accessible and migrations are run
5. Verify price IDs in environment variables match Stripe

### Quota Not Enforcing

**Problem**: Users can exceed their plan limits.

**Solutions**:
1. Ensure quota checks are implemented before actions
2. Verify usage tracking is recording correctly
3. Check that subscription plan is correctly set
4. Review usage repository queries
5. Confirm period calculation is correct

### Customer Portal Not Working

**Problem**: Billing portal link doesn't work.

**Solutions**:
1. Verify Customer Portal is activated in Stripe
2. Check that customer has a valid Stripe customer ID
3. Ensure subscription exists for the tenant
4. Verify return URL is correct
5. Check for errors in application logs

### Test Mode vs Live Mode

**Problem**: Mixing test and live mode data.

**Solutions**:
1. Use test keys (`sk_test_`, `pk_test_`) in development
2. Use live keys (`sk_live_`, `pk_live_`) in production
3. Never mix test and live data
4. Use separate Stripe accounts for staging and production
5. Check Stripe Dashboard toggle (Test/Live mode)

### Payment Declined

**Problem**: Test payments are being declined.

**Solutions**:
1. Use correct test card numbers (see [Test Card Numbers](#test-card-numbers))
2. Use any future expiry date
3. Use any 3-digit CVC
4. Check Stripe Dashboard for decline reason
5. Try different test card for specific scenarios

## Best Practices

### Security

1. **Never expose secret keys**: Keep `STRIPE_SECRET_KEY` server-side only
2. **Validate webhooks**: Always verify webhook signatures
3. **Use HTTPS**: Webhooks require HTTPS in production
4. **Rotate keys**: Periodically rotate API keys
5. **Monitor access**: Review API logs regularly

### Performance

1. **Cache subscription data**: Reduce database queries
2. **Batch usage tracking**: Track usage in batches when possible
3. **Use webhook events**: Don't poll Stripe API for updates
4. **Index database**: Ensure proper indexes on tenant_id, stripe_customer_id
5. **Rate limiting**: Implement rate limiting on API endpoints

### User Experience

1. **Clear pricing**: Display pricing clearly before checkout
2. **Usage visibility**: Show users their current usage and limits
3. **Grace period**: Allow brief grace period for payment failures
4. **Cancellation flow**: Make cancellation easy but confirm intent
5. **Upgrade prompts**: Prompt users when approaching limits

### Monitoring

1. **Webhook failures**: Alert on webhook delivery failures
2. **Payment failures**: Monitor and notify on payment issues
3. **Usage patterns**: Track usage patterns for capacity planning
4. **Subscription churn**: Monitor cancellation rates
5. **Revenue metrics**: Track MRR, ARR, and growth

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)

## Support

For issues or questions:
1. Check this guide and troubleshooting section
2. Review Stripe documentation
3. Check application logs
4. Contact development team
5. Open a support ticket

---

**Last Updated**: February 2026
**Version**: 1.0.0
