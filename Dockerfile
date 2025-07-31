# ==============================================================================
# STAGE 1: Builder
# - Installs all dependencies (including devDependencies) needed for the build.
# - Creates the optimized standalone output.
# ==============================================================================
FROM node:20-bookworm-slim AS builder

# Set environment variables for the production build
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # This is critical: prevent Puppeteer from downloading Chromium during `npm install`
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Install git, which may be needed for some npm packages
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json* ./

# Install ALL dependencies, including devDependencies needed for the build
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Build the Next.js application.
# With `output: 'standalone'` in next.config.mjs, this creates the .next/standalone directory.
RUN npm run build


# ==============================================================================
# STAGE 2: Runner
# - Creates the final, minimal image for production.
# - Installs system Chromium and runs the app as a secure, non-root user.
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# Set environment variables for the runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # This is critical: tells Puppeteer where to find the system-installed Chromium
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    # Default port for Cloud Run and other hosting platforms
    PORT=8080

WORKDIR /app

# Install system dependencies for Chromium
# This list is optimized to only include libs required for headless operation
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium dumb-init \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN groupadd --system --gid 1001 nextjs \
 && useradd --system --uid 1001 --gid nextjs nextjs

# Change ownership of the app directory to the new user
# This allows the server to write to this directory if needed (e.g., temporary files)
RUN chown nextjs:nextjs /app

# Copy built application files from the builder stage
# --chown ensures the non-root user owns the files, which is a security best practice
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
# The standalone output is self-contained. It includes the server, dependencies, and static assets.
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./

# Switch to the non-root user
USER nextjs

# Expose the port the app will run on
EXPOSE 8080

# Add a healthcheck to verify the server is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

# Set the entrypoint to use dumb-init
# This correctly handles process signals (like SIGTERM) for graceful shutdowns
ENTRYPOINT ["dumb-init", "--"]

# Set the default command to start the application server
# This runs the server.js file located inside the .next/standalone directory
CMD ["node", "server.js"]