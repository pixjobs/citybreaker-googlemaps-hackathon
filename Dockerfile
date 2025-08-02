# Stage 1: Build Stage
FROM mcr.microsoft.com/playwright:v1.54.2-jammy AS builder

WORKDIR /app

# Skip browser download during npm install to save time
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy rest of the app and build
COPY . .
RUN npm run build

# Explicitly install the browser binaries AFTER build step
RUN npx playwright install --with-deps chromium

# ---

# Stage 2: Runtime Stage
FROM mcr.microsoft.com/playwright:v1.54.2-jammy AS runner

WORKDIR /app

# Copy the .next standalone build and public assets from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Copy Playwright browser binaries from builder stage
COPY --from=builder /ms-playwright/ /ms-playwright/

# Use the pwuser (non-root) for security
USER pwuser

# Environment variables for Next.js
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLE=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 8080

CMD ["node", "server.js"]
