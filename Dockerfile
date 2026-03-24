FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create persistent storage directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "bot.js"]
