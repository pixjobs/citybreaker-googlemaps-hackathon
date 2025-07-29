# ==============================================================================
# STAGE 1: Builder - Install dependencies and build the Next.js app
# ==============================================================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
# This will also generate the 'standalone' output due to the next.config.js setting
RUN npm run build

# ==============================================================================
# STAGE 2: Runner - Create the final, optimized production image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create a non-root user 'nextjs' for security
# This user will own the application files and run the process
RUN addgroup --system --gid 1001 nextjs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder stage
# This includes the server, public assets, and static files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Switch to the non-root user
USER nextjs

# Expose the port the app will run on. Cloud Run provides the PORT env var.
EXPOSE 8080

# Set the default port environment variable
ENV PORT 8080

# This is the command that will be executed to start the application server
# It uses the custom Node.js server from the standalone output
CMD ["node", "server.js"]