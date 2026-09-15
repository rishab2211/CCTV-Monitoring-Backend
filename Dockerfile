FROM oven/bun:1.1-slim

WORKDIR /app

# Install curl, ca-certificates, and tar to fetch the static MediaMTX binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Download and install MediaMTX v1.9.3 static binary
ENV MEDIAMTX_VERSION=v1.9.3
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then MTX_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then MTX_ARCH="arm64v8"; \
    else MTX_ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin mediamtx && \
    chmod +x /usr/local/bin/mediamtx

# Copy package descriptors and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# Copy application files and configurations
COPY tsconfig.json mediamtx.yml entrypoint.sh ./
COPY src ./src

RUN chmod +x entrypoint.sh

# Expose default HTTP port
EXPOSE 5000 8554 8889 9997

ENTRYPOINT ["/app/entrypoint.sh"]
