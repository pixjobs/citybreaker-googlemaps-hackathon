# ==============================================================================
# STAGE 1: Builder
# - Installs dependencies, builds the Next.js application.
# - This stage contains build tools and dev dependencies that will not be
#   included in the final image.
# ==============================================================================
FROM node:20-bookworm-slim AS builder

# Set environment variables for production build
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Prevent Puppeteer from downloading its own Chromium binary during install
    PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /app

# Install necessary build tools
# Using --no-install-recommends to keep the image lean
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install dependencies
# This layer is cached separately from the source code for faster rebuilds
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm i --frozen-lockfile; \
    elif [ -f yarn.lock ]; then npm i -g yarn && yarn install --frozen-lockfile; \
    else npm install; \
    fi

# Copy the rest of the source code
COPY . .

# Build the Next.js application
# This will create the optimized standalone output in .next/standalone
RUN npm run build

# ==============================================================================
# STAGE 2: Runner
# - Creates the final, minimal image for production.
# - Installs system Chromium and only the necessary runtime dependencies.
# - Runs the application as a non-root user for security.
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# Set environment variables for the runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Tell Puppeteer where to find the system-installed Chromium
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    # Default port for Cloud Run and other hosting platforms
    PORT=8080

WORKDIR /app

# Install system dependencies for Chromium
# This list is optimized to only include libs required for headless operation
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Install Chromium browser
    chromium \
    # Install a signal handler to properly manage container lifecycle
    dumb-init \
    # --- Essential libraries for headless Chromium ---
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    # --- Fonts for better text rendering and emoji support ---
    fonts-liberation \
    fonts-noto-color-emoji \
    # --- Clean up apt cache to reduce image size ---
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user and group for running the application
RUN groupadd --system --gid 1001 nextjs \
 && useradd --system --uid 1001 --gid nextjs nextjs

# Copy built application files from the builder stage
# --chown ensures the non-root user owns the files
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Switch to the non-root user
USER nextjs

# Expose the port the app will run on
EXPOSE 8080

# Add a healthcheck to verify the server is responsive
# This pings the server locally; adjust the port if you change it
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

# Set the entrypoint to use dumb-init
# This ensures that signals (like SIGTERM) are correctly forwarded to the Node.js process
ENTRYPOINT ["dumb-init", "--"]

# Set the default command to start the application server
CMD ["node", "server.js"]