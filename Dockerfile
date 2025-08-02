# ┌───────────────────────────────────────────────────────────┐
# │ Stage 1: Build Stage                                      │
# └───────────────────────────────────────────────────────────┘
FROM mcr.microsoft.com/playwright:v1.54.2-jammy AS builder

WORKDIR /app

# Don’t auto-download browsers during npm install
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build your Next.js app
COPY . .
RUN npm run build

# Install ONLY the full Chromium binary (no headless_shell) for new headless mode
RUN npx playwright install --with-deps --no-shell chromium

# ┌───────────────────────────────────────────────────────────┐
# │ Stage 2: Runtime Stage                                     │
# └───────────────────────────────────────────────────────────┘
FROM mcr.microsoft.com/playwright:v1.54.2-jammy AS runner

WORKDIR /app

# Copy the standalone Next.js server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Copy Playwright’s browsers directory
COPY --from=builder /ms-playwright /ms-playwright

# Drop to non-root user
USER pwuser

# Next.js runtime environment
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLE=1

# Tell Playwright where to find the Chromium binary
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 8080

CMD ["node", "server.js"]
