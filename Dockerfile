# Stage 1: Base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code including .env
COPY . .

# Expose backend port
EXPOSE 8001

# Start the server
CMD ["npm", "start"]
