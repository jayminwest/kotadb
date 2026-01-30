---
title: Installation
description: Get KotaDB running locally
order: 1
last_updated: 2026-01-30
version: 2.0.0
reviewed_by: documentation-build-agent
---

# Installation

Get KotaDB up and running on your local machine.

## System Requirements

- **Bun** 1.0 or later
- **Operating System**: macOS, Linux, or Windows (via WSL)
- **Disk Space**: ~50MB for the application, plus space for your code index

## Quick Install

Install KotaDB globally using npm:

```bash
npm install -g kotadb
```

Or using Bun:

```bash
bun install -g kotadb
```

## Verify Installation

After installation, verify that KotaDB is available:

```bash
kotadb --version
```

You should see the version number printed to your terminal.

## First Steps

1. **Index a repository** - Point KotaDB at your codebase:

```bash
kotadb index --repository owner/repo --ref main
# Or for local path:
kotadb index --local-path /path/to/your/repo
```

2. **Start the server** - Launch the API server:

```bash
kotadb serve
```

3. **Test the connection** - Verify the server is running:

```bash
curl http://localhost:3000/health
# Default port is 3000, configurable via PORT environment variable
```

## Troubleshooting

### Command not found

If `kotadb` is not found after installation, ensure your npm/bun global bin directory is in your PATH.

For npm:
```bash
export PATH="$PATH:$(npm config get prefix)/bin"
```

For Bun:
```bash
export PATH="$PATH:$HOME/.bun/bin"
```

### Permission errors

On some systems, you may need to use `sudo` for global installation, or configure npm to use a different directory for global packages.

## Next Steps

- [Configure KotaDB](#configuration) for your environment
- Learn about the [API Reference](#api-reference)
- Understand the [Architecture](#architecture)
