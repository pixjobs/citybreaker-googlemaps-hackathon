# ==============================================================================
# STAGE 1: Builder - Install dependencies and build the Next.js app
# ==============================================================================
FROM node:20-slim AS builder

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

# Install ONLY the runtime dependencies for Chromium.
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

# Install ONLY production dependencies. This correctly installs puppeteer-core.
RUN npm install --omit=dev

# Set the environment for Next.js and Puppeteer
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy the built application from the builder stage
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next

# --- THE CORRECTED LINE ---
# Copy the TypeScript config file instead of the JavaScript one.
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./

# Switch to the non-root user
USER nextjs

EXPOSE 8080
ENV PORT 8080

# Use the standard Next.js start command
CMD ["npm", "start"]