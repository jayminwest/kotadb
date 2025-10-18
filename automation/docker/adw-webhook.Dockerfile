# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS webhook

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install uv for local script execution
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

WORKDIR /app

COPY requirements-adw-webhook.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /app

ENV ADW_RUNNER_IMAGE=kotadb-adw-runner:latest \
    UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=3000

EXPOSE 3000

CMD ["python", "-m", "automation.adws.trigger_webhook"]
