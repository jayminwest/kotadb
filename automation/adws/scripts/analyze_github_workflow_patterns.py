#!/usr/bin/env python3
"""
Analyze GitHub history to identify workflow patterns for agentic automation configuration.

This script extracts key metrics from PR and issue history to help configure:
- Number of commits typically needed before merge
- Review/iteration cycles (comment frequency)
- Common failure patterns
- Issue lifecycle timings
- Relationship between issue complexity and PR characteristics

Usage:
    uv run automation/adws/scripts/analyze_github_workflow_patterns.py --output-format json
    uv run automation/adws/scripts/analyze_github_workflow_patterns.py --limit 100 --format markdown
"""

import json
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import statistics
from collections import Counter
import argparse
import sys


@dataclass
class PRMetrics:
    """Metrics for a single pull request."""
    number: int
    title: str
    commits: int
    comments: int
    reviews: int
    created_at: str
    closed_at: Optional[str]
    merged_at: Optional[str]
    time_to_merge_hours: Optional[float]
    author: str
    labels: List[str]
    is_bot_pr: bool  # PRs created by automation
    is_integration_pr: bool  # PRs for branch promotion (develop→main, releases)


@dataclass
class IssueMetrics:
    """Metrics for a single issue."""
    number: int
    title: str
    comments: int
    created_at: str
    closed_at: Optional[str]
    time_to_close_hours: Optional[float]
    labels: List[str]


@dataclass
class WorkflowAnalysis:
    """Aggregated workflow analysis results."""
    # PR Metrics
    total_prs: int
    avg_commits_per_pr: float
    median_commits_per_pr: float
    max_commits_per_pr: int
    commits_distribution: Dict[str, int]  # e.g., {"1": 50, "2-5": 30, "6-10": 15, "11+": 5}

    # Review/Iteration Metrics
    avg_comments_per_pr: float
    median_comments_per_pr: float
    avg_reviews_per_pr: float
    prs_with_zero_reviews: int
    prs_with_zero_comments: int

    # Timing Metrics
    avg_time_to_merge_hours: Optional[float]
    median_time_to_merge_hours: Optional[float]

    # Issue Metrics
    total_issues: int
    avg_comments_per_issue: float
    avg_time_to_close_hours: Optional[float]

    # Bot vs Human Activity
    bot_pr_percentage: float
    human_pr_percentage: float

    # Label Analysis
    top_labels: List[tuple[str, int]]  # (label, count)

    # Recommendations
    recommendations: Dict[str, Any]


def is_integration_pr(title: str, labels: List[str]) -> bool:
    """
    Detect integration/promotion PRs (develop→main, releases, etc.).

    These PRs accumulate many commits from feature branches and should be
    excluded from feature workflow analysis.
    """
    title_lower = title.lower()

    # Common patterns for integration PRs
    integration_patterns = [
        "merge develop into main",
        "develop → main",
        "develop -> main",
        "develop→main",
        "main <- develop",
        "main→develop",
        "main -> develop",
        "release",
        "promotion",
        "sync main",
        "sync develop",
        "backport",
        "cherry-pick",
        "hotfix to main",
        "emergency fix main"
    ]

    # Check title patterns
    if any(pattern in title_lower for pattern in integration_patterns):
        return True

    # Check labels
    integration_labels = ["release", "promotion", "integration", "sync", "backport"]
    if any(label.lower() in integration_labels for label in labels):
        return True

    return False


def run_gh_command(cmd: List[str]) -> Any:
    """Execute GitHub CLI command and return JSON result."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error running gh command: {e}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}", file=sys.stderr)
        sys.exit(1)


def fetch_pr_data(limit: int = 100) -> List[PRMetrics]:
    """Fetch PR data from GitHub."""
    print(f"Fetching {limit} merged PRs from GitHub...", file=sys.stderr)

    # First fetch basic PR info without nested data
    pr_list = run_gh_command([
        "gh", "pr", "list",
        "--limit", str(limit),
        "--state", "merged",
        "--json", "number,title,createdAt,closedAt,mergedAt,author,labels"
    ])

    print(f"Fetching detailed commit/comment data for {len(pr_list)} PRs...", file=sys.stderr)

    metrics = []
    for pr in pr_list:
        # Fetch commits and comments separately for each PR
        pr_number = pr["number"]
        try:
            pr_details = run_gh_command([
                "gh", "pr", "view", str(pr_number),
                "--json", "commits,comments,reviews"
            ])
            pr.update(pr_details)
        except Exception as e:
            print(f"Warning: Failed to fetch details for PR #{pr_number}: {e}", file=sys.stderr)
            pr["commits"] = []
            pr["comments"] = []
            pr["reviews"] = []
        # Calculate time to merge
        time_to_merge = None
        if pr.get("createdAt") and pr.get("mergedAt"):
            created = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
            merged = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            time_to_merge = (merged - created).total_seconds() / 3600

        # Detect bot PRs (github-actions, dependabot, etc.)
        author = pr.get("author", {}).get("login", "")
        is_bot = author in ["github-actions", "dependabot", "renovate"] or "[bot]" in author

        # Detect integration/promotion PRs
        labels = [label["name"] for label in pr.get("labels", [])]
        is_integration = is_integration_pr(pr["title"], labels)

        metrics.append(PRMetrics(
            number=pr["number"],
            title=pr["title"],
            commits=len(pr.get("commits", [])),
            comments=len(pr.get("comments", [])),
            reviews=len(pr.get("reviews", [])),
            created_at=pr.get("createdAt", ""),
            closed_at=pr.get("closedAt"),
            merged_at=pr.get("mergedAt"),
            time_to_merge_hours=time_to_merge,
            author=author,
            labels=labels,
            is_bot_pr=is_bot,
            is_integration_pr=is_integration
        ))

    return metrics


def fetch_issue_data(limit: int = 100) -> List[IssueMetrics]:
    """Fetch issue data from GitHub."""
    print(f"Fetching {limit} closed issues from GitHub...", file=sys.stderr)

    issue_data = run_gh_command([
        "gh", "issue", "list",
        "--limit", str(limit),
        "--state", "closed",
        "--json", "number,title,comments,createdAt,closedAt,labels"
    ])

    metrics = []
    for issue in issue_data:
        # Calculate time to close
        time_to_close = None
        if issue.get("createdAt") and issue.get("closedAt"):
            created = datetime.fromisoformat(issue["createdAt"].replace("Z", "+00:00"))
            closed = datetime.fromisoformat(issue["closedAt"].replace("Z", "+00:00"))
            time_to_close = (closed - created).total_seconds() / 3600

        metrics.append(IssueMetrics(
            number=issue["number"],
            title=issue["title"],
            comments=len(issue.get("comments", [])),
            created_at=issue.get("createdAt", ""),
            closed_at=issue.get("closedAt"),
            time_to_close_hours=time_to_close,
            labels=[label["name"] for label in issue.get("labels", [])]
        ))

    return metrics


def analyze_commit_distribution(commits: List[int]) -> Dict[str, int]:
    """Categorize commit counts into buckets."""
    distribution = {
        "1": 0,
        "2-3": 0,
        "4-5": 0,
        "6-10": 0,
        "11+": 0
    }

    for count in commits:
        if count == 1:
            distribution["1"] += 1
        elif 2 <= count <= 3:
            distribution["2-3"] += 1
        elif 4 <= count <= 5:
            distribution["4-5"] += 1
        elif 6 <= count <= 10:
            distribution["6-10"] += 1
        else:
            distribution["11+"] += 1

    return distribution


def generate_recommendations(analysis: WorkflowAnalysis) -> Dict[str, Any]:
    """Generate actionable recommendations based on analysis."""
    recommendations = {
        "commit_batching": {},
        "review_automation": {},
        "timing_optimization": {},
        "agent_configuration": {}
    }

    # Commit batching recommendations
    if analysis.median_commits_per_pr <= 2:
        recommendations["commit_batching"] = {
            "strategy": "single_commit_preferred",
            "rationale": f"Median {analysis.median_commits_per_pr} commits/PR suggests preference for atomic commits",
            "agent_config": {
                "commit_frequency": "end_of_phase",
                "squash_before_pr": False
            }
        }
    elif analysis.median_commits_per_pr <= 5:
        recommendations["commit_batching"] = {
            "strategy": "multi_commit_logical",
            "rationale": f"Median {analysis.median_commits_per_pr} commits/PR suggests incremental development",
            "agent_config": {
                "commit_frequency": "after_each_subtask",
                "squash_before_pr": False
            }
        }
    else:
        recommendations["commit_batching"] = {
            "strategy": "frequent_commits_with_squash",
            "rationale": f"Median {analysis.median_commits_per_pr} commits/PR suggests frequent iteration",
            "agent_config": {
                "commit_frequency": "after_each_file_group",
                "squash_before_pr": True
            }
        }

    # Review automation recommendations
    if analysis.prs_with_zero_reviews / analysis.total_prs > 0.8:
        recommendations["review_automation"] = {
            "strategy": "self_review_with_validation",
            "rationale": f"{analysis.prs_with_zero_reviews}/{analysis.total_prs} PRs have no formal reviews",
            "agent_config": {
                "auto_review_enabled": True,
                "post_review_comment": True,
                "require_human_approval": False,
                "validation_commands": ["lint", "typecheck", "test"]
            }
        }
    else:
        recommendations["review_automation"] = {
            "strategy": "request_human_review",
            "rationale": "Significant number of PRs have formal reviews",
            "agent_config": {
                "auto_review_enabled": True,
                "post_review_comment": True,
                "require_human_approval": True
            }
        }

    # Timing optimization
    if analysis.median_time_to_merge_hours:
        if analysis.median_time_to_merge_hours < 2:
            recommendations["timing_optimization"] = {
                "strategy": "optimize_for_speed",
                "rationale": f"Median merge time {analysis.median_time_to_merge_hours:.1f}h suggests fast iteration",
                "agent_config": {
                    "parallel_validation": True,
                    "auto_merge_on_success": True,
                    "timeout_minutes": 30
                }
            }
        elif analysis.median_time_to_merge_hours < 24:
            recommendations["timing_optimization"] = {
                "strategy": "balanced_review_time",
                "rationale": f"Median merge time {analysis.median_time_to_merge_hours:.1f}h allows for review",
                "agent_config": {
                    "parallel_validation": True,
                    "auto_merge_on_success": False,
                    "timeout_minutes": 60
                }
            }
        else:
            recommendations["timing_optimization"] = {
                "strategy": "extended_review_cycle",
                "rationale": f"Median merge time {analysis.median_time_to_merge_hours:.1f}h suggests thorough review",
                "agent_config": {
                    "parallel_validation": False,
                    "auto_merge_on_success": False,
                    "timeout_minutes": 120
                }
            }

    # Overall agent configuration
    recommendations["agent_configuration"] = {
        "recommended_workflow": "3-phase" if analysis.median_commits_per_pr <= 3 else "5-phase",
        "checkpoint_frequency": "after_each_phase",
        "retry_strategy": "exponential_backoff",
        "max_retries": 3,
        "concurrency": {
            "max_parallel_phases": 1,
            "max_parallel_agents": 2 if analysis.median_time_to_merge_hours and analysis.median_time_to_merge_hours < 2 else 1
        }
    }

    return recommendations


def analyze_workflow_patterns(pr_metrics: List[PRMetrics], issue_metrics: List[IssueMetrics]) -> WorkflowAnalysis:
    """Perform comprehensive workflow analysis."""

    # Filter out bot PRs and integration PRs for feature workflow analysis
    human_prs = [pr for pr in pr_metrics if not pr.is_bot_pr and not pr.is_integration_pr]

    # Log filtering stats
    total_prs = len(pr_metrics)
    bot_prs = sum(1 for pr in pr_metrics if pr.is_bot_pr)
    integration_prs = sum(1 for pr in pr_metrics if pr.is_integration_pr)
    print(f"Filtered {bot_prs} bot PRs and {integration_prs} integration PRs from {total_prs} total PRs", file=sys.stderr)
    print(f"Analyzing {len(human_prs)} feature PRs", file=sys.stderr)

    # PR commit analysis
    commits = [pr.commits for pr in human_prs]
    avg_commits = statistics.mean(commits) if commits else 0
    median_commits = statistics.median(commits) if commits else 0
    max_commits = max(commits) if commits else 0

    # Comment/review analysis
    comments = [pr.comments for pr in human_prs]
    avg_comments = statistics.mean(comments) if comments else 0
    median_comments = statistics.median(comments) if comments else 0

    reviews = [pr.reviews for pr in human_prs]
    avg_reviews = statistics.mean(reviews) if reviews else 0

    prs_with_zero_reviews = sum(1 for pr in human_prs if pr.reviews == 0)
    prs_with_zero_comments = sum(1 for pr in human_prs if pr.comments == 0)

    # Timing analysis
    merge_times = [pr.time_to_merge_hours for pr in human_prs if pr.time_to_merge_hours is not None]
    avg_time_to_merge = statistics.mean(merge_times) if merge_times else None
    median_time_to_merge = statistics.median(merge_times) if merge_times else None

    # Issue analysis
    issue_comments = [issue.comments for issue in issue_metrics]
    avg_issue_comments = statistics.mean(issue_comments) if issue_comments else 0

    close_times = [issue.time_to_close_hours for issue in issue_metrics if issue.time_to_close_hours is not None]
    avg_time_to_close = statistics.mean(close_times) if close_times else None

    # Bot vs Human
    bot_count = sum(1 for pr in pr_metrics if pr.is_bot_pr)
    bot_percentage = (bot_count / len(pr_metrics) * 100) if pr_metrics else 0

    # Label analysis
    all_labels = []
    for pr in human_prs:
        all_labels.extend(pr.labels)
    for issue in issue_metrics:
        all_labels.extend(issue.labels)

    label_counter = Counter(all_labels)
    top_labels = label_counter.most_common(10)

    analysis = WorkflowAnalysis(
        total_prs=len(human_prs),
        avg_commits_per_pr=avg_commits,
        median_commits_per_pr=median_commits,
        max_commits_per_pr=max_commits,
        commits_distribution=analyze_commit_distribution(commits),
        avg_comments_per_pr=avg_comments,
        median_comments_per_pr=median_comments,
        avg_reviews_per_pr=avg_reviews,
        prs_with_zero_reviews=prs_with_zero_reviews,
        prs_with_zero_comments=prs_with_zero_comments,
        avg_time_to_merge_hours=avg_time_to_merge,
        median_time_to_merge_hours=median_time_to_merge,
        total_issues=len(issue_metrics),
        avg_comments_per_issue=avg_issue_comments,
        avg_time_to_close_hours=avg_time_to_close,
        bot_pr_percentage=bot_percentage,
        human_pr_percentage=100 - bot_percentage,
        top_labels=top_labels,
        recommendations={}
    )

    # Generate recommendations
    analysis.recommendations = generate_recommendations(analysis)

    return analysis


def format_markdown_output(analysis: WorkflowAnalysis) -> str:
    """Format analysis results as markdown."""
    lines = [
        "# GitHub Workflow Pattern Analysis",
        "",
        f"**Analysis Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Summary Statistics",
        "",
        f"- **Total PRs Analyzed:** {analysis.total_prs} (feature PRs only)",
        f"- **Total Issues Analyzed:** {analysis.total_issues}",
        f"- **Bot PR Percentage:** {analysis.bot_pr_percentage:.1f}%",
        "",
        "*Note: Integration PRs (develop→main, releases) excluded from analysis to focus on feature workflow patterns.*",
        "",
        "## Pull Request Metrics",
        "",
        "### Commit Patterns",
        f"- **Average Commits per PR:** {analysis.avg_commits_per_pr:.2f}",
        f"- **Median Commits per PR:** {analysis.median_commits_per_pr:.1f}",
        f"- **Maximum Commits in a PR:** {analysis.max_commits_per_pr}",
        "",
        "**Commit Distribution:**",
    ]

    for bucket, count in analysis.commits_distribution.items():
        percentage = (count / analysis.total_prs * 100) if analysis.total_prs else 0
        lines.append(f"- {bucket} commits: {count} PRs ({percentage:.1f}%)")

    lines.extend([
        "",
        "### Review & Iteration Metrics",
        f"- **Average Comments per PR:** {analysis.avg_comments_per_pr:.2f}",
        f"- **Median Comments per PR:** {analysis.median_comments_per_pr:.1f}",
        f"- **Average Reviews per PR:** {analysis.avg_reviews_per_pr:.2f}",
        f"- **PRs with Zero Reviews:** {analysis.prs_with_zero_reviews}/{analysis.total_prs} ({analysis.prs_with_zero_reviews/analysis.total_prs*100:.1f}%)",
        f"- **PRs with Zero Comments:** {analysis.prs_with_zero_comments}/{analysis.total_prs} ({analysis.prs_with_zero_comments/analysis.total_prs*100:.1f}%)",
        "",
        "### Timing Metrics",
    ])

    if analysis.median_time_to_merge_hours:
        lines.extend([
            f"- **Average Time to Merge:** {analysis.avg_time_to_merge_hours:.2f} hours",
            f"- **Median Time to Merge:** {analysis.median_time_to_merge_hours:.2f} hours",
        ])

    lines.extend([
        "",
        "## Issue Metrics",
        "",
        f"- **Average Comments per Issue:** {analysis.avg_comments_per_issue:.2f}",
    ])

    if analysis.avg_time_to_close_hours:
        lines.append(f"- **Average Time to Close:** {analysis.avg_time_to_close_hours:.2f} hours ({analysis.avg_time_to_close_hours/24:.1f} days)")

    lines.extend([
        "",
        "## Top Labels",
        "",
    ])

    for label, count in analysis.top_labels:
        lines.append(f"- `{label}`: {count}")

    lines.extend([
        "",
        "## Recommendations for Agentic Workflows",
        "",
        "### Commit Batching Strategy",
        f"**Strategy:** `{analysis.recommendations['commit_batching']['strategy']}`",
        "",
        f"**Rationale:** {analysis.recommendations['commit_batching']['rationale']}",
        "",
        "**Agent Configuration:**",
        "```json",
        json.dumps(analysis.recommendations['commit_batching']['agent_config'], indent=2),
        "```",
        "",
        "### Review Automation",
        f"**Strategy:** `{analysis.recommendations['review_automation']['strategy']}`",
        "",
        f"**Rationale:** {analysis.recommendations['review_automation']['rationale']}",
        "",
        "**Agent Configuration:**",
        "```json",
        json.dumps(analysis.recommendations['review_automation']['agent_config'], indent=2),
        "```",
        "",
        "### Timing Optimization",
    ])

    if "timing_optimization" in analysis.recommendations:
        lines.extend([
            f"**Strategy:** `{analysis.recommendations['timing_optimization']['strategy']}`",
            "",
            f"**Rationale:** {analysis.recommendations['timing_optimization']['rationale']}",
            "",
            "**Agent Configuration:**",
            "```json",
            json.dumps(analysis.recommendations['timing_optimization']['agent_config'], indent=2),
            "```",
        ])

    lines.extend([
        "",
        "### Overall Agent Configuration",
        "```json",
        json.dumps(analysis.recommendations['agent_configuration'], indent=2),
        "```",
    ])

    return "\n".join(lines)


def format_json_output(analysis: WorkflowAnalysis) -> str:
    """Format analysis results as JSON."""
    # Convert dataclass to dict
    result = asdict(analysis)
    return json.dumps(result, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze GitHub workflow patterns for agentic automation configuration"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Number of PRs and issues to analyze (default: 100)"
    )
    parser.add_argument(
        "--format",
        choices=["json", "markdown"],
        default="markdown",
        help="Output format (default: markdown)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output file path (default: stdout)"
    )

    args = parser.parse_args()

    # Fetch data
    pr_metrics = fetch_pr_data(limit=args.limit)
    issue_metrics = fetch_issue_data(limit=args.limit)

    print(f"Analyzing {len(pr_metrics)} PRs and {len(issue_metrics)} issues...", file=sys.stderr)

    # Perform analysis
    analysis = analyze_workflow_patterns(pr_metrics, issue_metrics)

    # Format output
    if args.format == "json":
        output = format_json_output(analysis)
    else:
        output = format_markdown_output(analysis)

    # Write output
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Analysis written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
