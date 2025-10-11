#!/bin/bash
set -e

echo "🔧 Setting up development environment..."

# Update package lists
apt-get update

# Install required dependencies
apt-get install -y \
  curl \
  git \
  postgresql-client \
  jq

# Install Supabase CLI
echo "📦 Installing Supabase CLI..."
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash

# Install Claude Code CLI
echo "📦 Installing Claude Code CLI..."
curl -fsSL https://storage.googleapis.com/anthropic-release-public/claude-cli/install.sh | bash

# Make sure CLIs are in PATH
export PATH="$PATH:/root/.local/bin"

# Verify installations
echo "Verifying installations..."
supabase --version
claude --version

echo "✅ Development environment setup complete!"
echo "   • Supabase CLI installed"
echo "   • Claude Code CLI installed"
echo "   • PostgreSQL client installed"
echo ""
echo "Next steps:"
echo "  1. Run 'bun install' to install dependencies"
echo "  2. Copy .env.example to .env and configure"
echo "  3. Run 'bun run test:setup' to start Supabase Local"
echo "  4. Run 'bun run dev' to start the development server"
