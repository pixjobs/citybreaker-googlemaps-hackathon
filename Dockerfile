# ==============================================================================
# STAGE 1: Builder – install deps and build Next.js (standalone)
# ==============================================================================
FROM node:20-bookworm-slim AS builder

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Basic OS deps for building (git optional)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./ 
# Prefer npm ci when lockfile present
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source and build
COPY . .
# Ensure Next.js outputs standalone server
# (in next.config.js:  module.exports = { output: 'standalone' } )
RUN npm run build

# ==============================================================================
# STAGE 2: Runner – minimal runtime with Chrome shared libs + fonts
# ==============================================================================
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Cloud Run provides PORT at runtime; default to 8080
    PORT=8080

# Install shared libs Chrome needs (no browser binary here)
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    ca-certificates \
    # Chromium runtime deps:
    libnss3 \
    libxss1 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxshmfence1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    # fonts to avoid tofu + emojis:
    fonts-liberation \
    fonts-dejavu \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the standalone server and static assets
# (Next.js creates server.js and includes node_modules needed by server)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Use the non-root 'node' user provided by the base image
USER node

EXPOSE 8080

# Use dumb-init for proper signal handling on Cloud Run
CMD ["dumb-init", "node", "server.js"]
