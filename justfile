# cwop-sdlc task runner
# Install just: https://github.com/casey/just

default:
    @just --list

# --- Setup ---
setup:
    bash setup.sh

# --- Gateway ---
gateway:
    bun run src/gateway/server.ts

gateway-dev:
    bun --watch run src/gateway/server.ts

# --- Pi Extensions ---
ext-builder:
    pi -e extensions/code-builder.ts

ext-review:
    pi -e extensions/code-review.ts

ext-dashboard:
    pi -e extensions/cwop-dashboard.ts

# Compose: builder + dashboard
ext-builder-dash:
    pi -e extensions/code-builder.ts -e extensions/cwop-dashboard.ts

# Compose: review + dashboard
ext-review-dash:
    pi -e extensions/code-review.ts -e extensions/cwop-dashboard.ts

# All extensions
ext-all:
    pi -e extensions/code-builder.ts -e extensions/code-review.ts -e extensions/cwop-dashboard.ts

# --- Team mode (multi-agent) ---
team:
    pi -e extensions/code-builder.ts -e extensions/code-review.ts -e extensions/cwop-dashboard.ts --agent .pi/agents/cwop-team.yaml

# --- Testing ---
test:
    bun test

test-watch:
    bun test --watch

typecheck:
    tsc --noEmit

# --- Ollama ---
ollama-status:
    @curl -sf http://localhost:11434/api/tags | python3 -m json.tool 2>/dev/null || echo "Ollama not running. Start with: ollama serve"

ollama-models:
    @curl -sf http://localhost:11434/api/tags | python3 -c "import sys,json;[print(f\"  {m['name']:30s} {m['size']/1e9:.1f}GB\") for m in json.load(sys.stdin)['models']]" 2>/dev/null || echo "Ollama not running."

# --- Cleanup ---
clean:
    rm -rf dist node_modules
