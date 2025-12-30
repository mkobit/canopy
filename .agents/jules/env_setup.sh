#!/bin/bash
# Jules environment setup for pkms-graph repository
# Docs: https://jules.google/docs/environment/

set -euo pipefail

echo "Setting up pkms-graph environment..."

# Check and install tools first
TOOLS="zsh tmux vim jq curl git"
MISSING=""
for tool in $TOOLS; do
    if ! command -v "$tool" &> /dev/null; then
        MISSING="$MISSING $tool"
    fi
done

# Special check for neovim (command 'nvim', package 'neovim')
if ! command -v nvim &> /dev/null; then
    MISSING="$MISSING neovim"
fi

if [ -n "$MISSING" ]; then
    echo "Installing missing tools:$MISSING..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq $MISSING
fi

# Diagnostic Info
echo "User: $(whoami)"
echo "Git Commit: $(git rev-parse --short HEAD) ($(git log -1 --format=%cI))"

# Install pnpm if missing (though unlikely in this specific env, good for bootstrap)
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    # Attempt corepack first
    if command -v corepack &> /dev/null; then
        corepack enable
    else
        npm install -g pnpm
    fi
fi

# Verify Environment
echo "Node version: $(node --version)"
echo "PNPM version: $(pnpm --version)"

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build
echo "Building packages..."
pnpm -r build

# Test
echo "Running tests..."
pnpm test

echo "Environment ready"
