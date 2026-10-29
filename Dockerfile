# =============================================================================
# Multi-stage Dockerfile for Small-Squaretable
# Optimized for: Layer caching, Security, Minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments (for versioning and metadata)
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22

# =============================================================================
# Stage 1: Base image with common dependencies
# =============================================================================
FROM node:${NODE_VERSION}-bookworm-slim AS base

# Install security updates and common tools
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies installer (cached layer)
# =============================================================================
FROM base AS deps

# Copy only package files first (better cache utilization)
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# =============================================================================
# Stage 3: Build frontend
# =============================================================================
FROM deps AS frontend-builder

# Copy frontend source files
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./
COPY public ./public
COPY src/client ./src/client
COPY src/types ./src/types

# Build frontend
RUN npm run build:client

# =============================================================================
# Stage 4: Build backend
# =============================================================================
FROM deps AS backend-builder

# Copy backend source files
COPY tsconfig.json ./
COPY src ./src
COPY scripts/build-server.mjs ./scripts/build-server.mjs

# Compile TypeScript
RUN npm run build:server

# =============================================================================
# Stage 5: Production dependencies only
# =============================================================================
FROM base AS prod-deps

COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# =============================================================================
# Stage 6: Production runtime (final image)
# =============================================================================
FROM base AS production

# -----------------------------------------------------------------------------
# Image Metadata (OCI standard labels)
# -----------------------------------------------------------------------------
LABEL org.opencontainers.image.title="Small-Squaretable" \
      org.opencontainers.image.description="SillyTavern SaaS - Multi-tenant LLM Frontend Platform" \
      org.opencontainers.image.vendor="Small-Squaretable Team" \
      org.opencontainers.image.version="0.1.0-beta.1" \
      org.opencontainers.image.source="https://github.com/small-squaretable/small-squaretable" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="node:${NODE_VERSION}-bookworm-slim"

# Security labels
LABEL security.privileged="false" \
      security.capabilities.drop="ALL"

# Install security updates and dumb-init for proper signal handling
WORKDIR /app

# Create non-root user first (before copying files)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m nodejs

# Copy production dependencies from prod-deps stage
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/package*.json ./

# Copy compiled backend from backend-builder
COPY --from=backend-builder --chown=nodejs:nodejs /app/dist ./dist

# Copy built frontend from frontend-builder
COPY --from=frontend-builder --chown=nodejs:nodejs /app/dist/client ./dist/client

# Copy database migration files
COPY --from=backend-builder --chown=nodejs:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=backend-builder --chown=nodejs:nodejs /app/src/db/beta-migrations ./src/db/beta-migrations
COPY --chown=nodejs:nodejs scripts/beta-admin.mjs ./scripts/beta-admin.mjs
COPY --chown=nodejs:nodejs scripts/credit-exemption.mjs ./scripts/credit-exemption.mjs
COPY --chown=nodejs:nodejs scripts/seed-exploration.mjs ./scripts/seed-exploration.mjs

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads /app/logs && \
    chown nodejs:nodejs /app/uploads /app/logs

# Switch to non-root user
USER nodejs

# Environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check with curl (more reliable than node)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health/ready || exit 1

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server/index.js"]
