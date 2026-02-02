#!/bin/bash
# Environment variable validation script

set -e

echo "Validating environment variables..."

# Required variables
REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "JWT_SECRET"
  "NODE_ENV"
)

# Optional but recommended variables
RECOMMENDED_VARS=(
  "STRIPE_SECRET_KEY"
  "STRIPE_PUBLISHABLE_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "STRIPE_PRICE_PRO_MONTHLY"
  "STRIPE_PRICE_PRO_YEARLY"
  "STRIPE_PRICE_TEAM_MONTHLY"
)

# Check required variables
MISSING_REQUIRED=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_REQUIRED+=("$var")
  fi
done

if [ ${#MISSING_REQUIRED[@]} -ne 0 ]; then
  echo "❌ ERROR: Missing required environment variables:"
  for var in "${MISSING_REQUIRED[@]}"; do
    echo "  - $var"
  done
  exit 1
fi

# Check recommended variables
MISSING_RECOMMENDED=()
for var in "${RECOMMENDED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_RECOMMENDED+=("$var")
  fi
done

if [ ${#MISSING_RECOMMENDED[@]} -ne 0 ]; then
  echo "⚠️  WARNING: Missing recommended environment variables:"
  for var in "${MISSING_RECOMMENDED[@]}"; do
    echo "  - $var"
  done
  echo "  Subscription features may not work properly."
fi

# Validate JWT_SECRET length
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "❌ ERROR: JWT_SECRET must be at least 32 characters long"
  exit 1
fi

# Validate NODE_ENV
if [[ ! "$NODE_ENV" =~ ^(development|production|test)$ ]]; then
  echo "❌ ERROR: NODE_ENV must be one of: development, production, test"
  exit 1
fi

# Validate DATABASE_URL format
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
  echo "❌ ERROR: DATABASE_URL must start with postgresql://"
  exit 1
fi

# Validate REDIS_URL format
if [[ ! "$REDIS_URL" =~ ^redis:// ]]; then
  echo "❌ ERROR: REDIS_URL must start with redis://"
  exit 1
fi

echo "✅ All required environment variables are set and valid!"

# Display configuration summary
echo ""
echo "Configuration Summary:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: ${PORT:-3000}"
echo "  HOST: ${HOST:-0.0.0.0}"
echo "  DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "  REDIS_URL: ${REDIS_URL:0:30}..."
echo "  JWT_SECRET: [HIDDEN]"
echo "  STORAGE_TYPE: ${STORAGE_TYPE:-local}"

if [ -n "$STRIPE_SECRET_KEY" ]; then
  echo "  Stripe: Configured ✓"
else
  echo "  Stripe: Not configured"
fi

echo ""
echo "Ready to start!"
