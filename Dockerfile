FROM node:lts-alpine

# Create app directory
WORKDIR /home/node

# Copy application files and dependencies
COPY package.json package-lock.json ./
COPY index.js ./
COPY lib ./lib/
COPY node_modules ./node_modules/

# Create required directories for bind mounts and set ownership
RUN mkdir -p watched history logs && chown -R node:node /home/node

# Switch to node user for security
USER node

# Set default environment variables for container paths
ENV WATCHER_PATH="/home/node/watched" \
    WATCHER_HISTORY_FILE="/home/node/history/history.json" \
    WATCHER_LOG_FILE="/home/node/logs/watcher.log"

# Expose the application
ENTRYPOINT ["node", "index.js"]