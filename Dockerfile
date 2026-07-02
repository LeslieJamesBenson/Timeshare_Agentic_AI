# Production image for the rep tool (Phase 7).
# node:sqlite (used for persistence) requires Node 22+.
FROM node:22-slim

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# Persisted SQLite lives here; mount a volume at /app/data in production so it
# survives container restarts/redeploys.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Config comes from the environment (ANTHROPIC_API_KEY, REP_PASSWORD,
# SESSION_SECRET, ...). Do NOT bake .env into the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||3000) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
