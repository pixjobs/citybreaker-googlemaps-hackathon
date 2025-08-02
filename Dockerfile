# ==============================================================================
# STAGE 1: Builder - Install dependencies and build the Next.js app
# ==============================================================================
FROM node:20-slim AS builder

# We don't need puppeteer dependencies here, only for building the app
WORKDIR /app

COPY package.json package-lock.json ./

# Install ALL dependencies to build the project
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

# Install ONLY the runtime dependencies for Chromium. This keeps the image smaller.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
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
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
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
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json ./

# ** THE CRITICAL FIX **
# Install ONLY production dependencies. This correctly installs puppeteer-core
# with all its necessary scripts, which the standalone output misses.
RUN npm install --omit=dev

# Set the environment for Next.js and Puppeteer
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy the built application code from the builder stage
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/next.config.js ./

# Switch to the non-root user
USER nextjs

EXPOSE 8080
ENV PORT 8080

# Use the standard Next.js start command, not the standalone server.js
CMD ["npm", "start"]