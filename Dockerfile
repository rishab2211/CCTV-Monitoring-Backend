# ────────────────────────────────────────────────────────────
# Stage 1: copy the static MediaMTX binary
# ────────────────────────────────────────────────────────────
FROM bluenviron/mediamtx:1.9.3 AS mediamtx

# ────────────────────────────────────────────────────────────
# Stage 2: application image
# ────────────────────────────────────────────────────────────
FROM oven/bun:1-slim

# Configurable HTTP port (default 8080 — AWS ECS / ALB convention)
ARG PORT=8080
ENV PORT=${PORT}

WORKDIR /app

# Copy the static MediaMTX binary from the official image
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

# Install OS-level dependencies:
#   - ffmpeg: live synthetic CCTV feed generation
#   - fonts-dejavu-core: OSD/text overlay for ffmpeg
#   - ca-certificates: required for TLS connections (MongoDB Atlas, Cloudinary, etc.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-dejavu-core \
      ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ── Install Node dependencies ──────────────────────────────
# Use --frozen-lockfile only; fail fast if bun.lock is stale.
# Never fall back to a non-reproducible install in CI/CD.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Copy application source ────────────────────────────────
COPY tsconfig.json mediamtx.yml entrypoint.sh ./
COPY src ./src
COPY scripts ./scripts

RUN chmod +x entrypoint.sh scripts/*.sh || true

# ── Non-root user for security ─────────────────────────────
RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --shell /usr/sbin/nologin appuser \
  && chown -R appuser:appgroup /app
USER appuser

EXPOSE ${PORT}

# ── Health check ───────────────────────────────────────────
# ECS uses the ALB target group health check, but this also
# gives `docker inspect` a status field and stops broken
# containers quickly during local docker-compose runs.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
