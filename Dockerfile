# Stage 1: Build the application
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS builder

WORKDIR /app

# Install all dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Production image
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runner

WORKDIR /app

# Create a non-root user
RUN addgroup --gid 1001 --system nextjs && \
    adduser --uid 1001 --system --ingroup nextjs nextjs

# Copy only necessary files from the builder stage
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/package.json ./package.json

USER nextjs

EXPOSE 8080
ENV PORT 8080
ENV NODE_ENV=production

CMD ["npm", "start"]