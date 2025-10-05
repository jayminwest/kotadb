# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS runner

ENV DEBIAN_FRONTEND=noninteractive \
    UV_CACHE_DIR=/home/adw/.cache/uv \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.bun/bin:/root/.local/bin"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        unzip \
        bash \
        passwd \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash --uid 1000 adw

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN mv /root/.local/bin/uv /usr/local/bin/uv \
    && mv /root/.local/bin/uvx /usr/local/bin/uvx

# Install Node.js 20 for Claude CLI
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
RUN cp /root/.bun/bin/bun /usr/local/bin/bun \
    && cp /root/.bun/bin/bunx /usr/local/bin/bunx \
    && chmod +x /usr/local/bin/bun /usr/local/bin/bunx
RUN chown -R adw:adw /root/.bun

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

RUN chown -R adw:adw /workspace

RUN mkdir -p /home/adw/.cache/uv && chown -R adw:adw /home/adw/.cache

# Lightweight entrypoint script to execute a single ADW run
COPY adws/scripts/run-adw.sh /usr/local/bin/run-adw
RUN chmod +x /usr/local/bin/run-adw && chown adw:adw /usr/local/bin/run-adw

# Switch to non-root user for runtime safety
USER adw
ENV HOME=/home/adw

WORKDIR /workspace

RUN git config --global --add safe.directory /workspace

ENTRYPOINT ["/usr/local/bin/run-adw"]
