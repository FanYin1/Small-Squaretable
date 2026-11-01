# ML Service Dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source
COPY server.js ./

# Create models directory
RUN mkdir -p /app/models
ENV ML_MODEL_CACHE=/app/models

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>r.json()).then(j=>process.exit(j.initialized?0:1)).catch(()=>process.exit(1))"

# Start service
CMD ["node", "server.js"]
