FROM node:18-slim

# Install dependencies for better performance
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create auth_info directory for session
RUN mkdir -p auth_info

# Expose port
EXPOSE 3000

# Start the bot
CMD ["node", "whatsapp-bot.js"]
