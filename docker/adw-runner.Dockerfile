# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS runner

ENV DEBIAN_FRONTEND=noninteractive \
    UV_CACHE_DIR=/root/.cache/uv \
    PATH="/root/.local/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        unzip \
        bash \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Node.js 20 for Claude CLI
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | tee /usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace

# Copy repository sources into image (including git metadata)
COPY . /workspace

# Ensure git metadata permissions remain accessible
RUN git config --global --add safe.directory /workspace

# Lightweight entrypoint script to execute a single ADW run
COPY adws/scripts/run-adw.sh /usr/local/bin/run-adw
RUN chmod +x /usr/local/bin/run-adw

ENTRYPOINT ["/usr/local/bin/run-adw"]
