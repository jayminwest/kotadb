# Claude Models Overview

**Date:** 2025-12-05
**Source:** https://platform.claude.com/docs/en/about-claude/models/overview

## Overview

Anthropic recommends **Claude Sonnet 4.5** as the starting point for most developers, offering the best balance of intelligence, speed, and cost for most use cases.

## Current Models

### Claude Sonnet 4.5

**Best for:** Complex agents and coding tasks

**Specifications:**
- **Pricing:** $3/million input tokens, $15/million output tokens
- **Context Window:** 200K standard (expandable to 1M tokens in beta)
- **Maximum Output:** 64K tokens
- **Knowledge Cutoff:** January 2025
- **Capabilities:**
  - Extended thinking
  - Priority tier access
  - Text and image input
  - Text output
  - Multilingual support
  - Vision support

**Availability:**
- Anthropic API
- AWS Bedrock
- Google Vertex AI

---

### Claude Haiku 4.5

**Best for:** Fastest inference with competitive intelligence

**Specifications:**
- **Pricing:** $1/million input tokens, $5/million output tokens
- **Context Window:** 200K standard (expandable to 1M tokens in beta)
- **Maximum Output:** 64K tokens
- **Knowledge Cutoff:** February 2025
- **Capabilities:**
  - Extended thinking
  - Priority tier access
  - Text and image input
  - Text output
  - Multilingual support
  - Vision support

**Availability:**
- Anthropic API
- AWS Bedrock
- Google Vertex AI

---

### Claude Opus 4.5

**Best for:** Maximum capability with practical performance

**Specifications:**
- **Pricing:** $5/million input tokens, $25/million output tokens
- **Context Window:** 200K standard (expandable to 1M tokens in beta)
- **Maximum Output:** 64K tokens
- **Knowledge Cutoff:** May 2025
- **Capabilities:**
  - Extended thinking
  - Priority tier access
  - Text and image input
  - Text output
  - Multilingual support
  - Vision support

**Availability:**
- Anthropic API
- AWS Bedrock
- Google Vertex AI

---

## Common Features Across Current Models

All current generation models (Sonnet 4.5, Haiku 4.5, and Opus 4.5) include:

- **Extended Thinking Capability:** Enhanced reasoning for complex problems
- **Priority Tier Access:** Higher rate limits and priority processing
- **Multimodal Input:** Support for both text and image inputs
- **Text Output:** Generate text-based responses
- **Multilingual Support:** Process and generate content in multiple languages
- **Vision Support:** Analyze and understand images
- **64K Token Maximum Output:** Generate long-form content
- **Multiple Platform Availability:** Access via Anthropic API, AWS Bedrock, and Google Vertex AI

---

## Legacy Models

Older generation models remain accessible but are recommended for migration to current generation for improved performance:

### Previous Versions Include:
- Claude Opus 4.1
- Claude Sonnet 4
- Claude Haiku 3.x iterations

**Note:** Anthropic encourages migrating to current generation models (4.5 series) for performance improvements and access to latest capabilities.

---

## Getting Started

### Integration Options

1. **API Integration:** Direct integration via Anthropic API
2. **Claude Console:** Browser-based interface to explore capabilities
3. **Cloud Platforms:**
   - AWS Bedrock
   - Google Vertex AI

### Recommended Starting Point

Begin with **Claude Sonnet 4.5** for the optimal balance of:
- Intelligence
- Processing speed
- Cost efficiency

---

## Model Selection Guide

| Use Case | Recommended Model | Rationale |
|----------|------------------|-----------|
| Complex coding tasks | Claude Sonnet 4.5 | Best balance of capability and cost |
| Agent development | Claude Sonnet 4.5 | Extended thinking with good performance |
| Rapid inference needs | Claude Haiku 4.5 | Fastest processing speed |
| Maximum capability required | Claude Opus 4.5 | Highest intelligence tier |
| Cost-sensitive applications | Claude Haiku 4.5 | Lowest pricing tier |
| General purpose | Claude Sonnet 4.5 | Recommended default |

---

## Additional Resources

For detailed API integration, pricing information, and migration guides, visit the Anthropic platform documentation.
