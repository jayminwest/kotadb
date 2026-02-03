---
title: Models overview
source: https://platform.claude.com/docs/en/docs/about-claude/models/overview
date: 2026-01-30
---

# Models Overview

Anthropic offers a family of Claude models optimized for different use cases, balancing capability, speed, and cost.

## Latest Models

### Claude Opus 4.5

The most capable Claude model, excelling at complex reasoning, analysis, and creative tasks.

| Property | Value |
|----------|-------|
| **Model ID** | `claude-opus-4-5-20251101` |
| **Context Window** | 200,000 tokens |
| **Max Output** | 32,000 tokens |
| **Training Data** | Up to May 2025 |

**Best for:**
- Complex multi-step reasoning
- Advanced code generation and review
- Research and analysis
- Creative writing and content
- Nuanced instruction following

**Pricing:**
- Input: $15 / 1M tokens
- Output: $75 / 1M tokens

### Claude Sonnet 4.5

Balanced model offering strong performance with improved speed and lower cost than Opus.

| Property | Value |
|----------|-------|
| **Model ID** | `claude-sonnet-4-5-20250514` |
| **Context Window** | 200,000 tokens |
| **Max Output** | 16,000 tokens |
| **Training Data** | Up to May 2025 |

**Best for:**
- General-purpose coding tasks
- Content generation
- Data analysis
- Customer support automation
- Document processing

**Pricing:**
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

### Claude Haiku 4.5

Fastest and most cost-effective model, optimized for quick responses and high-volume tasks.

| Property | Value |
|----------|-------|
| **Model ID** | `claude-haiku-4-5-20250514` |
| **Context Window** | 200,000 tokens |
| **Max Output** | 8,000 tokens |
| **Training Data** | Up to May 2025 |

**Best for:**
- Real-time interactions
- High-volume processing
- Simple code generation
- Classification tasks
- Quick summarization

**Pricing:**
- Input: $0.25 / 1M tokens
- Output: $1.25 / 1M tokens

## Model Comparison

| Model | Intelligence | Speed | Cost | Best Use Case |
|-------|-------------|-------|------|---------------|
| Opus 4.5 | Highest | Moderate | Highest | Complex reasoning |
| Sonnet 4.5 | High | Fast | Moderate | General purpose |
| Haiku 4.5 | Good | Fastest | Lowest | High volume |

## Context Windows

All current Claude models support 200,000 token context windows, enabling:

- Analysis of large codebases
- Processing lengthy documents
- Extended conversations with full history
- Multi-file code review

## Model Selection Guidelines

### Choose Opus 4.5 when:
- Task requires deep reasoning
- Quality is more important than speed
- Working on complex, multi-step problems
- Need highest accuracy for code generation

### Choose Sonnet 4.5 when:
- Need balance of quality and speed
- General-purpose coding and writing
- Production workloads with moderate complexity
- Cost efficiency matters

### Choose Haiku 4.5 when:
- Speed is critical
- High-volume processing required
- Tasks are straightforward
- Budget is constrained

## Legacy Models

Previous model versions remain available for compatibility:

### Claude 3.5 Family

| Model | Model ID | Status |
|-------|----------|--------|
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | Available |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | Available |

### Claude 3 Family

| Model | Model ID | Status |
|-------|----------|--------|
| Claude 3 Opus | `claude-3-opus-20240229` | Available |
| Claude 3 Sonnet | `claude-3-sonnet-20240229` | Deprecated |
| Claude 3 Haiku | `claude-3-haiku-20240307` | Available |

## API Usage

### Specifying Models

```python
import anthropic

client = anthropic.Anthropic()

# Using latest Opus
response = client.messages.create(
    model="claude-opus-4-5-20251101",
    max_tokens=4096,
    messages=[{"role": "user", "content": "Hello!"}]
)

# Using Sonnet
response = client.messages.create(
    model="claude-sonnet-4-5-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": "Hello!"}]
)

# Using Haiku
response = client.messages.create(
    model="claude-haiku-4-5-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Model Aliases

For convenience, aliases point to the latest versions:

| Alias | Points To |
|-------|-----------|
| `claude-opus-4-5-latest` | `claude-opus-4-5-20251101` |
| `claude-sonnet-4-5-latest` | `claude-sonnet-4-5-20250514` |
| `claude-haiku-4-5-latest` | `claude-haiku-4-5-20250514` |

## Capabilities by Model

| Capability | Opus 4.5 | Sonnet 4.5 | Haiku 4.5 |
|------------|----------|------------|-----------|
| Vision | Yes | Yes | Yes |
| Tool Use | Yes | Yes | Yes |
| JSON Mode | Yes | Yes | Yes |
| Streaming | Yes | Yes | Yes |
| System Prompts | Yes | Yes | Yes |
| Extended Thinking | Yes | Yes | No |

## Rate Limits

Default rate limits vary by model and tier:

| Tier | Opus 4.5 | Sonnet 4.5 | Haiku 4.5 |
|------|----------|------------|-----------|
| Free | 5 RPM | 20 RPM | 50 RPM |
| Build | 50 RPM | 200 RPM | 500 RPM |
| Scale | 500 RPM | 2000 RPM | 5000 RPM |

*RPM = Requests Per Minute*

Contact Anthropic for higher limits on Scale tier.

## Best Practices

### Cost Optimization

1. Start with Haiku for prototyping
2. Use Sonnet for production workloads
3. Reserve Opus for complex tasks requiring highest quality

### Quality Optimization

1. Use detailed system prompts
2. Provide examples in prompts
3. Use appropriate model for task complexity
4. Leverage extended thinking for reasoning tasks

### Latency Optimization

1. Use Haiku for real-time applications
2. Enable streaming for perceived speed
3. Minimize prompt length when possible
4. Use prompt caching for repeated prefixes
