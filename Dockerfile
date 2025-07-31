# ==============================================================================
# STAGE 1: Builder - install deps and build Next.js
# ==============================================================================
FROM node:20-bookworm-slim AS builder

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Prevent Puppeteer from downloading Chromium in the build stage
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

WORKDIR /app

# Install minimal build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init git \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests and install deps (use lockfile if present)
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source and build
COPY . .
RUN npm run build

# ==============================================================================
# STAGE 2: Runner - install system Chromium & runtime libs, run app
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# Install system Chromium and required runtime libs/fonts for headless mode
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates dumb-init \
    # Common Chrome/GTK/graphical deps
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
    libxrandr2 libxrender1 libxss1 xdg-utils \
    # Fonts (better layout + emoji)
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Tell Puppeteer where Chromium lives on Debian
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    # Cloud Run port
    PORT=8080

WORKDIR /app

# Run as non-root
RUN groupadd -g 1001 nextjs \
 && useradd -u 1001 -g nextjs -d /app -s /usr/sbin/nologin nextjs

# Copy the minimal standalone output from the build stage
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
# (Optional) copy next config if you reference it at runtime
# COPY --from=builder --chown=nextjs:nextjs /app/next.config.* ./ 2>/dev/null || true

USER nextjs

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
