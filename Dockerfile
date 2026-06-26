FROM node:20-bookworm-slim

# Install build tools required for native modules
RUN apt-get update && apt-get install -y build-essential python3 && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy root package files and install root deps (frontend tooling)
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend and install its deps from source (ensures sqlite3 compiled against host glibc)
COPY backend/ ./backend/
WORKDIR /app/backend
RUN npm install --build-from-source

# Copy frontend, install deps and build static assets
WORKDIR /app
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN npm install && npx vite build

# Expose the port Render will provide via $PORT (default 10000 for local testing)
EXPOSE 10000

# Default command – start the backend server
WORKDIR /app/backend
CMD ["node", "index.js"]
