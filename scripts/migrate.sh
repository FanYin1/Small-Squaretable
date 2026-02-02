#!/bin/bash
# Database migration script for production deployment

set -e

echo "Starting database migration..."

# Wait for database to be ready
echo "Waiting for database to be ready..."
until PGPASSWORD=$POSTGRES_PASSWORD psql -h "${DATABASE_HOST:-localhost}" -U "${DATABASE_USER:-postgres}" -d "${DATABASE_NAME:-sillytavern_saas}" -c '\q' 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# Run migrations
echo "Running database migrations..."
npm run db:migrate

echo "✅ Database migration completed successfully!"
