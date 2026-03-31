# ---------------------------------------------------------------------------
# Stage 1 — Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc --outDir dist

# ---------------------------------------------------------------------------
# Stage 2 — Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --frozen-lockfile 2>/dev/null || npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist
COPY public ./public

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status || exit 1

CMD ["node", "dist/worker.js"]
