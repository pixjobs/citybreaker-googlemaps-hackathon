# Stage 1: Builder
FROM node:18 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Make sure this is present
# and your next.config.js has `output: 'standalone'`
RUN npm run build

# Stage 2: Production
FROM node:18 AS runner

# Use a non-root user
RUN adduser --system --uid 1001 nextjs
USER nextjs

WORKDIR /app

# Copy necessary output only
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server.js"]
