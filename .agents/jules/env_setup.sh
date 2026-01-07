#!/bin/bash
# Jules environment setup
# Docs: https://jules.google/docs/environment/

set -euo pipefail

echo "Setting up environment..."

# Check and install tools first
TOOLS="git curl gpg"
MISSING=""
for tool in $TOOLS; do
    if ! command -v "$tool" &> /dev/null; then
        MISSING="$MISSING $tool"
    fi
done

if [ -n "$MISSING" ]; then
    echo "Installing missing tools:$MISSING..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq $MISSING
fi

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

# Activate mise
eval "$(mise activate bash)"
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

echo "Importing Node.js release keys..."
# Fetch and import Node.js release keys to enable GPG verification
KEYS_URL="https://raw.githubusercontent.com/nodejs/release-keys/main/keys.list"
curl -s "$KEYS_URL" | while read -r key; do
    # Skip empty lines or comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Import key if not already present
    curl -s "https://raw.githubusercontent.com/nodejs/release-keys/main/keys/$key.asc" | gpg --batch --import >/dev/null 2>&1
done

echo "Installing tools with mise..."
mise trust
mise install

# Enable corepack to use pnpm from packageManager
echo "Enabling corepack..."
corepack enable

# Verify Environment
echo "Node version: $(node --version)"
echo "PNPM version: $(pnpm --version)"

# Install dependencies
echo "Installing dependencies..."
pnpm install

echo "Environment ready (dependencies installed)"
