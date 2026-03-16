#!/bin/bash
# Jules environment setup
# Docs: https://jules.google/docs/environment/

set -euo pipefail

echo "Setting up environment..."

# Diagnostic Info
echo "User: $(whoami)"
echo "Git Commit: $(git rev-parse --short HEAD) ($(git log -1 --format=%cI))"

# Install mise if missing
if ! command -v mise &> /dev/null; then
    echo "Installing mise..."
    # Pin to specific version for security and convergence
    MISE_VERSION="v2025.1.0"
    curl -L "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64" > ~/.local/bin/mise
    chmod +x ~/.local/bin/mise
    export PATH="$HOME/.local/bin:$PATH"
fi

echo "Installing tools with mise..."
mise trust
mise install

# Activate mise
eval "$(mise activate bash)"
eval "$(mise env bash)"
# Check if mise activation is already in .bashrc to avoid duplicates
if ! grep -q "mise activate bash" ~/.bashrc; then
    echo 'eval "$(mise activate bash)"' >> ~/.bashrc
fi

# Verify Environment
if command -v bun &> /dev/null; then
    echo "Bun version: $(bun --version)"
else
    echo "Error: Bun not found after mise install"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Environment ready (dependencies installed)"
