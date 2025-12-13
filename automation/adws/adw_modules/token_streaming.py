"""Real-time token usage streaming for ADW workflows."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TokenEvent(BaseModel):
    """Token usage event emitted during workflow execution."""
    
    adw_id: str = Field(..., description="ADW execution ID")
    phase: str = Field(..., description="Phase name (plan, build, review)")
    agent: str = Field(..., description="Agent name")
    input_tokens: int = Field(..., description="Prompt tokens consumed")
    output_tokens: int = Field(..., description="Completion tokens generated")
    cache_read_tokens: int = Field(default=0, description="Cached prompt tokens read")
    cache_creation_tokens: int = Field(default=0, description="Tokens written to cache")
    cost_usd: float = Field(..., description="Calculated cost in USD")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat(), description="ISO 8601 timestamp")


# Pricing constants (as of 2025-12-13)
PRICE_INPUT_PER_MILLION = 3.00
PRICE_OUTPUT_PER_MILLION = 15.00
PRICE_CACHE_WRITE_PER_MILLION = 3.75
PRICE_CACHE_READ_PER_MILLION = 0.30


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> float:
    """Calculate total cost in USD for token usage.
    
    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        cache_read_tokens: Number of cached tokens read
        cache_creation_tokens: Number of tokens written to cache
        
    Returns:
        Total cost in USD
    """
    cost = (
        (input_tokens * PRICE_INPUT_PER_MILLION / 1_000_000) +
        (output_tokens * PRICE_OUTPUT_PER_MILLION / 1_000_000) +
        (cache_read_tokens * PRICE_CACHE_READ_PER_MILLION / 1_000_000) +
        (cache_creation_tokens * PRICE_CACHE_WRITE_PER_MILLION / 1_000_000)
    )
    return round(cost, 6)


def emit_token_event(
    adw_id: str,
    phase: str,
    agent: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> None:
    """Emit a token event to stdout as JSON line.
    
    Args:
        adw_id: ADW execution ID
        phase: Phase name
        agent: Agent name
        input_tokens: Input token count
        output_tokens: Output token count
        cache_read_tokens: Cache read token count
        cache_creation_tokens: Cache creation token count
    """
    cost = calculate_cost(input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
    
    event = TokenEvent(
        adw_id=adw_id,
        phase=phase,
        agent=agent,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_creation_tokens=cache_creation_tokens,
        cost_usd=cost,
    )
    
    # Emit as JSON line to stdout
    sys.stdout.write(f"TOKEN_EVENT:{event.model_dump_json()}\n")
    sys.stdout.flush()


def parse_token_usage_from_result(result_message: dict) -> Optional[dict]:
    """Parse token usage from Claude Code result message.
    
    Args:
        result_message: Result message dict from parse_jsonl_output
        
    Returns:
        Dict with input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
        or None if usage data not found
    """
    # Claude Code result messages include token usage in API response metadata
    # Format varies by SDK version, handle multiple formats
    usage = result_message.get("usage") or result_message.get("token_usage")
    if not usage:
        return None
    
    return {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_read_tokens": usage.get("cache_read_input_tokens", 0),
        "cache_creation_tokens": usage.get("cache_creation_input_tokens", 0),
    }


__all__ = [
    "TokenEvent",
    "calculate_cost",
    "emit_token_event",
    "parse_token_usage_from_result",
    "PRICE_INPUT_PER_MILLION",
    "PRICE_OUTPUT_PER_MILLION",
    "PRICE_CACHE_READ_PER_MILLION",
    "PRICE_CACHE_WRITE_PER_MILLION",
]
