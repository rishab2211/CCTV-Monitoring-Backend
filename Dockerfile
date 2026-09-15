FROM bluenviron/mediamtx:1.9.3 AS mediamtx

FROM oven/bun:1-slim

WORKDIR /app

# Copy the static MediaMTX binary from the official image
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

# Copy package descriptors and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# Copy application files and configurations
COPY tsconfig.json mediamtx.yml entrypoint.sh ./
COPY src ./src

RUN chmod +x entrypoint.sh

# Expose Render web service HTTP port
EXPOSE 10000

ENTRYPOINT ["/app/entrypoint.sh"]
