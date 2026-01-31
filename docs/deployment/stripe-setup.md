# Stripe Setup and Deployment Guide

This guide provides step-by-step instructions for setting up Stripe for the Small Squaretable subscription system in production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Stripe Account Setup](#stripe-account-setup)
- [Product Configuration](#product-configuration)
- [Webhook Configuration](#webhook-configuration)
- [Environment Variables](#environment-variables)
- [Deployment Checklist](#deployment-checklist)
- [Security Considerations](#security-considerations)
- [Testing Before Production](#testing-before-production)
- [Going Live](#going-live)
- [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

Before starting, ensure you have:

- [ ] Access to Stripe account (or ability to create one)
- [ ] Production domain with HTTPS enabled
- [ ] Database and Redis configured
- [ ] Application deployed to staging/production environment
- [ ] Admin access to environment variables

## Stripe Account Setup

### 1. Create Stripe Account

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Sign up with your business email
3. Complete the registration form
4. Verify your email address

### 2. Complete Business Profile

1. Navigate to **Settings** → **Business settings**
2. Fill in required information:
   - Business name
   - Business address
   - Business type
   - Tax ID (if applicable)
   - Support email and phone
3. Click **Save**

### 3. Activate Your Account

1. Go to **Settings** → **Account**
2. Complete the activation requirements:
   - Verify business details
   - Add bank account for payouts
   - Provide identity verification documents (if required)
3. Wait for Stripe to review and activate your account

**Note**: You can use test mode while waiting for activation.

### 4. Get API Keys

1. Navigate to **Developers** → **API keys**
2. You'll see two sets of keys:
   - **Test mode keys** (for development/staging)
   - **Live mode keys** (for production)

**Test Mode Keys:**
```
Publishable key: pk_test_51xxxxxxxxxxxxx
Secret key: sk_test_51xxxxxxxxxxxxx
```

**Live Mode Keys:**
```
Publishable key: pk_live_51xxxxxxxxxxxxx
Secret key: sk_live_51xxxxxxxxxxxxx
```

**Important**:
- Keep secret keys confidential
- Never commit keys to version control
- Use test keys for development/staging
- Use live keys only in production

## Product Configuration

### 1. Create Pro Plan - Monthly

1. Go to **Products** → **Add product**
2. Fill in product details:
   - **Name**: `Pro Plan (Monthly)`
   - **Description**: `Advanced features with higher limits - billed monthly`
3. Under **Pricing**:
   - **Price**: `19.99`
   - **Currency**: `USD`
   - **Billing period**: `Monthly`
   - **Recurring**: ✅ Enabled
4. Click **Add product**
5. **Copy the Price ID** (starts with `price_`) - you'll need this for `STRIPE_PRICE_PRO_MONTHLY`

**Screenshot reference**: The price ID appears below the price amount in the format `price_1xxxxxxxxxxxxx`

### 2. Create Pro Plan - Yearly

1. Go to **Products** → Find the "Pro Plan (Monthly)" product
2. Click **Add another price**
3. Fill in pricing details:
   - **Price**: `199.99`
   - **Currency**: `USD`
   - **Billing period**: `Yearly`
   - **Recurring**: ✅ Enabled
4. Click **Add price**
5. **Copy the Price ID** - you'll need this for `STRIPE_PRICE_PRO_YEARLY`

### 3. Create Team Plan - Monthly

1. Go to **Products** → **Add product**
2. Fill in product details:
   - **Name**: `Team Plan (Monthly)`
   - **Description**: `Full features with team collaboration - billed monthly`
3. Under **Pricing**:
   - **Price**: `99.99`
   - **Currency**: `USD`
   - **Billing period**: `Monthly`
   - **Recurring**: ✅ Enabled
4. Click **Add product**
5. **Copy the Price ID** - you'll need this for `STRIPE_PRICE_TEAM_MONTHLY`

### 4. Configure Customer Portal

The Customer Portal allows users to manage their subscriptions, update payment methods, and view invoices.

1. Go to **Settings** → **Billing** → **Customer portal**
2. Click **Activate test link** (for test mode) or **Activate** (for live mode)
3. Configure portal settings:

**Business information:**
- Business name: `Small Squaretable`
- Support email: Your support email
- Privacy policy URL: Your privacy policy URL
- Terms of service URL: Your terms of service URL

**Functionality:**
- ✅ **Invoice history**: Allow customers to view invoices
- ✅ **Update payment method**: Allow customers to update cards
- ✅ **Update billing information**: Allow customers to update address/email
- ✅ **Cancel subscriptions**: Allow customers to cancel
  - Cancellation behavior: `Cancel at end of billing period`
  - Cancellation reasons: ✅ Enable (helps track why users cancel)
- ✅ **Switch plans**: Allow customers to upgrade/downgrade
  - Proration: `Always invoice immediately`

4. Click **Save changes**

## Webhook Configuration

Webhooks notify your application about subscription events in real-time.

### Development/Staging Setup (Stripe CLI)

For local development and staging environments:

1. **Install Stripe CLI**

   **macOS:**
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

   **Linux:**
   ```bash
   wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
   tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
   sudo mv stripe /usr/local/bin/
   ```

   **Windows:**
   Download from [GitHub Releases](https://github.com/stripe/stripe-cli/releases)

2. **Login to Stripe**
   ```bash
   stripe login
   ```
   This opens a browser to authorize the CLI.

3. **Forward webhooks to your server**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. **Copy the webhook signing secret**
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
   ```

   Add this to your `.env` file:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

### Production Setup

For production environments:

1. **Navigate to Webhooks**
   - Go to **Developers** → **Webhooks**
   - Ensure you're in **Live mode** (toggle in top right)

2. **Add Endpoint**
   - Click **Add endpoint**
   - Enter your webhook URL: `https://yourdomain.com/api/webhooks/stripe`
   - **Important**: Must be HTTPS in production

3. **Select Events**
   Select the following events to listen for:
   - ✅ `checkout.session.completed` - When checkout is completed
   - ✅ `customer.subscription.created` - When subscription is created
   - ✅ `customer.subscription.updated` - When subscription is updated
   - ✅ `customer.subscription.deleted` - When subscription is canceled
   - ✅ `invoice.payment_succeeded` - When payment succeeds
   - ✅ `invoice.payment_failed` - When payment fails

4. **Add Endpoint**
   - Click **Add endpoint**
   - The endpoint will be created and you'll see the details page

5. **Copy Signing Secret**
   - On the endpoint details page, click **Reveal** under "Signing secret"
   - Copy the secret (starts with `whsec_`)
   - Add this to your production environment variables

**Screenshot reference**: The signing secret is in the "Signing secret" section, format `whsec_xxxxxxxxxxxxx`

### Webhook Security

**Important security measures:**

1. **Always verify signatures**: The application automatically verifies webhook signatures using `STRIPE_WEBHOOK_SECRET`
2. **Use HTTPS**: Webhooks require HTTPS in production
3. **Return 200 quickly**: Process webhooks asynchronously if needed
4. **Handle idempotency**: Webhooks may be delivered multiple times
5. **Log all events**: Keep logs for debugging and auditing

## Environment Variables

### Required Variables

Add these to your production environment:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Price IDs (from Product Configuration step)
STRIPE_PRICE_PRO_MONTHLY=price_your_pro_monthly_id
STRIPE_PRICE_PRO_YEARLY=price_your_pro_yearly_id
STRIPE_PRICE_TEAM_MONTHLY=price_your_team_monthly_id
```

### Environment-Specific Configuration

**Development:**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe CLI)
```

**Staging:**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe Dashboard test webhook)
```

**Production:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe Dashboard live webhook)
```

### Setting Environment Variables

**Docker/Docker Compose:**
```yaml
environment:
  - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
  - STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
  - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
  - STRIPE_PRICE_PRO_MONTHLY=${STRIPE_PRICE_PRO_MONTHLY}
  - STRIPE_PRICE_PRO_YEARLY=${STRIPE_PRICE_PRO_YEARLY}
  - STRIPE_PRICE_TEAM_MONTHLY=${STRIPE_PRICE_TEAM_MONTHLY}
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: stripe-secrets
type: Opaque
stringData:
  STRIPE_SECRET_KEY: sk_live_...
  STRIPE_WEBHOOK_SECRET: whsec_...
```

**Cloud Platforms:**
- **Heroku**: `heroku config:set STRIPE_SECRET_KEY=sk_live_...`
- **AWS**: Use AWS Secrets Manager or Parameter Store
- **Vercel**: Add in Project Settings → Environment Variables
- **Railway**: Add in Project → Variables

## Deployment Checklist

Use this checklist before deploying to production:

### Pre-Deployment

- [ ] Stripe account fully activated and verified
- [ ] Business profile completed in Stripe Dashboard
- [ ] Bank account added for payouts
- [ ] All three products created (Pro Monthly, Pro Yearly, Team Monthly)
- [ ] Price IDs copied and documented
- [ ] Customer Portal activated and configured
- [ ] Webhook endpoint created in Stripe Dashboard
- [ ] Webhook signing secret obtained
- [ ] All environment variables documented

### Test Mode Verification

- [ ] Test mode API keys configured in staging
- [ ] Test webhook endpoint working (using Stripe CLI or staging webhook)
- [ ] Successful test checkout with test card (4242 4242 4242 4242)
- [ ] Webhook events received and processed correctly
- [ ] Subscription activated after checkout
- [ ] Usage tracking working correctly
- [ ] Quota enforcement working correctly
- [ ] Customer Portal accessible and functional
- [ ] Subscription cancellation working
- [ ] Plan upgrade/downgrade working

### Production Configuration

- [ ] Live mode API keys added to production environment
- [ ] Live webhook endpoint configured and verified
- [ ] HTTPS enabled on production domain
- [ ] Database migrations run successfully
- [ ] Redis cache configured and accessible
- [ ] Application deployed and running
- [ ] Health check endpoint responding
- [ ] Logs configured and accessible

### Security Verification

- [ ] Secret keys not exposed in client-side code
- [ ] Secret keys not committed to version control
- [ ] Webhook signature verification enabled
- [ ] HTTPS enforced for all API endpoints
- [ ] Rate limiting configured
- [ ] CORS configured correctly
- [ ] Environment variables secured (encrypted at rest)

### Monitoring Setup

- [ ] Webhook delivery monitoring configured
- [ ] Payment failure alerts configured
- [ ] Error logging enabled
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring configured
- [ ] Stripe Dashboard notifications enabled

### Documentation

- [ ] Environment variables documented
- [ ] Deployment process documented
- [ ] Rollback procedure documented
- [ ] Support team trained on subscription system
- [ ] Customer-facing documentation updated

## Security Considerations

### API Key Management

1. **Never expose secret keys**
   - Keep `STRIPE_SECRET_KEY` server-side only
   - Never include in client-side code or version control
   - Use environment variables, not hardcoded values

2. **Rotate keys periodically**
   - Rotate API keys every 90 days
   - Rotate immediately if compromised
   - Use Stripe Dashboard to roll keys

3. **Use restricted keys when possible**
   - Create restricted API keys for specific operations
   - Limit permissions to minimum required
   - Use separate keys for different services

### Webhook Security

1. **Always verify signatures**
   - Application automatically verifies using `STRIPE_WEBHOOK_SECRET`
   - Never skip signature verification
   - Return 400 for invalid signatures

2. **Use HTTPS**
   - Webhooks require HTTPS in production
   - Stripe will not send webhooks to HTTP endpoints
   - Ensure valid SSL certificate

3. **Implement idempotency**
   - Webhooks may be delivered multiple times
   - Use idempotency keys to prevent duplicate processing
   - Store processed event IDs

### Data Protection

1. **PCI Compliance**
   - Never store credit card numbers
   - Use Stripe.js for card collection
   - Let Stripe handle sensitive data

2. **Customer Data**
   - Store only necessary customer information
   - Encrypt sensitive data at rest
   - Follow GDPR/privacy regulations

3. **Access Control**
   - Limit access to Stripe Dashboard
   - Use role-based access control
   - Enable two-factor authentication

## Testing Before Production

### 1. Test Checkout Flow

```bash
# Use test card
Card: 4242 4242 4242 4242
Expiry: 12/34
CVC: 123
ZIP: 12345
```

**Verify:**
- [ ] Checkout page loads correctly
- [ ] Payment processes successfully
- [ ] User redirected to success page
- [ ] Webhook received and processed
- [ ] Subscription activated in database
- [ ] User can access Pro features

### 2. Test Webhook Events

```bash
# Using Stripe CLI
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

**Verify:**
- [ ] Events received by application
- [ ] Events processed correctly
- [ ] Database updated appropriately
- [ ] No errors in application logs

### 3. Test Customer Portal

**Verify:**
- [ ] Portal link generates correctly
- [ ] User can view subscription details
- [ ] User can update payment method
- [ ] User can cancel subscription
- [ ] User can upgrade/downgrade plan
- [ ] Changes reflected in application

### 4. Test Usage Tracking

**Verify:**
- [ ] Usage tracked correctly for each resource type
- [ ] Quota checks working
- [ ] Users blocked when quota exceeded
- [ ] Usage resets at period boundary

### 5. Test Error Scenarios

**Test cases:**
- [ ] Payment declined (card 4000 0000 0000 0002)
- [ ] Insufficient funds (card 4000 0000 0000 9995)
- [ ] Expired card
- [ ] Invalid webhook signature
- [ ] Database connection failure
- [ ] Stripe API timeout

## Going Live

### 1. Switch to Live Mode

1. In Stripe Dashboard, toggle from **Test mode** to **Live mode** (top right)
2. Verify all products and prices are created in live mode
3. Verify webhook endpoint is configured in live mode
4. Update environment variables with live keys

### 2. Deploy to Production

```bash
# Example deployment commands
git checkout main
git pull origin main
npm run build
npm run db:migrate
# Deploy using your platform's deployment method
```

### 3. Verify Production

**Immediate checks:**
- [ ] Application starts successfully
- [ ] Health check endpoint responding
- [ ] Database connection working
- [ ] Redis connection working
- [ ] Webhook endpoint accessible from internet

**Functional checks:**
- [ ] Create test subscription with real card
- [ ] Verify webhook received
- [ ] Verify subscription activated
- [ ] Test customer portal
- [ ] Test usage tracking
- [ ] Cancel test subscription

### 4. Monitor Initial Traffic

**First 24 hours:**
- Monitor webhook delivery rate
- Check for any failed webhooks
- Review application logs for errors
- Monitor payment success rate
- Check database performance
- Verify email notifications (if configured)

## Monitoring and Maintenance

### Daily Monitoring

1. **Webhook Health**
   - Check Stripe Dashboard → Webhooks → Your endpoint
   - Verify delivery success rate > 99%
   - Investigate any failed deliveries

2. **Payment Success Rate**
   - Monitor payment success rate
   - Alert on rate < 95%
   - Investigate declined payments

3. **Application Logs**
   - Review error logs
   - Check for Stripe API errors
   - Monitor response times

### Weekly Tasks

1. **Review Metrics**
   - Active subscriptions
   - New subscriptions
   - Cancellations
   - Revenue (MRR/ARR)
   - Churn rate

2. **Check Failed Payments**
   - Review failed payment reasons
   - Follow up with customers if needed
   - Update retry logic if necessary

3. **Webhook Logs**
   - Review webhook processing times
   - Check for any patterns in failures
   - Optimize if needed

### Monthly Tasks

1. **Security Review**
   - Review API key access logs
   - Check for suspicious activity
   - Verify webhook signature validation

2. **Performance Review**
   - Analyze subscription trends
   - Review usage patterns
   - Plan capacity if needed

3. **Update Documentation**
   - Update runbooks
   - Document any issues encountered
   - Update team training materials

### Quarterly Tasks

1. **API Key Rotation**
   - Generate new API keys
   - Update production environment
   - Revoke old keys
   - Test thoroughly

2. **Disaster Recovery Test**
   - Test backup restoration
   - Verify webhook replay capability
   - Test rollback procedures

3. **Compliance Review**
   - Review PCI compliance
   - Update privacy policies
   - Review data retention

## Troubleshooting

### Webhook Not Receiving Events

**Symptoms:**
- Payments succeed but subscriptions don't activate
- No webhook events in application logs

**Solutions:**
1. Check webhook endpoint is publicly accessible
2. Verify webhook URL in Stripe Dashboard
3. Check firewall/security group rules
4. Verify HTTPS certificate is valid
5. Check application is running and healthy
6. Review Stripe Dashboard webhook logs for errors

### Invalid Signature Errors

**Symptoms:**
- Webhook events rejected with signature error
- 400 responses in Stripe webhook logs

**Solutions:**
1. Verify `STRIPE_WEBHOOK_SECRET` matches Dashboard
2. Check you're using correct secret (test vs live)
3. Ensure raw request body is used for verification
4. Verify no middleware is modifying request body
5. Regenerate webhook secret if needed

### Payment Failures

**Symptoms:**
- High rate of declined payments
- Customer complaints about payment issues

**Solutions:**
1. Check Stripe Dashboard for decline reasons
2. Verify card details are correct
3. Check for fraud prevention blocks
4. Review retry logic
5. Contact Stripe support if needed

## Support and Resources

### Stripe Resources

- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Support](https://support.stripe.com)

### Internal Resources

- [Subscription User Guide](../subscription-guide.md)
- [API Documentation](../api/README.md)
- [Architecture Documentation](../architecture/infrastructure.md)

### Emergency Contacts

- **Stripe Support**: support@stripe.com
- **Development Team**: [Your team contact]
- **On-Call Engineer**: [Your on-call system]

---

**Document Version**: 1.0.0
**Last Updated**: February 2026
**Maintained By**: Development Team

