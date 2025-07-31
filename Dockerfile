# ==============================================================================
# STAGE 1: Builder
# - Installs ALL dependencies (dev and prod) needed for the build.
# - Creates the optimized standalone output for Next.js.
# ==============================================================================
FROM node:20-bookworm-slim AS builder

# We REMOVE `ENV NODE_ENV=production` from this builder stage.
# This is the key fix that ensures `npm install` gets the devDependencies
# (like tailwindcss) required by the `next build` command.
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Install git, which may be needed for some npm packages
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy package manifests for dependency installation
COPY package.json package-lock.json* ./

# This command will now correctly install ALL dependencies (dev and prod)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the Next.js application for production.
# This creates the .next/standalone directory because of our next.config.mjs setting.
RUN npm run build


# ==============================================================================
# STAGE 2: Runner
# - Creates the final, minimal, secure image for production.
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# The production environment is correctly set ONLY in the final runner stage
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=8080

WORKDIR /app

# Install system dependencies for Chromium and other best practices
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium dumb-init \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user and group for security
RUN groupadd --system --gid 1001 nextjs \
 && useradd --system --uid 1001 --gid nextjs nextjs

# Change ownership of the app directory to the new user
RUN chown nextjs:nextjs /app

# Copy built application files from the builder stage
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./

# Switch to the non-root user for enhanced security
USER nextjs

# Expose the port the app will run on
EXPOSE 8080

# Add a healthcheck to verify the server is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

# Use dumb-init as the entrypoint to correctly handle process signals (e.g., SIGTERM)
ENTRYPOINT ["dumb-init", "--"]

# Set the default command to start the application server from the standalone output
CMD ["node", "server.js"]