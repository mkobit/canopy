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
    MISE_VERSION="v2026.5.0"
    curl -L "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64" > ~/.local/bin/mise
    chmod +x ~/.local/bin/mise
    export PATH="$HOME/.local/bin:$PATH"
fi

echo "Installing tools with mise..."
mise trust

MAX_RETRIES=5
RETRY_DELAY=10

for ((i=1; i<=MAX_RETRIES; i++)); do
    echo "Running mise install (attempt $i of $MAX_RETRIES)..."
    if mise install; then
        echo "mise install succeeded."
        break
    else
        if [[ $i -lt $MAX_RETRIES ]]; then
            echo "mise install failed. Retrying in $RETRY_DELAY seconds..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
        else
            echo "Error: mise install failed after $MAX_RETRIES attempts."
            exit 1
        fi
    fi
done

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

if command -v bd &> /dev/null; then
    echo "Beads version: $(bd --version)"
else
    echo "Error: bd not found after mise install"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
bun install --frozen-lockfile

# Verify openspec is available
if bunx openspec --version &> /dev/null; then
    echo "OpenSpec version: $(bunx openspec --version)"
else
    echo "Error: openspec not found after bun install"
    exit 1
fi

echo "Environment ready (bun, bd, openspec installed)"
