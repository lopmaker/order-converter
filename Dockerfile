# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json .npmrc ./

# Install dependencies with legacy peer deps
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Set build-time env vars (these will be overridden by Zeabur env vars at runtime)
ARG DATABASE_URL
ARG GOOGLE_API_KEY

ENV DATABASE_URL=$DATABASE_URL
ENV GOOGLE_API_KEY=$GOOGLE_API_KEY

# Build the Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
