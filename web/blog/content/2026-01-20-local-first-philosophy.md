---
title: The Local-First Philosophy
description: Why we chose local-only architecture
date: 2026-01-20
slug: local-first-philosophy
---

# The Local-First Philosophy

When we set out to build KotaDB, we made a deliberate choice: everything runs locally. No cloud servers, no account required, no data ever leaving your machine.

## No Cloud Required

KotaDB runs entirely on your machine. Your code never leaves your computer. This isn't just a feature - it's a fundamental design principle that shapes everything we build.

## Benefits

### Privacy: Your Code Stays Local

In an era of increasing data collection, keeping your code local is more important than ever. Whether you're working on proprietary software, personal projects, or sensitive client work, you shouldn't have to worry about where your code is being sent.

With KotaDB:
- No code is uploaded to any server
- No telemetry or analytics
- No account or authentication required
- Your data stays under your control

### Speed: No Network Latency

When your data is local, searches happen in milliseconds. There's no round trip to a server, no waiting for a response. This makes a real difference in your workflow - code intelligence should feel instant.

### Reliability: Works Offline

Your tools shouldn't stop working because your internet connection is flaky. KotaDB works exactly the same whether you're connected or not. On a plane, in a coffee shop with bad WiFi, or in a secure environment with no external network access - it just works.

### Control: You Own Your Data

With local-first software, you maintain complete control:
- Delete your data anytime by removing a single file
- Back up your index with standard file tools
- Move between machines by copying your data
- No vendor lock-in

## Technical Approach

### SQLite as the Foundation

We chose SQLite as our storage engine for several reasons:

1. **Proven reliability**: SQLite is the most deployed database in the world, used by billions of devices
2. **Zero configuration**: No server process to manage, no complex setup
3. **Portable**: A single file contains your entire database
4. **Fast**: Optimized for read-heavy workloads like code search

### FTS5 for Full-Text Search

SQLite's FTS5 extension provides powerful full-text search capabilities:

- Prefix searches for partial matches
- Boolean operators (AND, OR, NOT)
- Phrase matching
- Ranking by relevance

### Local Storage Only

All data is stored in `~/.kotadb/` on your machine:

```
~/.kotadb/
  ├── kota.db        # Main database with code index
  └── config.json    # Optional configuration
```

That's it. No hidden cloud sync, no background uploads. Delete this directory and KotaDB has no trace of your data.

## The Trade-offs

Being local-first means accepting some trade-offs:

- **No cross-machine sync**: You need to index on each machine (though you can copy the database file)
- **No collaborative features**: Each user has their own index
- **Storage on your hardware**: Large codebases require disk space

We believe these trade-offs are worth it for the privacy, speed, and reliability benefits.

## Memory Layer: Local Learning

KotaDB v2.2.0 introduces the Memory Layer, which exemplifies local-first intelligence:

- **Decisions persist locally**: Architectural decisions stored in your SQLite database
- **Learning stays private**: Failed approaches and patterns never leave your machine
- **Cross-session intelligence**: Your local agent gets smarter with every session
- **No cloud dependency**: All learning happens in your local `.kotadb/kota.db`

The Memory Layer proves that intelligent software doesn't need cloud connectivity - it can learn and evolve entirely on your local machine.

## Conclusion

Local-first isn't just about where data is stored - it's about respecting user autonomy and building software that works for you, not the other way around.

KotaDB is built on these principles, and we're committed to keeping it that way.
