# Official Microsoft Playwright image with all browser libraries pre-installed
FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install npm dependencies (browser binaries already pre-installed in base image)
RUN npm install

# Copy application source code
COPY . .

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Expose server port
EXPOSE 10000

# Start Express server
CMD ["node", "src/server.js"]
