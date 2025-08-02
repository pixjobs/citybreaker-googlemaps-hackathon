# ==============================================================================
# STAGE 1: Builder - Install dependencies and build the Next.js app
# ==============================================================================
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# ** THE FIX - PART 1 **
# Tell Puppeteer to download its browser into a predictable local cache directory.
ENV PUPPETEER_CACHE_DIR=/app/node_modules/.cache/puppeteer

# Install ALL dependencies. This will now download Chromium into the cache dir.
RUN npm install

COPY . .

# Build the Next.js application
RUN npm run build

# ==============================================================================
# STAGE 2: Runner - Create the final, reliable production image
# ==============================================================================
FROM node:20-slim AS runner

WORKDIR /app

# Create a non-root user for security
RUN addgroup --gid 1001 --system nextjs && \
    adduser --uid 1001 --system --ingroup nextjs nextjs

# Install the system libraries needed by the Puppeteer-downloaded Chromium.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json ./

# ** THE FIX - PART 2 **
# Set the same cache directory environment variable for the runner stage.
ENV PUPPETEER_CACHE_DIR=/app/node_modules/.cache/puppeteer

# Install production dependencies. This will verify the browser in the cache.
RUN npm install --omit=dev

# Set the environment for Next.js
ENV NODE_ENV=production

# Copy the built application and the entire node_modules directory (which now contains the browser)
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./
COPY --from=builder --chown=nextjs:nextjs /app/node_modules ./node_modules

# Switch to the non-root user
USER nextjs

EXPOSE 8080
ENV PORT 8080

# Start the application
CMD ["npm", "start"]