# Stage 1: Build Stage
FROM mcr.microsoft.com/playwright:v1.54.2-jammy AS builder

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# ---

# Stage 2: Production/Runner Stage
FROM node:20-alpine AS runner

# Install fonts and system dependencies needed for PDF generation at runtime
# We use sudo because the base node:alpine image doesn't have it, but we need root to install.
# We then drop privileges.
RUN apk add --no-cache \
    udev \
    ttf-freefont \
    chromium

WORKDIR /app

RUN addgroup --system --gid 1001 nextjs && \
    adduser --system --uid 1001 --ingroup nextjs nextjs

COPY --from=builder /ms-playwright/ /ms-playwright/

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT 8080
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLE 1

# IMPORTANT: Tell Playwright where to find the browser installed via apk
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin

CMD ["node", "server.js"]
