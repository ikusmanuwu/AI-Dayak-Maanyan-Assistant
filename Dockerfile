FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY .npmrc* ./

# Install all dependencies including devDependencies needed for build
RUN npm install --legacy-peer-deps

# Copy full application source
COPY . .

# Build Vite client and bundled backend server
RUN npm run build

# Port 3000 is used by both AI Studio and Railway
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
