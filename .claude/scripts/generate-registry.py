#!/usr/bin/env python3
"""Auto-generate agent-registry.json from agent .md files.

Scans .claude/agents/ directory for all .md files, parses frontmatter,
and generates a complete registry with capability index, model index,
and tool matrix.

Usage:
    python3 generate-registry.py              # Generate registry
    python3 generate-registry.py --validate   # Validate only
    python3 generate-registry.py --dry-run    # Show what would be generated
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional, Dict, List

import yaml


def get_project_root() -> Path:
    """Find project root by looking for .git directory."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not find project root (.git directory)")


def parse_frontmatter(content: str) -> Optional[Dict[str, Any]]:
    """Extract and parse YAML frontmatter from markdown content."""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return None
    
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError as e:
        return None


def scan_agent_files(agents_dir: Path) -> List[Dict[str, Any]]:
    """Scan all .md files in agents directory and parse frontmatter.
    
    Returns list of agent metadata dictionaries.
    """
    agents = []
    
    for md_file in agents_dir.rglob("*.md"):
        if md_file.name == "README.md":
            continue
            
        content = md_file.read_text()
        frontmatter = parse_frontmatter(content)
        
        if not frontmatter:
            print(f"Warning: No frontmatter in {md_file}", file=sys.stderr)
            continue
            
        # Relative path from agents directory
        rel_path = md_file.relative_to(agents_dir)
        
        # Infer capabilities from agent type
        capabilities = infer_capabilities(frontmatter.get("name", ""))
        
        agent = {
            "name": frontmatter.get("name"),
            "description": frontmatter.get("description"),
            "file": str(rel_path),
            "model": frontmatter.get("model", "sonnet"),
            "capabilities": capabilities,
            "tools": frontmatter.get("tools", []),
            "readOnly": frontmatter.get("readOnly", False)
        }
        
        # Add expert domain if present
        if "expertDomain" in frontmatter:
            agent["expertDomain"] = frontmatter["expertDomain"]
        
        # Add context contract summary if present
        if "contextContract" in frontmatter:
            contract = frontmatter["contextContract"]
            agent["contextContract"] = {
                "contextSource": contract.get("contextSource", "prompt"),
                "hasScope": "produces" in contract and "files" in contract["produces"]
            }
        
        agents.append(agent)
    
    return sorted(agents, key=lambda a: a["name"])


def infer_capabilities(agent_name: str) -> List[str]:
    """Infer agent capabilities from name pattern."""
    if "plan" in agent_name:
        return ["plan", "analyze"]
    elif "build" in agent_name:
        return ["implement", "build"]
    elif "improve" in agent_name:
        return ["improve", "learn"]
    elif "question" in agent_name:
        return ["answer", "explain"]
    elif "orchestrator" in agent_name:
        return ["coordinate", "delegate"]
    elif "validator" in agent_name or "audit" in agent_name:
        return ["validate", "audit"]
    else:
        return ["general"]


def build_capability_index(agents: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Map capabilities to agent names."""
    index = {}
    
    for agent in agents:
        for capability in agent["capabilities"]:
            if capability not in index:
                index[capability] = []
            index[capability].append(agent["name"])
    
    return {k: sorted(v) for k, v in sorted(index.items())}


def build_model_index(agents: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Map model types to agent names."""
    index = {}
    
    for agent in agents:
        model = agent["model"]
        if model not in index:
            index[model] = []
        index[model].append(agent["name"])
    
    return {k: sorted(v) for k, v in sorted(index.items())}


def build_tool_matrix(agents: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Map tools to agents that use them."""
    matrix = {}
    
    for agent in agents:
        for tool in agent["tools"]:
            if tool not in matrix:
                matrix[tool] = []
            matrix[tool].append(agent["name"])
    
    return {k: sorted(v) for k, v in sorted(matrix.items())}


def generate_registry(agents_dir: Path, output_path: Path) -> Dict[str, Any]:
    """Generate complete registry JSON structure."""
    agents_list = scan_agent_files(agents_dir)
    
    # Convert list to dict keyed by name
    agents_dict = {agent["name"]: agent for agent in agents_list}
    
    registry = {
        "version": "1.0.0",
        "generated": "auto-generated by generate-registry.py",
        "agents": agents_dict,
        "capabilityIndex": build_capability_index(agents_list),
        "modelIndex": build_model_index(agents_list),
        "toolMatrix": build_tool_matrix(agents_list)
    }
    
    return registry


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate agent-registry.json from agent .md files"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate only, don't write registry"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without writing"
    )
    args = parser.parse_args()
    
    try:
        project_root = get_project_root()
        agents_dir = project_root / ".claude" / "agents"
        output_path = agents_dir / "agent-registry.json"
        
        if not agents_dir.exists():
            print(f"Error: Agents directory not found: {agents_dir}", file=sys.stderr)
            return 1
        
        registry = generate_registry(agents_dir, output_path)
        
        if args.dry_run or args.validate:
            print(json.dumps(registry, indent=2))
            print(f"\nFound {len(registry['agents'])} agents", file=sys.stderr)
            return 0
        
        # Write registry
        output_path.write_text(json.dumps(registry, indent=2) + "\n")
        print(f"Generated registry with {len(registry['agents'])} agents")
        return 0
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
