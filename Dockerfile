# ==============================================================================
# STAGE 1: Builder - Install dependencies and build the Next.js app
# ==============================================================================
FROM node:20-alpine AS builder

# Install dependencies required to build and run Puppeteer with Chromium
RUN apk add --no-cache \
    bash \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    udev \
    dumb-init \
    curl \
    && rm -rf /var/cache/*

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
RUN npm run build

# ==============================================================================
# STAGE 2: Runner - Create the final, optimized production image
# ==============================================================================
FROM node:20-alpine AS runner

# Install Chromium runtime dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init \
    udev \
    && rm -rf /var/cache/*

# Set Puppeteer to use system-installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Create a non-root user and group named 'nextjs' with UID/GID 1001
RUN addgroup -g 1001 nextjs && adduser -S -u 1001 -G nextjs nextjs

# Copy build artifacts from builder stage with correct ownership
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Use the non-root user
USER nextjs

# Expose the port the app will run on. Cloud Run provides the PORT env var.
EXPOSE 8080
ENV PORT 8080

# Start the application
CMD ["node", "server.js"]