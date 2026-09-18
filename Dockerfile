FROM bluenviron/mediamtx:1.9.3 AS mediamtx

FROM oven/bun:1-slim

WORKDIR /app

# Copy the static MediaMTX binary from the official image
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

# Copy package descriptors and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# Install ffmpeg for live synthetic CCTV feed generation
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy application files, scripts, and configurations
COPY tsconfig.json mediamtx.yml entrypoint.sh ./
COPY src ./src
COPY scripts ./scripts

RUN chmod +x entrypoint.sh scripts/*.sh || true

# Expose Render web service HTTP port
EXPOSE 10000

ENTRYPOINT ["/app/entrypoint.sh"]
