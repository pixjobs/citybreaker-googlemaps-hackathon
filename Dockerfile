# Use the official Microsoft Playwright image with Node.js 20.
# The 'v1.48.0-jammy' tag is known to include Node.js 20 and is based on Jammy.
# This image has all system dependencies for all browsers pre-installed.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set the working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup --gid 1001 --system nextjs && \
    adduser --uid 1001 --system --ingroup nextjs nextjs

# Copy dependency manifests
COPY --chown=nextjs:nextjs package.json package-lock.json ./

# Install production dependencies. Playwright is now a prod dependency.
# This step is very fast because the browsers are already in the image.
RUN npm install --omit=dev

# Copy the rest of your application code
COPY --chown=nextjs:nextjs . .

# Build the Next.js application
RUN npm run build

# Switch to the non-root user
USER nextjs

EXPOSE 8080
ENV PORT 8080
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]